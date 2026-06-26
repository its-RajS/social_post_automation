import os
import logging
import uuid
from urllib.parse import urlparse
from typing import Optional

from sentence_transformers import SentenceTransformer
import chromadb

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')
CHROMA_URL = os.environ.get('CHROMA_URL', 'http://localhost:8000')

_model = SentenceTransformer(EMBEDDING_MODEL)
_chroma: Optional[chromadb.HttpClient] = None


def _get_chroma() -> chromadb.HttpClient:
    global _chroma
    if _chroma is None:
        parsed = urlparse(CHROMA_URL)
        host = parsed.hostname or 'localhost'
        port = parsed.port or 8000
        _chroma = chromadb.HttpClient(host=host, port=port)
    return _chroma


def embed_and_store(chunks: list[dict]) -> list[Optional[str]]:
    if not chunks:
        return []

    texts = [c['text'] for c in chunks]

    try:
        embeddings = _model.encode(texts, show_progress_bar=False).tolist()
    except Exception as e:
        logger.error('Embedding generation failed: %s', e)
        return [None] * len(chunks)

    vector_ids = [str(uuid.uuid4()) for _ in chunks]

    try:
        client = _get_chroma()
        collection = client.get_or_create_collection('documents')
        collection.add(
            ids=vector_ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=[
                {
                    'chunk_id': c['chunk_id'],
                    'doc_id': c['doc_id'],
                    'page_number': c['page_number'],
                    'chunk_type': c['chunk_type'],
                }
                for c in chunks
            ],
        )
        return vector_ids
    except Exception as e:
        logger.error('Chroma storage failed: %s', e)
        return [None] * len(chunks)
