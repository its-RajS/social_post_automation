import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

import { config } from '../config';

const scrypt = promisify(scryptCallback);
const encryptionKey = createHash('sha256').update(config.TOKEN_ENCRYPTION_KEY).digest();

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!config.ADMIN_PASSWORD_HASH) {
    const actual = Buffer.from(password);
    const expected = Buffer.from(config.ADMIN_PASSWORD);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  const [salt, expectedHex] = config.ADMIN_PASSWORD_HASH.split(':');
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

export function decryptSecret(value: string): string {
  const [ivValue, tagValue, ciphertextValue] = value.split('.');
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
