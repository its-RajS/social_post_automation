import logging
import os
from io import BytesIO
from urllib.parse import urlparse

import boto3
import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

_s3 = None


def _get_s3():
    global _s3
    if _s3 is None:
        endpoint = os.environ.get('MINIO_ENDPOINT', 'minio')
        port = int(os.environ.get('MINIO_PORT', '9000'))
        _s3 = boto3.client(
            's3',
            endpoint_url=f'http://{endpoint}:{port}',
            aws_access_key_id=os.environ.get('MINIO_ACCESS_KEY', 'minioadmin'),
            aws_secret_access_key=os.environ.get('MINIO_SECRET_KEY', 'minioadmin'),
        )
    return _s3


def _load_image(screenshot_url: str) -> np.ndarray | None:
    """Load image from MinIO storage path (e.g. screenshots/doc_id/page_1.png)."""
    if not screenshot_url:
        return None
    try:
        bucket = os.environ.get('MINIO_BUCKET', 'linkedin-automation')
        s3 = _get_s3()
        obj = s3.get_object(Bucket=bucket, Key=screenshot_url)
        data = obj['Body'].read()
        img = Image.open(BytesIO(data)).convert('RGB')
        return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    except Exception as e:
        logger.warning('Failed to load screenshot %s: %s', screenshot_url, e)
        return None


def analyze_image(screenshot_url: str | None) -> dict:
    """Returns visual analysis metrics for a page screenshot."""
    default = {
        'visual_quality_score': 0.5,
        'text_density': 0.5,
        'has_chart': False,
    }
    if not screenshot_url:
        return default

    img = _load_image(screenshot_url)
    if img is None:
        return default

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Sharpness via Laplacian variance, normalized to 0-1 (cap at 500)
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    visual_quality = min(1.0, sharpness / 500.0)

    # Text density: ratio of "dark" pixels (text) to total
    _, thresh = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)
    text_density = float(np.sum(thresh > 0)) / float(thresh.size)
    text_density = min(1.0, text_density)

    # Chart detection: many contours with varied aspect ratios → likely chart/diagram
    edges = cv2.Canny(gray, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    has_chart = len(contours) > 20  # ponytail: simple heuristic, tune if false positives

    return {
        'visual_quality_score': round(visual_quality, 3),
        'text_density': round(text_density, 3),
        'has_chart': has_chart,
    }
