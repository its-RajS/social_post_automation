import json
import os
from pathlib import Path
from typing import Any

BRAND_CONFIG_PATH = Path(os.environ.get('BRAND_CONFIG_PATH', '/app/brand/brand.json'))

_REQUIRED_COLORS = ('primary', 'secondary', 'accent', 'background', 'dark_text')
_brand: dict[str, Any] | None = None


def _require_mapping(data: dict[str, Any], key: str) -> dict[str, Any]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise ValueError(f'brand config missing object: {key}')
    return value


def _validate_brand(data: dict[str, Any]) -> dict[str, Any]:
    colors = _require_mapping(data, 'colors')
    missing_colors = [key for key in _REQUIRED_COLORS if not colors.get(key)]
    if missing_colors:
        raise ValueError(f'brand config missing colors: {", ".join(missing_colors)}')

    font = _require_mapping(data, 'font')
    if not font.get('heading_family') or not font.get('body_family'):
        raise ValueError('brand config missing font.heading_family or font.body_family')
    local_path = font.get('local_path')
    if not local_path:
        raise ValueError('brand config missing font.local_path')
    font_path = Path(local_path)
    if not font_path.is_absolute():
        font_path = BRAND_CONFIG_PATH.parent / font_path
    if not font_path.exists():
        raise ValueError(f'brand font not found: {font_path}')

    voice = _require_mapping(data, 'voice')
    if not isinstance(voice.get('avoid_phrases'), list):
        raise ValueError('brand config voice.avoid_phrases must be a list')
    if not isinstance(voice.get('require'), list):
        raise ValueError('brand config voice.require must be a list')

    if data.get('button_style') != 'pill_filled':
        raise ValueError('brand config button_style must be pill_filled')
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
