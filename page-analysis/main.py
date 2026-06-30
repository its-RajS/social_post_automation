import logging
import os
import time

import sqlalchemy
from dotenv import load_dotenv
load_dotenv()

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from worker import db as database, pipeline

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

_start_time = time.time()

app = FastAPI(title='LinkedIn Automation — Page Analysis (Module 3)')


@app.get('/health')
async def health():
    db_ok = False
    try:
        with database.engine.connect() as conn:
            conn.execute(sqlalchemy.text('SELECT 1'))
        db_ok = True
    except Exception:
        pass
    return {'ok': db_ok, 'db': db_ok, 'uptime_seconds': round(time.time() - _start_time, 1)}


class AnalyzeRequest(BaseModel):
    doc_id: str


@app.post('/api/v3/pages/analyze')
async def analyze(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    db = database.get_session()
    try:
        job_id = database.create_job(db, req.doc_id)
    finally:
        db.close()
    background_tasks.add_task(pipeline.run, req.doc_id, job_id)
    return {'job_id': job_id, 'doc_id': req.doc_id, 'status': 'queued'}


@app.get('/api/v3/pages/analyze/status/{job_id}')
async def get_status(job_id: str):
    db = database.get_session()
    try:
        job = database.get_job(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail='Job not found')
        return {'job_id': job_id, 'status': job.status, 'error': job.error}
    finally:
        db.close()


@app.get('/api/v3/pages/jobs/latest/{doc_id}')
async def get_latest_job(doc_id: str):
    db = database.get_session()
    try:
        job = database.get_latest_job(db, doc_id)
        if not job:
            return {'job_id': None, 'status': 'none', 'error': None}
        return {'job_id': str(job.id), 'status': job.status, 'error': job.error}
    finally:
        db.close()


@app.get('/api/v3/pages/{doc_id}')
async def get_pages(doc_id: str):
    db = database.get_session()
    try:
        pages = database.get_all_pages(db, doc_id)
        return {
            'doc_id': doc_id,
            'pages': [
                {
                    'id': str(p.id),
                    'page_number': p.page_number,
                    'analysis_status': p.analysis_status,
                    'post_potential_score': float(p.post_potential_score) if p.post_potential_score else None,
                    'main_topic': p.main_topic,
                    'content_type': p.content_type,
                    'selected_for_post': p.selected_for_post,
                    'visual_quality_score': float(p.visual_quality_score) if p.visual_quality_score else None,
                    'template_fit': p.template_fit or [],
                    'has_stat': p.has_stat,
                    'has_chart': p.has_chart,
                    'audience': p.audience or [],
                    'pain_points': p.pain_points or [],
                }
                for p in pages
            ],
        }
    finally:
        db.close()


@app.get('/api/v3/pages/{doc_id}/selected')
async def get_selected(doc_id: str):
    db = database.get_session()
    try:
        pages = database.get_all_pages(db, doc_id)
        selected = [p for p in pages if p.selected_for_post]
        return {
            'doc_id': doc_id,
            'count': len(selected),
            'pages': [
                {
                    'id': str(p.id),
                    'page_number': p.page_number,
                    'post_potential_score': float(p.post_potential_score) if p.post_potential_score else None,
                    'main_topic': p.main_topic,
                    'content_type': p.content_type,
                    'screenshot_url': p.screenshot_url,
                    'template_fit': p.template_fit or [],
                    'audience': p.audience or [],
                    'pain_points': p.pain_points or [],
                }
                for p in selected
            ],
        }
    finally:
        db.close()


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8003, reload=False)
