import logging
import os
import time

import sqlalchemy
from dotenv import load_dotenv
load_dotenv()

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel

from worker import db as database
from worker.renderer import render

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

_start = time.time()
app = FastAPI(title='LinkedIn Automation — Template Rendering (Module 6)')


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


class RenderRequest(BaseModel):
    post_id: str
    template_id: str
    fields: dict


def _run_render(post_id: str, template_id: str, fields: dict, job_id: str) -> None:
    db = database.get_session()
    try:
        database.set_job_status(db, job_id, 'processing')
        # Store the raw MinIO key, not a URL: `minio:9000` is only resolvable
        # inside the docker network, and presigned URLs would go stale in the
        # DB. Consumers (content-service) presign at read time instead.
        storage_path = render(post_id, template_id, fields)
        database.set_job_status(db, job_id, 'completed', image_url=storage_path)
        database.update_post_image(db, post_id, storage_path)
        logger.info('Render complete: post=%s key=%s', post_id, storage_path)
    except Exception as e:
        logger.exception('Render failed for post %s', post_id)
        try:
            database.set_job_status(db, job_id, 'failed', error=str(e))
        except Exception:
            pass
    finally:
        db.close()


@app.post('/api/v6/render', status_code=202)
async def render_post(req: RenderRequest, background_tasks: BackgroundTasks):
    db = database.get_session()
    try:
        job_id = database.create_job(db, req.post_id)
    finally:
        db.close()
    background_tasks.add_task(_run_render, req.post_id, req.template_id, req.fields, job_id)
    return {'render_job_id': job_id, 'status': 'processing'}


@app.get('/api/v6/render/status/{render_job_id}')
async def get_status(render_job_id: str):
    db = database.get_session()
    try:
        job = database.get_job(db, render_job_id)
        if not job:
            raise HTTPException(status_code=404, detail='Render job not found')
        return {
            'render_job_id': render_job_id,
            'status': job.status,
            'image_url': job.image_url,
            'error': job.error,
        }
    finally:
        db.close()


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8005, reload=False)
