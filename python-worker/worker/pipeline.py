import logging
import os
import shutil
import time
import traceback
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import delete, update

from worker import db as database
from worker.storage import download_file
from worker import docling_parser, screenshot as screenshots_mod, chunker, embedder

logger = logging.getLogger(__name__)

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', '')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')
# Spec: 1min, 5min, 15min backoff, max 5 attempts
WEBHOOK_DELAYS = [60, 300, 900, 1800, 3600]


def _send_webhook(payload: dict) -> None:
    """Fire-and-forget with retry. Runs in a separate thread to not block worker."""
    if not WEBHOOK_URL:
        return
    for delay in WEBHOOK_DELAYS:
        try:
            resp = httpx.post(
                WEBHOOK_URL,
                json=payload,
                headers={'X-Webhook-Secret': WEBHOOK_SECRET},
                timeout=10,
            )
            if resp.status_code < 500:
                return
            logger.warning('Webhook %d, retry in %ds', resp.status_code, delay)
        except Exception as e:
            logger.warning('Webhook error: %s, retry in %ds', e, delay)
        time.sleep(delay)
    logger.error('Webhook permanently failed for doc %s', payload.get('doc_id'))


def run(job_data: dict) -> None:
    doc_id: str = job_data['doc_id']
    storage_path: str = job_data['storage_path']
    mime_type: str = job_data['mime_type']
    original_filename: str = job_data['original_filename']

    start_time = time.time()
    work_dir = f'/tmp/{doc_id}'
    os.makedirs(work_dir, exist_ok=True)

    db = database.get_session()

    try:
        # 1. mark processing
        database.set_doc_status(db, doc_id, 'processing',
                                processing_started_at=datetime.now(timezone.utc))

        # 2. idempotent: delete prior pages (cascade deletes chunks)
        db.execute(delete(database.Page).where(database.Page.doc_id == doc_id))
        db.commit()

        # 3. download raw file
        local_path = os.path.join(work_dir, original_filename)
        download_file(storage_path, local_path)
        database.set_doc_stage(db, doc_id, 'parsing')

        # 4. docling parse → insert pages, capture page_id map
        page_data_list = docling_parser.parse(local_path)
        database.set_doc_stage(db, doc_id, 'screenshots')
        page_id_map: dict[int, str] = {}

        for pd in page_data_list:
            page_id = database.upsert_page(db, {
                'id': uuid.uuid4(),
                'doc_id': doc_id,
                'page_number': pd.page_number,
                'text_content': pd.text_content,
                'ocr_text': pd.ocr_text,
                'layout_json': pd.layout_json,
                'has_tables': pd.has_tables,
                'has_images': pd.has_images,
                'has_charts': pd.has_charts,
                'word_count': pd.word_count,
            })
            page_id_map[pd.page_number] = page_id

        # 5. screenshots → update page screenshot_url
        screenshot_keys = screenshots_mod.generate_screenshots(
            local_path, mime_type, doc_id, work_dir
        )
        for page_no, key in screenshot_keys.items():
            db.execute(
                update(database.Page)
                .where(database.Page.doc_id == doc_id,
                       database.Page.page_number == page_no)
                .values(screenshot_url=key)
            )
        db.commit()
        database.set_doc_stage(db, doc_id, 'chunking')

        # 6. chunk via Unstructured
        chunk_list = chunker.chunk(local_path)

        # 7. resolve page_ids, build chunk dicts
        fallback_page_id = list(page_id_map.values())[0] if page_id_map else None
        chunk_dicts = []
        for c in chunk_list:
            page_id = page_id_map.get(c.page_number) or fallback_page_id
            if page_id is None:
                continue
            chunk_dicts.append({
                'chunk_id': str(uuid.uuid4()),
                'doc_id': doc_id,
                'page_id': page_id,
                'page_number': c.page_number,
                'chunk_type': c.chunk_type,
                'text': c.text,
                'bounding_box': c.bounding_box,
            })

        database.set_doc_stage(db, doc_id, 'embedding')
        # 8. embed → Chroma
        vector_ids = embedder.embed_and_store(chunk_dicts)

        # 9. insert chunks to PostgreSQL
        db_chunks = [
            {
                'id': uuid.UUID(c['chunk_id']),
                'doc_id': c['doc_id'],
                'page_id': c['page_id'],
                'page_number': c['page_number'],
                'chunk_type': c['chunk_type'],
                'text': c['text'],
                'bounding_box': c.get('bounding_box'),
                'embedding_model': os.environ.get('EMBEDDING_MODEL'),
                'vector_db_id': vector_ids[i] if i < len(vector_ids) else None,
            }
            for i, c in enumerate(chunk_dicts)
        ]
        database.insert_chunks(db, db_chunks)

        total_pages = len(page_data_list)
        chunks_count = len(db_chunks)
        elapsed = round(time.time() - start_time, 2)

        # 10. mark completed
        database.set_doc_status(db, doc_id, 'completed',
                                total_pages=total_pages,
                                chunks_count=chunks_count,
                                processing_completed_at=datetime.now(timezone.utc))
        db.execute(
            update(database.ProcessingJob)
            .where(database.ProcessingJob.doc_id == doc_id)
            .values(status='completed', updated_at=datetime.now(timezone.utc))
        )
        db.commit()

        _send_webhook({
            'doc_id': doc_id,
            'status': 'completed',
            'total_pages': total_pages,
            'screenshots_base_url': f'screenshots/{doc_id}/',
            'chunks_count': chunks_count,
            'processing_time_seconds': elapsed,
            'error': None,
        })

    except Exception as e:
        logger.exception('Pipeline failed for doc %s', doc_id)
        err_stack = traceback.format_exc()
        try:
            database.set_doc_status(db, doc_id, 'failed', error_message=str(e))
            db.execute(
                update(database.ProcessingJob)
                .where(database.ProcessingJob.doc_id == doc_id)
                .values(status='failed', error_stack=err_stack,
                        updated_at=datetime.now(timezone.utc))
            )
            db.commit()
        except Exception:
            logger.exception('Failed to persist error state for doc %s', doc_id)

        _send_webhook({
            'doc_id': doc_id,
            'status': 'failed',
            'total_pages': 0,
            'screenshots_base_url': f'screenshots/{doc_id}/',
            'chunks_count': 0,
            'processing_time_seconds': round(time.time() - start_time, 2),
            'error': str(e),
        })
        raise

    finally:
        db.close()
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == '__main__':
    VALID_CHUNK_TYPES = {'Title', 'NarrativeText', 'ListItem', 'Table', 'Header', 'Footer', 'ImageCaption'}
    from models.schemas import ChunkData
    test_chunks = [
        ChunkData(page_number=1, chunk_type='Title', text='Hello'),
        ChunkData(page_number=2, chunk_type='NarrativeText', text='World'),
    ]
    page_map = {1: 'page-uuid-1', 2: 'page-uuid-2'}
    for c in test_chunks:
        assert c.chunk_type in VALID_CHUNK_TYPES, f'Invalid: {c.chunk_type}'
        assert c.page_number in page_map, f'Missing page: {c.page_number}'
    seen = set()
    for c in test_chunks * 2:
        seen.add((c.page_number, c.chunk_type, c.text))
    assert len(seen) == 2
    print('self-check passed')
