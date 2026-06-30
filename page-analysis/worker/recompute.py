"""
Recompute post_potential_score for already-analyzed pages using the updated formula.
No LLM or vision cost — reads stored columns.

Usage:
    python -m worker.recompute <doc_id>   # single doc
    python -m worker.recompute            # all analyzed docs
"""
import sys
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import update as sa_update
from worker.db import SessionLocal, Page
from worker.scorer import PageScoreInput, compute_score


def _float(v) -> float:
    return float(v) if v is not None else 0.0


def _bool(v) -> bool:
    return bool(v) if v is not None else False


def recompute_doc(db, doc_id: str) -> dict:
    pages = db.query(Page).filter(
        Page.doc_id == doc_id,
        Page.analysis_status == 'analyzed',
    ).all()

    updated = 0
    for p in pages:
        inp = PageScoreInput(
            page_number=p.page_number,
            word_count=p.word_count or 0,
            has_tables=_bool(p.has_tables),
            has_charts_m1=_bool(p.has_charts),
            text_content=p.text_content or '',
            content_type=p.content_type or 'other',
            business_value=_float(p.business_value),
            product_relevance=_float(p.product_relevance),
            has_stat=_bool(p.has_stat),
            has_chart_vision=_bool(p.has_chart),
            template_fit=list(p.template_fit or []),
            confidential_risk=_float(p.confidential_risk),
            visual_quality_score=_float(p.visual_quality_score),
            text_density=_float(p.text_density),
            uniqueness_score=_float(p.uniqueness_score),
        )
        final_score, is_rejected, components = compute_score(inp)
        db.execute(
            sa_update(Page).where(Page.id == p.id).values(
                post_potential_score=final_score,
                selected_for_post=False,
            )
        )
        print(f"  page {p.page_number:3d}: {final_score:.3f} {'REJECTED' if is_rejected else ''}")
        updated += 1

    db.commit()

    # Re-select top pages
    candidates = db.query(Page).filter(
        Page.doc_id == doc_id,
        Page.post_potential_score > 0.5,
        Page.analysis_status == 'analyzed',
    ).order_by(Page.post_potential_score.desc()).limit(10).all()

    for p in candidates:
        db.execute(sa_update(Page).where(Page.id == p.id).values(selected_for_post=True))
    db.commit()

    return {'updated': updated, 'selected': len(candidates)}


def main():
    db = SessionLocal()
    try:
        if len(sys.argv) > 1:
            doc_ids = [sys.argv[1]]
        else:
            rows = db.query(Page.doc_id).filter(Page.analysis_status == 'analyzed').distinct().all()
            doc_ids = [str(r[0]) for r in rows]

        for doc_id in doc_ids:
            print(f"doc {doc_id}")
            result = recompute_doc(db, doc_id)
            print(f"  → {result['updated']} recomputed, {result['selected']} selected\n")
    finally:
        db.close()


if __name__ == '__main__':
    main()
