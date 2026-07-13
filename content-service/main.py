import logging
import os
import time

import sqlalchemy
from dotenv import load_dotenv
load_dotenv()

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from pydantic import BaseModel

from worker import db as database, pipeline
from worker.generator import generate_publication_caption, index_review_feedback
from worker.minio_client import presign

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

_start = time.time()
app = FastAPI(title='LinkedIn Automation — Content Generation (Module 5)')


@app.get('/health')
async def health():
    ok = False
    try:
        with database.engine.connect() as conn:
            conn.execute(sqlalchemy.text('SELECT 1'))
        ok = True
    except Exception:
        pass
    return {'ok': ok, 'uptime_seconds': round(time.time() - _start, 1)}


class GenerateRequest(BaseModel):
    doc_id: str
    page_id: str
    options: dict | None = None


@app.post('/api/v5/posts/generate', status_code=202)
async def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    db = database.get_session()
    try:
        job_id = database.create_job(db, req.doc_id, req.page_id)
    finally:
        db.close()
    background_tasks.add_task(pipeline.run, req.page_id, req.doc_id, job_id, req.options)
    return {'job_id': job_id, 'page_id': req.page_id, 'status': 'queued', 'estimated_seconds': 15}


@app.get('/api/v5/posts/status/{job_id}')
async def get_status(job_id: str):
    db = database.get_session()
    try:
        job = database.get_job(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail='Job not found')
        result: dict = {'job_id': job_id, 'status': job.status, 'error': job.error}
        if job.post_id:
            result['post_id'] = str(job.post_id)
        return result
    finally:
        db.close()


@app.get('/api/v5/posts/{doc_id}')
async def get_posts(doc_id: str):
    db = database.get_session()
    try:
        posts = database.get_posts_for_doc(db, doc_id)
        return {
            'doc_id': doc_id,
            'count': len(posts),
            'posts': [
                {
                    'id': str(p.id),
                    'page_id': str(p.page_id),
                    'status': p.status,
                    'template_id': p.template_id,
                    'title': p.title,
                    'caption': p.caption,
                    'hashtags': p.hashtags or [],
                    'image_url': presign(p.image_url),
                    'created_at': p.created_at.isoformat() if p.created_at else None,
                }
                for p in posts
            ],
        }
    finally:
        db.close()


class RegenerateRequest(BaseModel):
    variation: str | None = None
    tone: str | None = None
    hook_angle: str | None = None


@app.post('/api/v5/posts/{post_id}/regenerate', status_code=202)
async def regenerate(post_id: str, req: RegenerateRequest, background_tasks: BackgroundTasks):
    db = database.get_session()
    try:
        post = database.get_post(db, post_id)
        if not post:
            raise HTTPException(status_code=404, detail='Post not found')
        job_id = database.create_job(db, str(post.doc_id), str(post.page_id))
        page_id = str(post.page_id)
        doc_id = str(post.doc_id)
    finally:
        db.close()
    opts = {'tone': req.tone, 'hook_angle': req.hook_angle, 'variation': req.variation}
    background_tasks.add_task(pipeline.run, page_id, doc_id, job_id, opts)
    return {'job_id': job_id, 'status': 'queued', 'variation_of': post_id}


class FeedbackRequest(BaseModel):
    post_id: str
    review_status: str


@app.post('/api/v5/feedback/index')
async def index_feedback(req: FeedbackRequest, x_webhook_secret: str | None = Header(default=None)):
    if x_webhook_secret != os.environ.get('WEBHOOK_SECRET', ''):
        raise HTTPException(status_code=401, detail='Invalid webhook secret')
    if req.review_status not in {'PENDING', 'APPROVED', 'REJECTED'}:
        raise HTTPException(status_code=422, detail='Invalid review status')
    db = database.get_session()
    try:
        post = database.get_post(db, req.post_id)
        if not post:
            raise HTTPException(status_code=404, detail='Post not found')
        if post.review_status != req.review_status:
            return {'ok': True, 'stale': True, 'post_id': req.post_id, 'review_status': post.review_status}
        index_review_feedback(post, post.review_status)
        return {'ok': True, 'post_id': req.post_id, 'review_status': post.review_status}
    finally:
        db.close()


class PublicationCaptionRequest(BaseModel):
    post_ids: list[str]


@app.post('/api/v5/publications/caption')
async def publication_caption(req: PublicationCaptionRequest, x_webhook_secret: str | None = Header(default=None)):
    if x_webhook_secret != os.environ.get('WEBHOOK_SECRET', ''):
        raise HTTPException(status_code=401, detail='Invalid webhook secret')
    if len(req.post_ids) < 3:
        raise HTTPException(status_code=422, detail='At least three posts are required')
    db = database.get_session()
    try:
        posts = database.get_posts(db, req.post_ids)
        if len(posts) != len(req.post_ids):
            raise HTTPException(status_code=404, detail='One or more posts were not found')
        return generate_publication_caption(posts)
    finally:
        db.close()


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8004, reload=False)
