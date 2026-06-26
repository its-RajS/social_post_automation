import logging
from unstructured.partition.auto import partition
from models.schemas import ChunkData

logger = logging.getLogger(__name__)

CHUNK_TYPE_MAP = {
    'Title': 'Title',
    'NarrativeText': 'NarrativeText',
    'ListItem': 'ListItem',
    'Table': 'Table',
    'Header': 'Header',
    'Footer': 'Footer',
    'ImageCaption': 'ImageCaption',
    'FigureCaption': 'ImageCaption',
}


def chunk(source_path: str) -> list[ChunkData]:
    try:
        elements = partition(filename=source_path)
    except Exception as e:
        logger.error('Unstructured partition failed: %s', e)
        return []

    chunks = []
    for el in elements:
        category = type(el).__name__
        chunk_type = CHUNK_TYPE_MAP.get(category)
        if not chunk_type:
            continue

        text = str(el).strip()
        if not text:
            continue

        page_number = getattr(el.metadata, 'page_number', None) or 1

        bbox = None
        coords = getattr(el.metadata, 'coordinates', None)
        if coords and hasattr(coords, 'points') and coords.points:
            pts = coords.points
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            bbox = {'x1': min(xs), 'y1': min(ys), 'x2': max(xs), 'y2': max(ys)}

        chunks.append(ChunkData(
            page_number=page_number,
            chunk_type=chunk_type,
            text=text,
            bounding_box=bbox,
        ))

    return chunks
