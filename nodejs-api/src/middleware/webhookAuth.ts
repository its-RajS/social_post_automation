import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { config } from '../config';

export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-webhook-secret'];
  if (typeof secret !== 'string') {
    res.status(401).json({ error: 'Missing X-Webhook-Secret' });
    return;
  }
  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(config.WEBHOOK_SECRET);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }
  } catch {
    res.status(401).json({ error: 'Invalid webhook secret' });
    return;
  }
  next();
}
