import base64
import io
import re
import logging
import os
from pathlib import Path
from urllib.parse import urlparse

from markupsafe import Markup, escape
from worker.brand import load_brand, template_defaults

# Validate brand config and local font before third-party service setup.
load_brand()

import boto3
from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright
from PIL import Image

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(os.environ.get('TEMPLATES_DIR', '/app/templates'))
MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'minio')
MINIO_PORT = int(os.environ.get('MINIO_PORT', '9000'))
MINIO_ACCESS_KEY = os.environ.get('MINIO_ACCESS_KEY', 'minioadmin')
MINIO_SECRET_KEY = os.environ.get('MINIO_SECRET_KEY', 'minioadmin')
MINIO_BUCKET = os.environ.get('MINIO_BUCKET', 'linkedin-automation')
BRAND_CONFIG_PATH = Path(os.environ.get('BRAND_CONFIG_PATH', '/app/brand/brand.json'))

TEMPLATE_VIEWPORTS = {
    'product_feature_highlight': {'width': 1080, 'height': 1350},
}

_jinja: Environment | None = None
_s3 = None

_HIGHLIGHT_RE = re.compile(
    r'(\b(?:AI|GenAI|TAR|review|efficiency|accuracy|costs?|evidence)\b|\b\d+(?:\.\d+)?%)',
    re.IGNORECASE,
)


def _get_jinja() -> Environment:
    global _jinja
    if _jinja is None:
        _jinja = Environment(loader=FileSystemLoader(str(TEMPLATES_DIR)))
        _jinja.filters['highlight_keywords'] = _highlight_keywords
    return _jinja


def _highlight_keywords(value: str) -> Markup:
    escaped = str(escape(value or ''))
    highlighted = _HIGHLIGHT_RE.sub(r'<span class="text-highlight">\1</span>', escaped)
    return Markup(highlighted)


def _hex_luminance(value: str) -> float:
    color = (value or '').strip().lstrip('#')
    if len(color) != 6:
        return 0.0
    channels = [int(color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    linear = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _background_for_logo_selection(template_id: str, fields: dict) -> str:
    for key in ('background_color', 'primary_color'):
        value = (fields.get(key) or '').strip()
        if re.fullmatch(r'#?[0-9a-fA-F]{6}', value):
            return f"#{value.lstrip('#')}"
    return ''


def _select_logo_for_template(template_id: str, fields: dict) -> str:
    background = _background_for_logo_selection(template_id, fields)
    if not background:
        return fields.get('logo_url', '')

    # A lower threshold keeps the brand's vivid blue canvas on the light-logo path.
    luminance_threshold = 0.20
    logo_key = 'logo_on_dark' if _hex_luminance(background) < luminance_threshold else 'logo_on_light'
    return fields.get(logo_key, fields.get('logo_url', ''))


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            's3',
            endpoint_url=f'http://{MINIO_ENDPOINT}:{MINIO_PORT}',
            aws_access_key_id=MINIO_ACCESS_KEY,
            aws_secret_access_key=MINIO_SECRET_KEY,
        )
    return _s3


def _to_data_uri(storage_path: str) -> str:
    """Download a MinIO object and return as base64 data URI."""
    if not storage_path:
        return ''
    try:
        obj = _get_s3().get_object(Bucket=MINIO_BUCKET, Key=storage_path)
        data = obj['Body'].read()
        b64 = base64.b64encode(data).decode()
        ext = storage_path.rsplit('.', 1)[-1].lower()
        mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'webp': 'image/webp', 'gif': 'image/gif'}.get(ext, 'image/png')
        return f'data:{mime};base64,{b64}'
    except Exception as e:
        logger.warning('Cannot load asset %s: %s', storage_path, e)
        return ''


def _local_file_to_data_uri(path: Path) -> str:
    data = path.read_bytes()
    b64 = base64.b64encode(data).decode('ascii')
    ext = path.suffix.lower().lstrip('.')
    mime = {
        'svg': 'image/svg+xml',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'webp': 'image/webp',
        'gif': 'image/gif',
    }.get(ext, 'application/octet-stream')
    return f'data:{mime};base64,{b64}'


def _resolve_image(value: str) -> str:
    """Convert any image reference (path, http URL) → base64 data URI."""
    if not value or value.startswith('data:'):
        return value
    if value.startswith('http'):
        # Extract the MinIO object key: strip scheme+host+bucket prefix
        path = urlparse(value).path.lstrip('/')
        parts = path.split('/', 1)
        key = parts[1] if len(parts) == 2 else parts[0]
        return _to_data_uri(key)

    local_path = Path(value)
    if not local_path.is_absolute():
        local_path = BRAND_CONFIG_PATH.parent / local_path
    if local_path.exists():
        return _local_file_to_data_uri(local_path)

    return _to_data_uri(value)  # treat as raw MinIO key


def _upload_png(post_id: str, png_bytes: bytes) -> str:
    key = f'posts/{post_id}/final.png'
    _get_s3().put_object(Bucket=MINIO_BUCKET, Key=key, Body=png_bytes, ContentType='image/png')
    return key


def render(post_id: str, template_id: str, fields: dict) -> str:
    """Render template with fields → PNG → upload to MinIO. Returns storage path."""
    resolved = template_defaults()
    resolved.update(fields)
    resolved.pop('post_id', None)
    resolved['logo_url'] = _select_logo_for_template(template_id, resolved)
    for img_key in ('screenshot_url', 'logo_url'):
        if img_key in resolved:
            resolved[img_key] = _resolve_image(resolved[img_key])

    template = _get_jinja().get_template(f'{template_id}.html')
    html = template.render(**resolved, post_id=post_id)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        viewport = TEMPLATE_VIEWPORTS.get(template_id, {'width': 1200, 'height': 627})
        page = browser.new_page(viewport=viewport)
        page.set_content(html, wait_until='load')
        page.wait_for_timeout(500)  # let CSS settle
        png_bytes = page.screenshot(type='png', full_page=False)
        browser.close()

    return _upload_png(post_id, png_bytes)


def build_publication_pdf(publication_id: str, image_paths: list[str]) -> str:
    """Build a multi-page PDF in the supplied order, preserving each image's dimensions."""
    pages: list[Image.Image] = []
    try:
        for image_path in image_paths:
            obj = _get_s3().get_object(Bucket=MINIO_BUCKET, Key=image_path)
            data = obj['Body'].read()
            page = Image.open(io.BytesIO(data)).convert('RGB')
            pages.append(page)
        if len(pages) < 3:
            raise ValueError('At least three rendered images are required')
        output = io.BytesIO()
        pages[0].save(output, format='PDF', save_all=True, append_images=pages[1:], resolution=96.0)
        payload = output.getvalue()
        if len(payload) > 100 * 1024 * 1024:
            raise ValueError('LinkedIn documents must not exceed 100 MB')
        key = f'publications/{publication_id}/carousel.pdf'
        _get_s3().put_object(
            Bucket=MINIO_BUCKET,
            Key=key,
            Body=payload,
            ContentType='application/pdf',
        )
        return key
    finally:
        for page in pages:
            page.close()
