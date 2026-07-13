import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';
import { prisma } from '../db';
import {
  AuthenticatedRequest,
  loadAdminSession,
  parseCookies,
  requireAdmin,
  requireCsrf,
  SESSION_COOKIE,
  sessionCredentials,
} from '../middleware/adminAuth';
import { sha256, verifyPassword } from '../services/secrets';

const router = Router();
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const attempts = new Map<string, { count: number; resetAt: number }>();

router.post('/login', async (req, res, next) => {
  try {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const current = attempts.get(key);
    if (current && current.resetAt > now && current.count >= 5) {
      res.status(429).json({ error: 'Too many login attempts; try again in 15 minutes' });
      return;
    }
    const input = loginSchema.parse(req.body);
    if (input.email.toLowerCase() !== config.ADMIN_EMAIL.toLowerCase() || !(await verifyPassword(input.password))) {
      attempts.set(key, {
        count: current && current.resetAt > now ? current.count + 1 : 1,
        resetAt: current && current.resetAt > now ? current.resetAt : now + 15 * 60 * 1000,
      });
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    attempts.delete(key);

    const credentials = sessionCredentials();
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);
    await prisma.adminSession.create({
      data: { tokenHash: credentials.tokenHash, csrfToken: credentials.csrfToken, expiresAt },
    });
    res.cookie(SESSION_COOKIE, credentials.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      expires: expiresAt,
      path: '/',
    });
    res.json({ authenticated: true, email: config.ADMIN_EMAIL, csrf_token: credentials.csrfToken });
  } catch (error) {
    next(error);
  }
});

router.get('/session', async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!(await loadAdminSession(req))) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, email: config.ADMIN_EMAIL, csrf_token: req.adminSession!.csrfToken });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: sha256(token) } });
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ authenticated: false });
  } catch (error) {
    next(error);
  }
});

export default router;
