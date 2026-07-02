import os
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright


RENDER_SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = RENDER_SERVICE_DIR.parent

os.environ.setdefault('BRAND_CONFIG_PATH', str(REPO_ROOT / 'brand' / 'brand.json'))
sys.path.insert(0, str(RENDER_SERVICE_DIR))

from worker.brand import template_defaults  # noqa: E402
from worker.renderer import _highlight_keywords, _resolve_image, _select_logo_for_template  # noqa: E402


def main() -> None:
    screenshot_path = sys.argv[1] if len(sys.argv) > 1 else ''
    output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path('/tmp/product_feature_highlight_smoke.png')

    fields = {
        **template_defaults(),
        'google_fonts_url': '',
        'feature_name': 'AI Review Without Review Chaos',
        'feature_description': 'Turn complex discovery data into fast, defensible review decisions.',
        'cta': 'Read Playbook',
        'benefit_bullet_1': 'Prioritizes the most relevant evidence first',
        'benefit_bullet_2': 'Reduces manual review volume',
        'benefit_bullet_3': 'Keeps review decisions traceable',
        'screenshot_url': _resolve_image(screenshot_path) if screenshot_path else '',
    }
    fields['logo_url'] = _select_logo_for_template('product_feature_highlight', fields)
    fields['logo_url'] = _resolve_image(fields['logo_url'])

    env = Environment(loader=FileSystemLoader(str(RENDER_SERVICE_DIR / 'templates')))
    env.filters['highlight_keywords'] = _highlight_keywords
    html = env.get_template('product_feature_highlight.html').render(**fields)

    with sync_playwright() as p:
        browser = p.chromium.launch(args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1080, 'height': 1350})
        page.set_content(html, wait_until='load')
        page.wait_for_timeout(500)
        page.screenshot(path=str(output_path), type='png', full_page=False)
        browser.close()

    print(output_path)


if __name__ == '__main__':
    main()
