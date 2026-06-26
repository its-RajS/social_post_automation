from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class JobPayload(BaseModel):
    doc_id: str
    storage_path: str
    original_filename: str
    mime_type: str
    uploaded_at: str


class PageData(BaseModel):
    page_number: int
    text_content: Optional[str] = None
    ocr_text: Optional[str] = None
    layout_json: Optional[Any] = None
    has_tables: bool = False
    has_images: bool = False
    has_charts: bool = False
    word_count: int = 0


class ChunkData(BaseModel):
    page_number: int
    chunk_type: str
    text: str
    bounding_box: Optional[dict] = None


class WebhookPayload(BaseModel):
    doc_id: str
    status: str
    total_pages: int
    screenshots_base_url: str
    chunks_count: int
    processing_time_seconds: float
    error: Optional[str] = None
