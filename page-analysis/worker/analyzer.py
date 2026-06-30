import json
import logging
import os
from itertools import islice

from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))
MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o')

SYSTEM_PROMPT = """You analyze document pages for LinkedIn post potential.
For each page, return a JSON array where each item has exactly these keys:
{
  "page_number": <int>,
  "main_topic": "<string>",
  "content_type": "<insight|stat|workflow|case_study|product_education|announcement|quote|other>",
  "business_value": <float 0.0-1.0>,
  "audience": ["<role>"],
  "pain_points": ["<pain>"],
  "product_relevance": <float 0.0-1.0>,
  "has_stat": <bool>,
  "template_fit": ["<big_stat_center|insight_quote|problem_solution_split|doc_screenshot_left_text_right|case_study_card|quote_card|announcement_banner|carousel>"],
  "confidential_risk": <float 0.0-1.0>
}
Return a JSON object: {"pages": [...]}
Be strict: confidential_risk=1.0 if page contains legal notices, NDAs, or "confidential". No hallucination."""


def _batched(iterable, n):
    it = iter(iterable)
    while batch := list(islice(it, n)):
        yield batch


def analyze_pages(pages: list[dict]) -> dict[int, dict]:
    """
    pages: list of {page_number, text}
    Returns: {page_number: analysis_dict}
    """
    results = {}
    # ponytail: batch 10 pages per call per CLAUDE.md constraint
    for batch in _batched(pages, 10):
        user_content = '\n\n---\n\n'.join(
            f'[Page {p["page_number"]}]\n{p["text"][:2000]}' for p in batch
        )
        page_numbers = [p['page_number'] for p in batch]
        try:
            response = client.chat.completions.create(
                model=MODEL,
                response_format={'type': 'json_object'},
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': f'Analyze these pages:\n\n{user_content}'},
                ],
                temperature=0,
            )
            data = json.loads(response.choices[0].message.content)
            for item in data.get('pages', []):
                pn = item.get('page_number')
                if pn in page_numbers:
                    results[pn] = item
        except Exception as e:
            logger.error('OpenAI analysis failed for batch %s: %s', page_numbers, e)
            # Default safe values for failed pages
            for pn in page_numbers:
                results[pn] = {
                    'page_number': pn, 'main_topic': '', 'content_type': 'other',
                    'business_value': 0.0, 'audience': [], 'pain_points': [],
                    'product_relevance': 0.0, 'has_stat': False,
                    'template_fit': [], 'confidential_risk': 0.0,
                }
    return results
