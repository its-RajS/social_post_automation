import logging
import os
import time
import uuid
from datetime import datetime, timezone

import httpx

from worker import db as database
from worker.brand import load_brand
from worker.generator import generate_content

logger = logging.getLogger(__name__)

WEBHOOK_URL = os.environ.get('WEBHOOK_URL', '')
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', '')
RENDER_SERVICE_URL = os.environ.get('RENDER_SERVICE_URL', 'http://render-service:8005')

BRAND = load_brand()


def _send_webhook(payload: dict) -> None:
    if not WEBHOOK_URL:
        return
    for delay in (5, 30, 60):
        try:
            r = httpx.post(WEBHOOK_URL, json=payload,
                           headers={'X-Webhook-Secret': WEBHOOK_SECRET}, timeout=10)
            if r.status_code < 500:
                return
        except Exception as e:
            logger.warning('Webhook error: %s', e)
        time.sleep(delay)


def _build_template_fields(content: dict, template_id: str, screenshot_url: str, post_id: str) -> dict:
    base = {'post_id': post_id}
    if template_id == 'big_stat_center':
        return {**base,
                'stat_value': content.get('stat_value', ''),
                'stat_label': content.get('stat_label', ''),
                'subtitle': content.get('subtitle', ''),
                'source_label': 'Research'}
    if template_id == 'problem_solution_split':
        return {**base,
                'problem_title': content.get('problem_title', ''),
                'problem_body': content.get('problem_body', ''),
                'solution_title': content.get('solution_title', ''),
                'solution_body': content.get('solution_body', '')}
    if template_id == 'quote_card':
        return {**base,
                'quote': content.get('quote', content.get('title', '')),
                'attribution': content.get('attribution', '')}
    if template_id == 'product_feature_highlight':
        return {**base,
                'feature_name': content.get('feature_name', content.get('title', '')),
                'feature_description': content.get('feature_description', content.get('subtitle', '')),
                'cta': content.get('cta', 'Read Playbook'),
                'benefit_bullet_1': content.get('benefit_bullet_1', ''),
                'benefit_bullet_2': content.get('benefit_bullet_2', ''),
                'benefit_bullet_3': content.get('benefit_bullet_3', ''),
                'screenshot_url': screenshot_url}
    if template_id == 'announcement_card':
        return {**base,
                'headline': content.get('headline', content.get('title', '')),
                'body': content.get('body', content.get('subtitle', '')),
                'cta': content.get('cta', 'Learn More'),
                'date': datetime.now(timezone.utc).strftime('%B %d, %Y')}
    # default: case_study_hero, doc_screenshot_left_text_right, big_insight
    return {**base,
            'title': content.get('title', ''),
            'subtitle': content.get('subtitle', ''),
            'cta': content.get('cta', 'Learn More'),
            'screenshot_url': screenshot_url}


def _trigger_render(post_id: str, template_id: str, fields: dict) -> None:
    try:
        r = httpx.post(f'{RENDER_SERVICE_URL}/api/v6/render',
                       json={'post_id': post_id, 'template_id': template_id, 'fields': fields},
                       timeout=10)
        if r.status_code not in (200, 202):
            logger.warning('Render trigger returned %d: %s', r.status_code, r.text[:200])
    except Exception as e:
        logger.warning('Render trigger failed: %s', e)


def _brand_rules_checked() -> list[str]:
    voice = BRAND['voice']
    checked: list[str] = []
    checked.extend(f"avoid_phrase:{phrase}" for phrase in voice.get('avoid_phrases', []))
    checked.extend(f"requirement:{rule}" for rule in voice.get('require', []))
    return checked


def run(page_id: str, doc_id: str, job_id: str, options: dict | None = None) -> None:
    db = database.get_session()
    try:
        database.set_job_status(db, job_id, 'processing')

        page = database.get_page(db, page_id)
        if not page:
            raise ValueError(f'Page {page_id} not found')

        content = generate_content(page, options)

        template_id = page.recommended_template or 'doc_screenshot_left_text_right'
        post_id = str(uuid.uuid4())
        template_fields = _build_template_fields(content, template_id, page.screenshot_url or '', post_id)

        # Derive primary title-like field for the DB title column
        title = (content.get('title')
                 or content.get('headline')
                 or content.get('stat_label')
                 or content.get('feature_name')
                 or content.get('quote', '')[:80])

        database.save_post(db, {
            'id': post_id,
            'page_id': page_id,
            'doc_id': doc_id,
            'status': 'completed',
            'title': title,
            'subtitle': content.get('subtitle', ''),
            'cta': content.get('cta', ''),
            'caption': content.get('caption', ''),
            'hashtags': content.get('hashtags', []),
            'hook_angle': content.get('hook_angle', ''),
            'tone': content.get('tone', ''),
            'template_id': template_id,
            'template_fields': template_fields,
            'context': {
                'main_topic': page.main_topic,
                'content_type': page.content_type,
                'audience': page.audience or [],
                'pain_points': page.pain_points or [],
                'products_mentioned': content.get('products_mentioned', []),
                'benefits_highlighted': content.get('benefits_highlighted', []),
                'why_this_page': content.get('why_this_page', ''),
            },
            'brand_compliance': {
                'rules_checked': _brand_rules_checked(),
                'violations': [],
            },
        })

        database.set_job_status(db, job_id, 'completed', post_id=post_id)
        _send_webhook({'doc_id': doc_id, 'page_id': page_id, 'job_id': job_id,
                       'post_id': post_id, 'status': 'completed', 'error': None})
        _trigger_render(post_id, template_id, template_fields)

    except Exception as e:
        logger.exception('Content generation failed for page %s', page_id)
        try:
            database.set_job_status(db, job_id, 'failed', error=str(e))
        except Exception:
            pass
        _send_webhook({'doc_id': doc_id, 'page_id': page_id, 'job_id': job_id,
                       'status': 'failed', 'error': str(e)})
        raise
    finally:
        db.close()
