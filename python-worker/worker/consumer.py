import asyncio
import logging
import os
from urllib.parse import urlparse

from bullmq import Worker

from worker.pipeline import run

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379')
QUEUE_NAME = os.environ.get('QUEUE_NAME', 'document-processing')
MAX_WORKERS = int(os.environ.get('MAX_WORKERS', 2))


def _parse_redis_connection(url: str) -> dict:
    parsed = urlparse(url)
    conn = {
        'host': parsed.hostname or 'localhost',
        'port': parsed.port or 6379,
    }
    if parsed.password:
        conn['password'] = parsed.password
    return conn


async def process(job, job_token):
    logger.info('Job %s: doc %s', job.id, job.data.get('doc_id'))
    await asyncio.to_thread(run, job.data)
    return {'ok': True}


def create_worker() -> Worker:
    conn = _parse_redis_connection(REDIS_URL)
    return Worker(QUEUE_NAME, process, {
        'connection': conn,
        'concurrency': MAX_WORKERS,
    })
