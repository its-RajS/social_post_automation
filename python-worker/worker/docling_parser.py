import logging
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.base_models import InputFormat
from models.schemas import PageData

logger = logging.getLogger(__name__)

_pdf_options = PdfPipelineOptions(do_ocr=True)
_converter = DocumentConverter(
    format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=_pdf_options)}
)


def _bbox_to_dict(bbox) -> dict | None:
    if bbox is None:
        return None
    # Docling BoundingBox uses .l .t .r .b (left/top/right/bottom)
    try:
        return {'x1': bbox.l, 'y1': bbox.t, 'x2': bbox.r, 'y2': bbox.b}
    except AttributeError:
        pass
    # Fallback: some versions use x0/y0/x1/y1
    try:
        return {'x1': bbox.x0, 'y1': bbox.y0, 'x2': bbox.x1, 'y2': bbox.y1}
    except AttributeError:
        pass
    return None


def parse(source_path: str) -> list[PageData]:
    result = _converter.convert(source_path)
    doc = result.document

    pages: dict[int, PageData] = {}
    layout_by_page: dict[int, list] = {}

    for item, _ in doc.iterate_items():
        prov = item.prov[0] if item.prov else None
        if not prov:
            continue
        page_no = prov.page_no

        if page_no not in pages:
            pages[page_no] = PageData(page_number=page_no)

        pd = pages[page_no]
        label = type(item).__name__
        text = getattr(item, 'text', '') or ''

        if label == 'TableItem':
            pd.has_tables = True
        elif label == 'PictureItem':
            pd.has_images = True

        if text:
            pd.text_content = (pd.text_content + '\n' + text) if pd.text_content else text
            pd.word_count += len(text.split())

        bbox = _bbox_to_dict(prov.bbox if hasattr(prov, 'bbox') else None)
        layout_by_page.setdefault(page_no, []).append({
            'type': label,
            'text': text,
            'bbox': bbox,
        })

    for page_no, pd in pages.items():
        pd.layout_json = layout_by_page.get(page_no, [])

    return sorted(pages.values(), key=lambda p: p.page_number)
