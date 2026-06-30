import json
import logging
import os
from itertools import islice

from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', ''))
MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o')

SYSTEM_PROMPT = """You extract structured business knowledge from document text.
Return JSON with exactly these keys:
{
  "entities": [
    {"label": "<Company|Product|Service|Feature|Audience|PainPoint|Benefit|UseCase|Industry>",
     "name": "<unique name>",
     "properties": {"description": "...", "category": "..."}}
  ],
  "relationships": [
    {"from": "<entity name>", "type": "<OFFERS|HAS_FEATURE|SOLVES|AFFECTS|PROVIDES|HAS_USE_CASE|TARGETS|SERVES>", "to": "<entity name>"}
  ]
}
Only include entities clearly stated in the text. No hallucination."""


def _batched(iterable, n):
    it = iter(iterable)
    while batch := list(islice(it, n)):
        yield batch


def extract_entities(pages_text: list[dict]) -> list[dict]:
    """pages_text: list of {page_id, page_number, text}. Returns list of {page_id, entities, relationships}."""
    results = []
    # ponytail: batch 5 pages per call per CLAUDE.md constraint
    for batch in _batched(pages_text, 5):
        user_content = '\n\n---\n\n'.join(
            f'[Page {p["page_number"]}]\n{p["text"][:3000]}' for p in batch
        )
        try:
            response = client.chat.completions.create(
                model=MODEL,
                response_format={'type': 'json_object'},
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': f'Extract entities and relationships from these document pages:\n\n{user_content}'},
                ],
                temperature=0,
            )
            data = json.loads(response.choices[0].message.content)
            entities = data.get('entities', [])
            relationships = data.get('relationships', [])
            # Distribute entities to all pages in batch (graph is doc-level, page links via MENTIONS)
            for p in batch:
                results.append({'page_id': p['page_id'], 'entities': entities, 'relationships': relationships})
        except Exception as e:
            logger.error('OpenAI extraction failed for batch starting page %s: %s', batch[0]['page_number'], e)
            for p in batch:
                results.append({'page_id': p['page_id'], 'entities': [], 'relationships': []})
    return results
