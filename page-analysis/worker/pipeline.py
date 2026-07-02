import logging
import os
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
import chromadb

from worker import db as database, analyzer, vision, scorer
from worker.scorer import PageScoreInput, compute_score

logger = logging.getLogger(__name__)

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', '')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')
CHROMA_URL = os.environ.get('CHROMA_URL', 'http://localhost:8000')
GRAPH_SERVICE_URL = os.environ.get('GRAPH_SERVICE_URL', '')
WEBHOOK_DELAYS = [5, 30, 60, 120, 300]

_chroma = None


def _get_chroma():
    global _chroma
    if _chroma is None:
        parsed = urlparse(CHROMA_URL)
        _chroma = chromadb.HttpClient(host=parsed.hostname or 'localhost', port=parsed.port or 8000)
    return _chroma


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


def _get_uniqueness(page_id: str, doc_id: str, text: str) -> float:
    """Query Chroma: find pages in same doc similar to this page's text. Returns uniqueness (1 - max_similarity)."""
    if not text or not text.strip():
        return 0.8
    try:
        client = _get_chroma()
        collection = client.get_or_create_collection('documents')
        results = collection.query(
            query_texts=[text[:1000]],
            n_results=10,
            where={'doc_id': doc_id},
            include=['distances'],
        )
        distances = results.get('distances', [[]])[0]
        if not distances:
            return 1.0  # no similar pages found → fully unique
        # distances in Chroma are L2; convert to similarity: sim = 1 / (1 + dist)
        max_sim = max(1.0 / (1.0 + d) for d in distances if d > 0)
        return round(1.0 - max_sim, 3)
    except Exception as e:
        logger.warning('Chroma uniqueness check failed for page %s: %s', page_id, e)
        return 0.8  # safe default


def _get_graph_context(page_id: str) -> dict:
    """Optionally fetch product_relevance from Module 2."""
    if not GRAPH_SERVICE_URL:
        return {}
    try:
        resp = httpx.get(f'{GRAPH_SERVICE_URL}/api/v2/graph/context/{page_id}', timeout=5)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return {}


def run(doc_id: str, job_id: str) -> None:
    db = database.get_session()
    try:
        database.set_job_status(db, job_id, 'processing')

        pages = database.get_pages(db, doc_id)
        if not pages:
            database.set_job_status(db, job_id, 'completed')
            _send_webhook({'doc_id': doc_id, 'job_id': job_id, 'status': 'completed',
                           'selected_pages': 0, 'error': None})
            return

        # Mark all as analyzing
        for p in pages:
            database.update_page_scores(db, str(p.id), {'analysis_status': 'analyzing'})

        # Step 1: LLM content analysis (batched 10 pages)
        pages_text = [
            {'page_number': p.page_number, 'text': p.text_content or p.ocr_text or ''}
            for p in pages
        ]
        llm_results = analyzer.analyze_pages(pages_text)

        # Step 2: Score each page
        for p in pages:
            page_id = str(p.id)
            llm = llm_results.get(p.page_number, {})

            # Visual analysis
            vis = vision.analyze_image(p.screenshot_url)

            # Graph context (optional, best-effort)
            graph_ctx = _get_graph_context(page_id)
            product_relevance = float(graph_ctx.get('product_relevance', llm.get('product_relevance', 0.0)))

            # Uniqueness check via Chroma
            uniqueness = _get_uniqueness(page_id, doc_id, p.text_content or p.ocr_text or '')

            inp = PageScoreInput(
                page_number=p.page_number,
                word_count=p.word_count or 0,
                has_tables=p.has_tables or False,
                has_charts_m1=p.has_charts or False,
                text_content=p.text_content or '',
                content_type=llm.get('content_type', 'other'),
                business_value=float(llm.get('business_value', 0.0)),
                product_relevance=product_relevance,
                has_stat=bool(llm.get('has_stat', False)),
                has_chart_vision=vis['has_chart'],
                template_fit=llm.get('template_fit', []),
                confidential_risk=float(llm.get('confidential_risk', 0.0)),
                visual_quality_score=vis['visual_quality_score'],
                text_density=vis['text_density'],
                uniqueness_score=uniqueness,
            )

            final_score, is_rejected, components = compute_score(inp)

            database.update_page_scores(db, page_id, {
                'main_topic': llm.get('main_topic', ''),
                'content_type': llm.get('content_type', 'other'),
                'business_value': inp.business_value,
                'audience': llm.get('audience', []),
                'pain_points': llm.get('pain_points', []),
                'product_relevance': inp.product_relevance,
                'visual_quality_score': inp.visual_quality_score,
                'text_density': inp.text_density,
                'has_chart': inp.has_chart_vision,
                'has_stat': inp.has_stat,
                'template_fit': inp.template_fit,
                'confidential_risk': inp.confidential_risk,
                'post_potential_score': final_score,
                'uniqueness_score': inp.uniqueness_score,
                'duplicate_penalty': components.get('duplicate_penalty', 0.0),
                'analysis_status': 'analyzed',
            })

        # Step 3: Select top pages
        selected_count = database.mark_selected_pages(db, doc_id)

        # Step 4: Module 4 — classify content_type → recommended_template
        database.classify_templates(db, doc_id)

        database.set_job_status(db, job_id, 'completed')
        _send_webhook({
            'doc_id': doc_id, 'job_id': job_id, 'status': 'completed',
            'selected_pages': selected_count, 'error': None,
        })

    except Exception as e:
        logger.exception('Page analysis pipeline failed for doc %s', doc_id)
        try:
            database.set_job_status(db, job_id, 'failed', error=str(e))
        except Exception:
            pass
        _send_webhook({'doc_id': doc_id, 'job_id': job_id, 'status': 'failed',
                       'selected_pages': 0, 'error': str(e)})
        raise
    finally:
        db.close()
