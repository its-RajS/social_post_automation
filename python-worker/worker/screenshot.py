import os
import logging
import shutil
import subprocess
from pathlib import Path

from PIL import Image
from pdf2image import convert_from_path

from worker.storage import upload_file

logger = logging.getLogger(__name__)

SCREENSHOT_DPI = int(os.environ.get('SCREENSHOT_DPI', 200))
MAX_WIDTH = 2048


def _resize(img: Image.Image) -> Image.Image:
    if img.width > MAX_WIDTH:
        ratio = MAX_WIDTH / img.width
        img = img.resize((MAX_WIDTH, int(img.height * ratio)), Image.LANCZOS)
    return img


def _pdf_to_screenshots(pdf_path: str, work_dir: str) -> list[str]:
    images = convert_from_path(pdf_path, dpi=SCREENSHOT_DPI)
    paths = []
    for i, img in enumerate(images, 1):
        img = _resize(img)
        out = os.path.join(work_dir, f'page_{i}.png')
        img.save(out, 'PNG')
        paths.append(out)
    return paths


def generate_screenshots(source_path: str, mime_type: str, doc_id: str, work_dir: str) -> dict[int, str]:
    """Returns page_number → MinIO screenshot key mapping."""
    result: dict[int, str] = {}

    try:
        if mime_type == 'application/pdf':
            local_paths = _pdf_to_screenshots(source_path, work_dir)

        elif mime_type in (
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
        ):
            subprocess.run(
                ['soffice', '--headless', '--convert-to', 'pdf', '--outdir', work_dir, source_path],
                check=True, capture_output=True,
            )
            stem = Path(source_path).stem
            pdf_path = os.path.join(work_dir, f'{stem}.pdf')
            local_paths = _pdf_to_screenshots(pdf_path, work_dir)

        elif mime_type.startswith('image/'):
            img = Image.open(source_path).convert('RGB')
            img = _resize(img)
            out = os.path.join(work_dir, 'page_1.png')
            img.save(out, 'PNG')
            local_paths = [out]

        elif mime_type == 'text/html':
            from playwright.sync_api import sync_playwright
            out = os.path.join(work_dir, 'page_1.png')
            with sync_playwright() as pw:
                browser = pw.chromium.launch()
                page = browser.new_page(viewport={'width': 1920, 'height': 1080})
                page.goto(f'file://{source_path}')
                page.screenshot(path=out, full_page=True)
                browser.close()
            img = Image.open(out)
            img = _resize(img)
            img.save(out, 'PNG')
            local_paths = [out]

        else:
            logger.warning('No screenshot handler for mime: %s', mime_type)
            return result

        for i, local_path in enumerate(local_paths, 1):
            key = f'screenshots/{doc_id}/page_{i}.png'
            try:
                upload_file(local_path, key)
                result[i] = key
            except Exception as e:
                logger.error('Screenshot upload failed page %d: %s', i, e)

    except Exception as e:
        logger.error('Screenshot generation failed: %s', e)

    return result
