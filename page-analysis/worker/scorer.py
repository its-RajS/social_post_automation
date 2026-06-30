import re
from dataclasses import dataclass
from typing import Optional

REJECT_PHRASES = re.compile(
    r'table of contents|contents|index|disclaimer|legal notice|confidential|©',
    re.IGNORECASE
)

TEMPLATE_TYPES = [
    'big_stat_center', 'insight_quote', 'problem_solution_split',
    'doc_screenshot_left_text_right', 'case_study_card', 'quote_card',
    'announcement_banner', 'carousel',
]


TYPE_MULTIPLIER = {
    'stat': 1.15,
    'case_study': 1.15,
    'insight': 1.10,
    'workflow': 1.10,
    'product_education': 1.10,
    'announcement': 1.10,
    'quote': 1.05,
    'other': 0.90,
}


@dataclass
class PageScoreInput:
    page_number: int
    word_count: int
    has_tables: bool
    has_charts_m1: bool  # from Module 1 layout detection
    text_content: str
    content_type: str
    # From LLM analyzer
    business_value: float
    product_relevance: float
    has_stat: bool
    has_chart_vision: bool  # from vision.py
    template_fit: list[str]
    confidential_risk: float
    # From vision.py
    visual_quality_score: float
    text_density: float
    # From Chroma uniqueness check
    uniqueness_score: float


def compute_score(p: PageScoreInput) -> tuple[float, bool, dict]:
    """Returns (final_score, is_rejected, score_components)."""
    text = p.text_content or ''

    # Auto-rejection checks (unchanged)
    if p.page_number == 1 and p.word_count < 100 and not p.has_tables and not p.has_charts_m1:
        return 0.0, True, {'reason': 'cover_page'}

    if REJECT_PHRASES.search(text):
        return 0.0, True, {'reason': 'rejected_phrase'}

    if p.text_density > 0.95:
        return 0.0, True, {'reason': 'text_density_too_high'}

    if p.confidential_risk > 0.7:
        return 0.0, True, {'reason': 'confidential_risk'}

    if p.visual_quality_score < 0.3:
        return 0.0, True, {'reason': 'low_visual_quality'}

    if p.uniqueness_score < 0.05:  # similarity > 0.95
        return 0.0, True, {'reason': 'duplicate'}

    has_chart = p.has_chart_vision or p.has_charts_m1

    # Bonuses (now separate from content_value)
    stat_bonus = 0.15 if p.has_stat else 0.0
    chart_bonus = 0.10 if has_chart else 0.0
    table_bonus = 0.05 if p.has_tables else 0.0

    # template_fit normalized to /5 (not /len(TEMPLATE_TYPES)=8) so 2+ matches score well
    template_fit_score = min(1.0, len(p.template_fit) / 5.0)

    # Penalize only when density > 0.6 (was 0.8 — too late)
    text_density_penalty = max(0.0, (p.text_density - 0.6) * 2.5) if p.text_density > 0.6 else 0.0
    duplicate_penalty = 0.5 if p.uniqueness_score < 0.05 else 0.0

    type_multiplier = TYPE_MULTIPLIER.get(p.content_type or 'other', 1.0)

    base = (
        p.business_value * 0.25
        + p.product_relevance * 0.20
        + p.visual_quality_score * 0.15
        + template_fit_score * 0.15
        + p.uniqueness_score * 0.10
        + stat_bonus
        + chart_bonus
        + table_bonus
    )
    penalties = p.confidential_risk * 0.15 + duplicate_penalty * 0.10 + text_density_penalty * 0.05

    final = max(0.0, min(1.0, (base - penalties) * type_multiplier))

    components = {
        'business_value': round(p.business_value, 3),
        'product_relevance': round(p.product_relevance, 3),
        'visual_quality_score': round(p.visual_quality_score, 3),
        'template_fit_score': round(template_fit_score, 3),
        'uniqueness_score': round(p.uniqueness_score, 3),
        'stat_bonus': stat_bonus,
        'chart_bonus': chart_bonus,
        'table_bonus': table_bonus,
        'type_multiplier': type_multiplier,
        'confidential_risk': round(p.confidential_risk, 3),
        'duplicate_penalty': round(duplicate_penalty, 3),
        'text_density_penalty': round(text_density_penalty, 3),
    }
    return round(final, 3), False, components


if __name__ == '__main__':
    # Self-check: cover page must score 0
    cover = PageScoreInput(
        page_number=1, word_count=50, has_tables=False, has_charts_m1=False,
        text_content='Welcome to our company', business_value=0.8, product_relevance=0.8,
        content_type='other', has_stat=True, has_chart_vision=False,
        template_fit=['big_stat_center'], confidential_risk=0.0,
        visual_quality_score=0.9, text_density=0.3, uniqueness_score=0.9,
    )
    score, rejected, _ = compute_score(cover)
    assert rejected and score == 0.0, f'Cover page should be rejected, got {score}'

    # Stat page should score > 0.5
    good = PageScoreInput(
        page_number=5, word_count=200, has_tables=False, has_charts_m1=True,
        text_content='Our product reduces costs by 40%', business_value=0.8, product_relevance=0.7,
        content_type='stat', has_stat=True, has_chart_vision=True,
        template_fit=['big_stat_center', 'insight_quote'], confidential_risk=0.0,
        visual_quality_score=0.8, text_density=0.3, uniqueness_score=0.9,
    )
    score, rejected, _ = compute_score(good)
    assert not rejected and score > 0.5, f'Good page should score > 0.5, got {score}'

    print(f'self-check passed (good page score: {score})')
