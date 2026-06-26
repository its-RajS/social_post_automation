import * as Minio from 'minio';
import { config } from '../config';

export const minioClient = new Minio.Client({
  endPoint: config.MINIO_ENDPOINT,
  port: config.MINIO_PORT,
  useSSL: config.MINIO_USE_SSL,
  accessKey: config.MINIO_ACCESS_KEY,
  secretKey: config.MINIO_SECRET_KEY,
});

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(config.MINIO_BUCKET);
  if (!exists) {
    await minioClient.makeBucket(config.MINIO_BUCKET);
    console.log(`Created bucket: ${config.MINIO_BUCKET}`);
  }
}

export async function uploadBuffer(
  key: string,
  buffer: Buffer,
  mime: string,
): Promise<void> {
  await minioClient.putObject(config.MINIO_BUCKET, key, buffer, buffer.length, {
    'Content-Type': mime,
  });
}

export async function presignedUrl(key: string, ttlSeconds = 3600): Promise<string> {
  return minioClient.presignedGetObject(config.MINIO_BUCKET, key, ttlSeconds);
}
