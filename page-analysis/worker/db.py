import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    create_engine, Column, String, Text, DateTime, Integer, Boolean,
    ForeignKey, ARRAY, Numeric, update
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = os.environ['DATABASE_URL']
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Document(Base):
    __tablename__ = 'documents'
    id = Column(UUID(as_uuid=True), primary_key=True)
    original_filename = Column(String(255), nullable=False)


class Page(Base):
    __tablename__ = 'pages'
    id = Column(UUID(as_uuid=True), primary_key=True)
    doc_id = Column(UUID(as_uuid=True), nullable=False)
    page_number = Column(Integer, nullable=False)
    text_content = Column(Text)
    ocr_text = Column(Text)
    screenshot_url = Column(String(500))
    has_tables = Column(Boolean, default=False)
    has_images = Column(Boolean, default=False)
    has_charts = Column(Boolean, default=False)
    word_count = Column(Integer)
    # M3 analysis columns
    main_topic = Column(String(255))
    content_type = Column(String(50))
    business_value = Column(Numeric(3, 2))
    audience = Column(ARRAY(Text))
    pain_points = Column(ARRAY(Text))
    product_relevance = Column(Numeric(3, 2))
    visual_quality_score = Column(Numeric(3, 2))
    text_density = Column(Numeric(3, 2))
    has_chart = Column(Boolean, default=False)
    has_stat = Column(Boolean, default=False)
    template_fit = Column(ARRAY(Text))
    confidential_risk = Column(Numeric(3, 2))
    post_potential_score = Column(Numeric(3, 2))
    uniqueness_score = Column(Numeric(3, 2))
    duplicate_penalty = Column(Numeric(3, 2))
    analysis_status = Column(String(50), default='pending')
    selected_for_post = Column(Boolean, default=False)
    analysis_error = Column(Text)


class PageAnalysisJob(Base):
    __tablename__ = 'page_analysis_jobs'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey('documents.id', ondelete='CASCADE'), nullable=False)
    status = Column(String(50), nullable=False, default='queued')
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


def get_session() -> Session:
    return SessionLocal()


def create_job(db: Session, doc_id: str) -> str:
    job = PageAnalysisJob(id=uuid.uuid4(), doc_id=doc_id, status='queued')
    db.add(job)
    db.commit()
    return str(job.id)


def set_job_status(db: Session, job_id: str, status: str, error: str | None = None):
    db.execute(
        update(PageAnalysisJob)
        .where(PageAnalysisJob.id == job_id)
        .values(status=status, error=error, updated_at=datetime.now(timezone.utc))
    )
    db.commit()


def get_job(db: Session, job_id: str) -> PageAnalysisJob | None:
    return db.query(PageAnalysisJob).filter(PageAnalysisJob.id == job_id).first()


def get_pages(db: Session, doc_id: str) -> list[Page]:
    return db.query(Page).filter(
        Page.doc_id == doc_id,
        Page.analysis_status == 'pending'
    ).order_by(Page.page_number).all()


def get_all_pages(db: Session, doc_id: str) -> list[Page]:
    return db.query(Page).filter(Page.doc_id == doc_id).order_by(Page.page_number).all()


def update_page_scores(db: Session, page_id: str, scores: dict):
    db.execute(
        update(Page).where(Page.id == page_id).values(**scores)
    )
    db.commit()


def get_latest_job(db: Session, doc_id: str) -> PageAnalysisJob | None:
    return db.query(PageAnalysisJob).filter(
        PageAnalysisJob.doc_id == doc_id
    ).order_by(PageAnalysisJob.created_at.desc()).first()


def mark_selected_pages(db: Session, doc_id: str, max_pages: int = 10):
    """Select top N pages with score > 0.5."""
    pages = db.query(Page).filter(
        Page.doc_id == doc_id,
        Page.post_potential_score > 0.5,
        Page.analysis_status == 'analyzed'
    ).order_by(Page.post_potential_score.desc()).limit(max_pages).all()

    selected_ids = {str(p.id) for p in pages}

    # Reset all first, then mark selected
    db.execute(update(Page).where(Page.doc_id == doc_id).values(selected_for_post=False))
    for pid in selected_ids:
        db.execute(update(Page).where(Page.id == pid).values(selected_for_post=True))
    db.commit()
    return len(selected_ids)
