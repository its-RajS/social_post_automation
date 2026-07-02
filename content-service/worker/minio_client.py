import os

import boto3

MINIO_BUCKET = os.environ.get('MINIO_BUCKET', 'linkedin-automation')

# Presigning is a local signing operation (no network call to MinIO), so this
# client must be configured with the URL a *browser* can reach, not the
# internal docker-network hostname (e.g. `minio:9000`) other services use.
MINIO_PUBLIC_URL = os.environ.get('MINIO_PUBLIC_URL', 'http://localhost:9000')

_s3 = boto3.client(
    's3',
    endpoint_url=MINIO_PUBLIC_URL,
    aws_access_key_id=os.environ.get('MINIO_ACCESS_KEY', 'minioadmin'),
    aws_secret_access_key=os.environ.get('MINIO_SECRET_KEY', 'minioadmin'),
)


def presign(key: str | None, ttl_seconds: int = 3600) -> str | None:
    """Turn a raw MinIO object key into a browser-reachable presigned URL."""
    if not key:
        return key
    if key.startswith('http'):
        return key  # already a URL (shouldn't happen post-fix, kept for safety)
    return _s3.generate_presigned_url(
        'get_object', Params={'Bucket': MINIO_BUCKET, 'Key': key}, ExpiresIn=ttl_seconds,
    )
