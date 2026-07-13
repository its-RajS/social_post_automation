import { randomBytes } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

import { prisma } from '../db';
import { sha256 } from '../services/secrets';

export const SESSION_COOKIE = 'designer_session';

export interface AuthenticatedRequest extends Request {
  adminSession?: { id: string; csrfToken: string };
}

export function parseCookies(header?: string): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const [name, ...rest] = part.trim().split('=');
      return [name, decodeURIComponent(rest.join('='))];
    }),
  );
}

export async function loadAdminSession(req: AuthenticatedRequest): Promise<boolean> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return false;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.expiresAt <= new Date()) return false;
  req.adminSession = { id: session.id, csrfToken: session.csrfToken };
  return true;
}

export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!(await loadAdminSession(req))) {
      res.status(401).json({ error: 'Admin login required' });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireCsrf(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.adminSession || req.get('X-CSRF-Token') !== req.adminSession.csrfToken) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
}

export function sessionCredentials(): { token: string; tokenHash: string; csrfToken: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: sha256(token), csrfToken: randomBytes(24).toString('base64url') };
}
