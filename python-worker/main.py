import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

import psutil
from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

from worker.consumer import create_worker
from worker.db import engine

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

_start_time = time.time()
_worker = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker
    _worker = create_worker()
    logger.info('BullMQ worker started on queue: %s', os.environ.get('QUEUE_NAME', 'document-processing'))
    yield
    if _worker:
        await _worker.close()


app = FastAPI(title='LinkedIn Automation Worker', lifespan=lifespan)


@app.get('/health')
async def health():
    import redis as redis_lib
    redis_ok = False
    try:
        r = redis_lib.from_url(os.environ.get('REDIS_URL', 'redis://localhost:6379'))
        r.ping()
        redis_ok = True
    except Exception:
        pass

    db_ok = False
    try:
        import sqlalchemy
        with engine.connect() as conn:
            conn.execute(sqlalchemy.text('SELECT 1'))
        db_ok = True
    except Exception:
        pass

    return {
        'ok': redis_ok and db_ok,
        'redis': redis_ok,
        'db': db_ok,
        'uptime_seconds': round(time.time() - _start_time, 1),
    }


@app.get('/metrics')
async def metrics():
    proc = psutil.Process()
    return {
        'memory_mb': round(proc.memory_info().rss / 1024 / 1024, 1),
        'cpu_percent': proc.cpu_percent(interval=0.1),
        'uptime_seconds': round(time.time() - _start_time, 1),
    }


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8001, reload=False)
