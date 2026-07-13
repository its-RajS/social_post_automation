import json
import logging
import os
from urllib.parse import urlparse

import httpx
from openai import OpenAI
from worker.brand import load_brand

logger = logging.getLogger(__name__)

_openai = None
BRAND = load_brand()

# Template-specific field instructions injected into the system prompt
_TEMPLATE_INSTRUCTIONS = {
    'big_stat_center': (
        'stat_value (string, max 10 chars — e.g. "12 hrs", "83%"), '
        'stat_label (string, max 80 chars — what the stat measures), '
        'subtitle (string, max 100 chars — context/insight about the stat)'
    ),
    'problem_solution_split': (
        'problem_title (string, max 60 chars), '
        'problem_body (string, max 200 chars), '
        'solution_title (string, max 60 chars), '
        'solution_body (string, max 200 chars)'
    ),
    'quote_card': (
        'quote (string, max 200 chars — key quote or insight), '
        'attribution (string, max 60 chars — source or speaker)'
    ),
    'product_feature_highlight': (
        'feature_name (string, max 40 chars), '
        'feature_description (string, max 120 chars), '
        'cta (string, max 24 chars — direct action label), '
        'benefit_bullet_1 (string, max 60 chars), '
        'benefit_bullet_2 (string, max 60 chars), '
        'benefit_bullet_3 (string, max 60 chars)'
    ),
    'announcement_card': (
        'headline (string, max 60 chars — announcement headline), '
        'body (string, max 200 chars), '
        'cta (string, max 30 chars)'
    ),
}
_DEFAULT_INSTRUCTIONS = (
    'title (string, max 80 chars), '
    'subtitle (string, max 100 chars), '
    'cta (string, max 30 chars — call to action button text)'
)

def _brand_rules_prompt() -> str:
    voice = BRAND['voice']
    avoid = ', '.join(f'"{phrase}"' for phrase in voice.get('avoid_phrases', []))
    required = '\n'.join(f"- {rule}" for rule in voice.get('require', []))
    return f"""BRAND RULES (enforce strictly):
- Never write these phrases: {avoid}
- Be confident, empathetic, data-backed, conversational
{required}"""


def _get_openai() -> OpenAI:
    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=os.environ['OPENAI_API_KEY'])
    return _openai


def _get_kg_context(page_id: str) -> dict:
    url = os.environ.get('KNOWLEDGE_GRAPH_URL', 'http://knowledge-graph:8002')
    try:
        r = httpx.get(f'{url}/api/v2/graph/context/{page_id}', timeout=5)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning('KG context unavailable for page %s: %s', page_id, e)
    return {}


def _get_review_feedback(topic: str, template_id: str) -> tuple[list[str], list[str]]:
    chroma_url = os.environ.get('CHROMA_URL', 'http://chroma:8000')
    collection_name = os.environ.get('POST_FEEDBACK_COLLECTION', 'post_review_feedback')
    try:
        import chromadb
        parsed = urlparse(chroma_url)
        client = chromadb.HttpClient(host=parsed.hostname or 'localhost', port=parsed.port or 8000)
        col = client.get_or_create_collection(collection_name)
        if col.count() == 0:
            return [], []
        results = col.query(
            query_texts=[(topic or 'LinkedIn post')[:500]],
            n_results=min(12, col.count()),
            where={'template_id': template_id},
            include=['documents', 'metadatas'],
        )
        approved: list[str] = []
        rejected: list[str] = []
        documents = results.get('documents', [[]])[0]
        metadatas = results.get('metadatas', [[]])[0]
        for document, metadata in zip(documents, metadatas):
            if metadata.get('review_status') == 'APPROVED' and len(approved) < 3:
                approved.append(document)
            if metadata.get('review_status') == 'REJECTED' and len(rejected) < 3:
                rejected.append(document)
        return approved, rejected
    except Exception as e:
        logger.warning('Chroma review feedback unavailable: %s', e)
    return [], []


def index_review_feedback(post, review_status: str) -> None:
    chroma_url = os.environ.get('CHROMA_URL', 'http://chroma:8000')
    collection_name = os.environ.get('POST_FEEDBACK_COLLECTION', 'post_review_feedback')
    import chromadb
    parsed = urlparse(chroma_url)
    client = chromadb.HttpClient(host=parsed.hostname or 'localhost', port=parsed.port or 8000)
    col = client.get_or_create_collection(collection_name)
    post_id = str(post.id)
    if review_status == 'PENDING':
        try:
            col.delete(ids=[post_id])
        except Exception:
            pass
        return

    document = json.dumps({
        'title': post.title or '',
        'caption': post.caption or '',
        'hashtags': post.hashtags or [],
        'template_fields': post.template_fields or {},
        'context': post.context or {},
    }, ensure_ascii=False)
    col.upsert(
        ids=[post_id],
        documents=[document],
        metadatas=[{
            'post_id': post_id,
            'template_id': post.template_id or 'unknown',
            'review_status': review_status,
        }],
    )


