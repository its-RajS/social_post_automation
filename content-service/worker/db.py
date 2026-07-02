import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine, Column, String, Text, DateTime, Boolean, Integer,
    ARRAY, Numeric, update
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = os.environ['DATABASE_URL']
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Page(Base):
    __tablename__ = 'pages'
    id = Column(UUID(as_uuid=True), primary_key=True)
    doc_id = Column(UUID(as_uuid=True), nullable=False)
    page_number = Column(Integer, nullable=False)
    text_content = Column(Text)
    ocr_text = Column(Text)
    screenshot_url = Column(String(500))
    main_topic = Column(String(255))
    content_type = Column(String(50))
    business_value = Column(Numeric(3, 2))
    audience = Column(ARRAY(Text))
    pain_points = Column(ARRAY(Text))
    has_chart = Column(Boolean, default=False)
    has_stat = Column(Boolean, default=False)
    template_fit = Column(ARRAY(Text))
    post_potential_score = Column(Numeric(3, 2))
    selected_for_post = Column(Boolean, default=False)
    recommended_template = Column(String(100))


class Post(Base):
    __tablename__ = 'posts'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_id = Column(UUID(as_uuid=True), nullable=False)
    doc_id = Column(UUID(as_uuid=True), nullable=False)
    status = Column(String(50), nullable=False, default='pending')
    title = Column(Text)
    subtitle = Column(Text)
    cta = Column(Text)
    caption = Column(Text)
    hashtags = Column(ARRAY(Text))
    hook_angle = Column(String(50))
    tone = Column(String(50))
    template_id = Column(String(100))
    template_fields = Column(JSONB)
    context = Column(JSONB)
    brand_compliance = Column(JSONB)
    variation_of = Column(UUID(as_uuid=True), nullable=True)
    variation_type = Column(String(50), nullable=True)
    image_url = Column(Text, nullable=True)
    error_message = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class PostGenerationJob(Base):
    __tablename__ = 'post_generation_jobs'
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    doc_id = Column(UUID(as_uuid=True), nullable=False)
    page_id = Column(UUID(as_uuid=True), nullable=False)
    post_id = Column(UUID(as_uuid=True), nullable=True)
    status = Column(String(50), nullable=False, default='queued')
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


def get_session() -> Session:
    return SessionLocal()


def create_job(db: Session, doc_id: str, page_id: str) -> str:
    job = PostGenerationJob(doc_id=doc_id, page_id=page_id, status='queued')
    db.add(job)
    db.commit()
    return str(job.id)


def set_job_status(db: Session, job_id: str, status: str, error: str | None = None, post_id: str | None = None):
    vals: dict = {'status': status, 'error': error, 'updated_at': datetime.now(timezone.utc)}
    if post_id:
        vals['post_id'] = post_id
    db.execute(update(PostGenerationJob).where(PostGenerationJob.id == job_id).values(**vals))
    db.commit()


def get_job(db: Session, job_id: str) -> PostGenerationJob | None:
    return db.query(PostGenerationJob).filter(PostGenerationJob.id == job_id).first()


def get_page(db: Session, page_id: str) -> Page | None:
    return db.query(Page).filter(Page.id == page_id).first()


def get_posts_for_doc(db: Session, doc_id: str) -> list[Post]:
    return db.query(Post).filter(Post.doc_id == doc_id).order_by(Post.created_at.desc()).all()


def get_post(db: Session, post_id: str) -> Post | None:
    return db.query(Post).filter(Post.id == post_id).first()


def save_post(db: Session, post_data: dict) -> str:
    post = Post(**post_data)
    db.add(post)
    db.commit()
    return str(post.id)
