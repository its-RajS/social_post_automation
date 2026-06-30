import logging
import os
import time
import traceback

import httpx

from worker import db as database, graph, extractor

logger = logging.getLogger(__name__)

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', '')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')
WEBHOOK_DELAYS = [5, 30, 60, 120, 300]


def _send_webhook(payload: dict) -> None:
    if not WEBHOOK_URL:
        return
    for delay in WEBHOOK_DELAYS:
        try:
            resp = httpx.post(WEBHOOK_URL, json=payload,
                              headers={'X-Webhook-Secret': WEBHOOK_SECRET}, timeout=10)
            if resp.status_code < 500:
                return
            logger.warning('Webhook %d, retry in %ds', resp.status_code, delay)
        except Exception as e:
            logger.warning('Webhook error: %s, retry in %ds', e, delay)
        time.sleep(delay)
    logger.error('Webhook permanently failed for job %s', payload.get('job_id'))


def run(doc_id: str, job_id: str) -> None:
    db = database.get_session()
    try:
        database.set_job_status(db, job_id, 'processing')

        # Fetch pages + priority chunks (Title, NarrativeText, ListItem)
        pages = database.get_pages(db, doc_id)
        chunks = database.get_chunks(db, doc_id)

        # Group chunks by page_number for fast lookup
        chunk_map: dict[int, list[str]] = {}
        for c in chunks:
            chunk_map.setdefault(c.page_number, []).append(c.text)

        pages_text = [
            {
                'page_id': str(p.id),
                'page_number': p.page_number,
                'text': '\n'.join(chunk_map.get(p.page_number, [])) or (p.text_content or ''),
            }
            for p in pages
            if chunk_map.get(p.page_number) or p.text_content
        ]

        # Seed static nodes once (idempotent MERGE)
        graph.seed_static_nodes()

        # Upsert document node with real metadata
        doc = database.get_document(db, doc_id)
        graph.upsert_document_node(doc_id, doc.original_filename if doc else doc_id, doc.mime_type if doc else 'unknown')

        # Upsert page nodes
        for p in pages:
            preview = (p.text_content or '')[:200]
            graph.upsert_page_node(str(p.id), doc_id, p.page_number, preview, p.screenshot_url)

        # Extract entities via LLM (batched 5 pages)
        extraction_results = extractor.extract_entities(pages_text)

        # Write to Neo4j
        for result in extraction_results:
            graph.write_entities_and_relationships(
                result['page_id'], result['entities'], result['relationships']
            )

        database.set_job_status(db, job_id, 'completed')
        _send_webhook({'doc_id': doc_id, 'job_id': job_id, 'status': 'completed', 'error': None})

    except Exception as e:
        logger.exception('Graph pipeline failed for doc %s', doc_id)
        try:
            database.set_job_status(db, job_id, 'failed', error=str(e))
        except Exception:
            pass
        _send_webhook({'doc_id': doc_id, 'job_id': job_id, 'status': 'failed', 'error': str(e)})
        raise
    finally:
        db.close()
