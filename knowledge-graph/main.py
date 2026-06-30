import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

import sqlalchemy
from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from worker import db as database, graph, pipeline

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    graph.close()


app = FastAPI(title='LinkedIn Automation — Knowledge Graph (Module 2)', lifespan=lifespan)


@app.get('/health')
async def health():
    db_ok = False
    neo4j_ok = False
    try:
        with database.engine.connect() as conn:
            conn.execute(sqlalchemy.text('SELECT 1'))
        db_ok = True
    except Exception:
        pass
    try:
        driver = graph._get_driver()
        driver.verify_connectivity()
        neo4j_ok = True
    except Exception:
        pass
    return {'ok': db_ok and neo4j_ok, 'db': db_ok, 'neo4j': neo4j_ok,
            'uptime_seconds': round(time.time() - _start_time, 1)}


class BuildRequest(BaseModel):
    doc_id: str


@app.post('/api/v2/graph/build')
async def build_graph(req: BuildRequest, background_tasks: BackgroundTasks):
    db = database.get_session()
    try:
        job_id = database.create_job(db, req.doc_id)
    finally:
        db.close()
    background_tasks.add_task(pipeline.run, req.doc_id, job_id)
    return {'job_id': job_id, 'doc_id': req.doc_id, 'status': 'queued'}


@app.get('/api/v2/graph/status/{job_id}')
async def get_status(job_id: str):
    db = database.get_session()
    try:
        job = database.get_job(db, job_id)
        if not job:
            raise HTTPException(status_code=404, detail='Job not found')
        return {'job_id': job_id, 'status': job.status, 'error': job.error}
    finally:
        db.close()


@app.get('/api/v2/graph/jobs/latest/{doc_id}')
async def get_latest_job(doc_id: str):
    db = database.get_session()
    try:
        job = database.get_latest_job(db, doc_id)
        if not job:
            return {'job_id': None, 'status': 'none', 'error': None}
        return {'job_id': str(job.id), 'status': job.status, 'error': job.error}
    finally:
        db.close()


@app.get('/api/v2/graph/entities/{doc_id}')
async def get_entities(doc_id: str):
    entities = graph.get_entities_for_doc(doc_id)
    return {'doc_id': doc_id, 'entities': entities, 'count': len(entities)}


@app.get('/api/v2/graph/context/{page_id}')
async def get_context(page_id: str):
    context = graph.get_context_for_page(page_id)
    return {'page_id': page_id, **context}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8002, reload=False)
