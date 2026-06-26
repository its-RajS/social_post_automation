import os
import boto3
from botocore.config import Config

MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'localhost')
MINIO_PORT = os.environ.get('MINIO_PORT', '9000')
MINIO_ACCESS_KEY = os.environ['MINIO_ACCESS_KEY']
MINIO_SECRET_KEY = os.environ['MINIO_SECRET_KEY']
BUCKET = os.environ.get('MINIO_BUCKET', 'linkedin-automation')

_client = boto3.client(
    's3',
    endpoint_url=f'http://{MINIO_ENDPOINT}:{MINIO_PORT}',
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version='s3v4'),
    region_name='us-east-1',
)


def download_file(key: str, local_path: str) -> None:
    _client.download_file(BUCKET, key, local_path)


def upload_file(local_path: str, key: str) -> None:
    _client.upload_file(local_path, BUCKET, key)