def generate_content(page, options: dict | None = None) -> dict:
    """Call OpenAI to generate LinkedIn post content for the given page."""
    options = options or {}
    template_id = page.recommended_template or 'doc_screenshot_left_text_right'

    kg = _get_kg_context(str(page.id))
    products = kg.get('products', [])
    benefits = kg.get('benefits', [])

    approved_posts, rejected_posts = _get_review_feedback(page.main_topic or '', template_id)
    approved_posts_text = '\n---\n'.join(approved_posts) if approved_posts else 'None available.'
    rejected_posts_text = '\n---\n'.join(rejected_posts) if rejected_posts else 'None available.'

    template_fields_spec = _TEMPLATE_INSTRUCTIONS.get(template_id, _DEFAULT_INSTRUCTIONS)
    tone_pref = options.get('tone', 'authoritative_empathetic')
    hook_pref = options.get('hook_angle', 'auto')

    system = f"""You are a senior LinkedIn content strategist for a B2B SaaS company.
Generate LinkedIn post content based on a document page. Output valid JSON only.

{_brand_rules_prompt()}

OUTPUT JSON must contain:
- caption: LinkedIn caption, 150-300 words, 2-4 paragraphs (string)
- hashtags: array of 3-5 hashtag strings (include #)
- hook_angle: one of [pain_point_first, stat_first, question_first, story_first, insight_first]
- tone: one of [authoritative_empathetic, casual, provocative, educational]
- why_this_page: 1-sentence explanation of why this page makes a strong post (string)

PLUS template-specific fields for template "{template_id}":
{template_fields_spec}

Additional rules:
- If has_stat=true, lead caption and title/stat_value with the statistic
- If content_type is case_study, include a customer outcome in the caption
- If content_type is problem_solution, state the problem in the first sentence
- Prefer tone: {tone_pref}
- Prefer hook: {hook_pref if hook_pref != 'auto' else 'choose best for content type'}"""

    user = f"""PAGE DETAILS:
Topic: {page.main_topic or 'Not specified'}
Content Type: {page.content_type or 'other'}
Template: {template_id}
Audience: {', '.join(page.audience or []) or 'Business professionals'}
Pain Points: {', '.join(page.pain_points or []) or 'Not specified'}
Has Stat: {page.has_stat}
Has Chart: {page.has_chart}

PAGE TEXT (first 2000 chars):
{(page.text_content or page.ocr_text or '')[:2000]}

KNOWLEDGE GRAPH:
Products/Services: {', '.join(products) if products else 'Not available'}
Benefits: {', '.join(benefits) if benefits else 'Not available'}

APPROVED REFERENCES FOR THIS TEMPLATE:
Use their high-level structure, clarity, and tone as positive guidance. Never copy wording.
{approved_posts_text}

REJECTED REFERENCES FOR THIS TEMPLATE:
Treat these as negative examples. Avoid repeating their content and stylistic patterns. Never copy wording.
{rejected_posts_text}"""

    resp = _get_openai().chat.completions.create(
        model=os.environ.get('OPENAI_MODEL', 'gpt-4o'),
        messages=[
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': user},
        ],
        response_format={'type': 'json_object'},
        temperature=0.7,
    )

    content = json.loads(resp.choices[0].message.content)
    content['products_mentioned'] = products
    content['benefits_highlighted'] = benefits
    return content


def generate_publication_caption(posts: list) -> dict:
    source = [
        {
            'title': post.title,
            'caption': post.caption,
            'hashtags': post.hashtags or [],
            'context': post.context or {},
        }
        for post in posts
    ]
    response = _get_openai().chat.completions.create(
        model=os.environ.get('OPENAI_MODEL', 'gpt-4o'),
        messages=[
            {
                'role': 'system',
                'content': f"""You combine several approved LinkedIn designs into one coherent document post.
{_brand_rules_prompt()}
Return valid JSON only with caption (150-300 words), hashtags (3-5 strings including #), and title (max 80 chars).
Create a connected narrative that follows the supplied page order. Do not mention that AI combined the posts.""",
            },
            {'role': 'user', 'content': json.dumps(source, ensure_ascii=False)},
        ],
        response_format={'type': 'json_object'},
        temperature=0.5,
    )
    return json.loads(response.choices[0].message.content)
