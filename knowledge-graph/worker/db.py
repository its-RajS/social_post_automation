import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, String, Text, DateTime, ForeignKey, Integer, update
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
    mime_type = Column(String(100), nullable=False)


class Page(Base):
    __tablename__ = 'pages'
    id = Column(UUID(as_uuid=True), primary_key=True)
    doc_id = Column(UUID(as_uuid=True), nullable=False)
    page_number = Column(Integer, nullable=False)
    text_content = Column(Text)
    screenshot_url = Column(String(500))


class Chunk(Base):
    __tablename__ = 'chunks'
    id = Column(UUID(as_uuid=True), primary_key=True)
    doc_id = Column(UUID(as_uuid=True), nullable=False)
    page_id = Column(UUID(as_uuid=True), nullable=False)
    page_number = Column(Integer, nullable=False)
    chunk_type = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)


class KnowledgeGraphJob(Base):
    __tablename__ = 'knowledge_graph_jobs'
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
    job = KnowledgeGraphJob(id=uuid.uuid4(), doc_id=doc_id, status='queued')
    db.add(job)
    db.commit()
    return str(job.id)


def set_job_status(db: Session, job_id: str, status: str, error: str | None = None):
    db.execute(
        update(KnowledgeGraphJob)
        .where(KnowledgeGraphJob.id == job_id)
        .values(status=status, error=error, updated_at=datetime.now(timezone.utc))
    )
    db.commit()


def get_job(db: Session, job_id: str) -> KnowledgeGraphJob | None:
    return db.query(KnowledgeGraphJob).filter(KnowledgeGraphJob.id == job_id).first()


def get_latest_job(db: Session, doc_id: str) -> KnowledgeGraphJob | None:
    return db.query(KnowledgeGraphJob).filter(
        KnowledgeGraphJob.doc_id == doc_id
    ).order_by(KnowledgeGraphJob.created_at.desc()).first()


def get_document(db: Session, doc_id: str) -> Document | None:
    return db.query(Document).filter(Document.id == doc_id).first()


def get_pages(db: Session, doc_id: str) -> list[Page]:
    return db.query(Page).filter(Page.doc_id == doc_id).order_by(Page.page_number).all()


def get_chunks(db: Session, doc_id: str) -> list[Chunk]:
    return db.query(Chunk).filter(
        Chunk.doc_id == doc_id,
        Chunk.chunk_type.in_(['Title', 'NarrativeText', 'ListItem'])
    ).order_by(Chunk.page_number).all()
