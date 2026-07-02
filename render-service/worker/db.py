import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine, Column, String, Text, DateTime, update
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = os.environ['DATABASE_URL']
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Post(Base):
    __tablename__ = 'posts'
    id = Column(UUID(as_uuid=True), primary_key=True)
    template_id = Column(String(100))
    template_fields = Column(JSONB)
    image_url = Column(Text)


class RenderJob(Base):
    __tablename__ = 'render_jobs'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), nullable=False)
    status = Column(String(50), nullable=False, default='queued')
    image_url = Column(Text)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


def get_session() -> Session:
    return SessionLocal()


def create_job(db: Session, post_id: str) -> str:
    job = RenderJob(post_id=post_id, status='queued')
    db.add(job)
    db.commit()
    return str(job.id)


def set_job_status(db: Session, job_id: str, status: str, error: str | None = None, image_url: str | None = None):
    vals: dict = {'status': status, 'error': error, 'updated_at': datetime.now(timezone.utc)}
    if image_url:
        vals['image_url'] = image_url
    db.execute(update(RenderJob).where(RenderJob.id == job_id).values(**vals))
    db.commit()


def get_job(db: Session, job_id: str) -> RenderJob | None:
    return db.query(RenderJob).filter(RenderJob.id == job_id).first()


def update_post_image(db: Session, post_id: str, image_url: str):
    db.execute(update(Post).where(Post.id == post_id).values(image_url=image_url))
    db.commit()
