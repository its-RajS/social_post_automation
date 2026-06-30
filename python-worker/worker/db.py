import os
from datetime import datetime, timezone
from typing import Optional
import uuid

from sqlalchemy import (
    create_engine, Column, String, BigInteger, Integer, Boolean,
    Text, DateTime, ForeignKey, UniqueConstraint,
    delete, update
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, insert as pg_insert
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = os.environ['DATABASE_URL']
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Document(Base):
    __tablename__ = 'documents'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    original_filename = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    file_size_bytes = Column(BigInteger)
    storage_path = Column(String(500), nullable=False)
    status = Column(String(50), nullable=False, default='pending')
    total_pages = Column(Integer)
    chunks_count = Column(Integer)
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
    processing_started_at = Column(DateTime(timezone=True))
    processing_completed_at = Column(DateTime(timezone=True))
    processing_stage = Column(String(50), default='pending')


class Page(Base):
    __tablename__ = 'pages'
    __table_args__ = (UniqueConstraint('doc_id', 'page_number'),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey('documents.id', ondelete='CASCADE'), nullable=False)
    page_number = Column(Integer, nullable=False)
    text_content = Column(Text)
    ocr_text = Column(Text)
    screenshot_url = Column(String(500))
    layout_json = Column(JSONB)
    has_tables = Column(Boolean, default=False)
    has_images = Column(Boolean, default=False)
    has_charts = Column(Boolean, default=False)
    word_count = Column(Integer)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Chunk(Base):
    __tablename__ = 'chunks'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey('documents.id', ondelete='CASCADE'), nullable=False)
    page_id = Column(UUID(as_uuid=True), ForeignKey('pages.id', ondelete='CASCADE'), nullable=False)
    page_number = Column(Integer, nullable=False)
    chunk_type = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    bounding_box = Column(JSONB)
    embedding_model = Column(String(100))
    vector_db_id = Column(String(255))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ProcessingJob(Base):
    __tablename__ = 'processing_jobs'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), ForeignKey('documents.id', ondelete='CASCADE'), nullable=False)
    queue_job_id = Column(String(255))
    worker_id = Column(String(255))
    status = Column(String(50), nullable=False, default='queued')
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    error_stack = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


def get_session() -> Session:
    return SessionLocal()


def set_doc_stage(db: Session, doc_id: str, stage: str):
    db.execute(
        update(Document).where(Document.id == doc_id).values(
            processing_stage=stage,
            updated_at=datetime.now(timezone.utc),
        )
    )
    db.commit()


def set_doc_status(db: Session, doc_id: str, status: str, **kwargs):
    db.execute(
        update(Document).where(Document.id == doc_id).values(
            status=status,
            updated_at=datetime.now(timezone.utc),
            **kwargs,
        )
    )
    db.commit()


def upsert_page(db: Session, page_data: dict) -> str:
    stmt = pg_insert(Page).values(**page_data)
    stmt = stmt.on_conflict_do_update(
        index_elements=['doc_id', 'page_number'],
        set_={k: v for k, v in page_data.items() if k not in ('doc_id', 'page_number', 'id', 'created_at')},
    )
    result = db.execute(stmt.returning(Page.id))
    db.commit()
    row = result.fetchone()
    return str(row[0])


def insert_chunks(db: Session, chunks: list[dict]):
    if chunks:
        db.execute(pg_insert(Chunk).values(chunks).on_conflict_do_nothing())
        db.commit()
