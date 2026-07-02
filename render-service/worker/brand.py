import base64
import json
import mimetypes
import os
from pathlib import Path
from typing import Any

BRAND_CONFIG_PATH = Path(os.environ.get('BRAND_CONFIG_PATH', '/app/brand/brand.json'))

_REQUIRED_COLORS = ('primary', 'secondary', 'accent', 'background', 'dark_text')
_brand: dict[str, Any] | None = None
_font_face_css: str | None = None


def _require_mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise ValueError(f'brand config missing object: {key}')
    return value


def _resolve_brand_path(value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = BRAND_CONFIG_PATH.parent / path
    return path


def _font_path(font: dict[str, Any], key: str) -> Path:
    local_path = font.get(key) or font.get('local_path')
    if not local_path:
        raise ValueError(f'brand config missing font.{key} or font.local_path')
    return _resolve_brand_path(local_path)


def _validate_brand(data: dict[str, Any]) -> dict[str, Any]:
    colors = _require_mapping(data, 'colors')
    missing_colors = [key for key in _REQUIRED_COLORS if not colors.get(key)]
    if missing_colors:
        raise ValueError(f'brand config missing colors: {", ".join(missing_colors)}')

    font = _require_mapping(data, 'font')
    if not font.get('heading_family') or not font.get('body_family'):
        raise ValueError('brand config missing font.heading_family or font.body_family')
    for key in ('heading_local_path', 'body_local_path'):
        path = _font_path(font, key)
        if not path.exists():
            raise ValueError(f'brand font not found for {key}: {path}')

    voice = _require_mapping(data, 'voice')
    if not isinstance(voice.get('avoid_phrases'), list):
        raise ValueError('brand config voice.avoid_phrases must be a list')
    if not isinstance(voice.get('require'), list):
        raise ValueError('brand config voice.require must be a list')

    if data.get('button_style') != 'pill_filled':
        raise ValueError('brand config button_style must be pill_filled')
    for key in ('logo_url', 'logo_on_dark', 'logo_on_light'):
        logo_url = data.get(key, '')
        if logo_url and not logo_url.startswith(('http://', 'https://', 'data:')):
            logo_path = _resolve_brand_path(logo_url)
            if not logo_path.exists():
                raise ValueError(f'brand logo not found for {key}: {logo_path}')
    return data


def load_brand() -> dict[str, Any]:
    global _brand
    if _brand is None:
        try:
            with BRAND_CONFIG_PATH.open() as f:
                _brand = _validate_brand(json.load(f))
        except Exception as exc:
            raise RuntimeError(f'cannot load brand config at {BRAND_CONFIG_PATH}: {exc}') from exc
    return _brand


def font_face_css() -> str:
    global _font_face_css
    if _font_face_css is not None:
        return _font_face_css

    brand = load_brand()
    font = brand['font']
    faces = []
    for family_key, path_key in (
        ('heading_family', 'heading_local_path'),
        ('body_family', 'body_local_path'),
    ):
        path = _font_path(font, path_key)
        mime = mimetypes.guess_type(path.name)[0] or 'font/ttf'
        encoded = base64.b64encode(path.read_bytes()).decode('ascii')
        faces.append(
            "@font-face { "
            f"font-family: '{font[family_key]}'; "
            f"src: url('data:{mime};base64,{encoded}') format('truetype'); "
            "font-weight: 300 900; font-style: normal; font-display: block; "
            "}"
        )
    _font_face_css = "\n".join(faces)
    return _font_face_css


def template_defaults() -> dict[str, str]:
    brand = load_brand()
    colors = brand['colors']
    font = brand['font']
    return {
        'primary_color': colors['primary'],
        'secondary_color': colors['secondary'],
        'accent_color': colors['accent'],
        'background_color': colors['background'],
        'dark_text': colors['dark_text'],
        'heading_font': font['heading_family'],
        'body_font': font['body_family'],
        'font_face_css': font_face_css(),
        'google_fonts_url': font.get('google_fonts_url', ''),
        'logo_url': brand.get('logo_url', ''),
        'logo_on_dark': brand.get('logo_on_dark', brand.get('logo_url', '')),
        'logo_on_light': brand.get('logo_on_light', brand.get('logo_url', '')),
        'button_style': brand.get('button_style', 'pill_filled'),
    }
