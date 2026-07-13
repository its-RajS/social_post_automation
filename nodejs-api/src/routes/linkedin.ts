import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';
import { prisma } from '../db';
import { AuthenticatedRequest, parseCookies, requireAdmin, requireCsrf } from '../middleware/adminAuth';
import { encryptSecret } from '../services/secrets';
import { linkedinOAuthErrorMessage } from '../services/linkedinOAuth';

const router = Router();
const STATE_COOKIE = 'linkedin_oauth_state';

router.get('/oauth/start', requireAdmin, (_req, res) => {
  if (!config.LINKEDIN_CLIENT_ID || !config.LINKEDIN_CLIENT_SECRET) {
    res.status(503).json({ error: 'LinkedIn client credentials are not configured' });
    return;
  }
  const state = randomBytes(24).toString('base64url');
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true, sameSite: 'lax', secure: config.NODE_ENV === 'production', maxAge: 10 * 60 * 1000, path: '/',
  });
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: config.LINKEDIN_CLIENT_ID,
    redirect_uri: config.LINKEDIN_REDIRECT_URI,
    state,
    scope: config.LINKEDIN_SCOPES.join(' '),
  });
  res.redirect(`https://www.linkedin.com/oauth/v2/authorization?${query}`);
});

router.get('/oauth/callback', requireAdmin, async (req, res, next) => {
  try {
    const expectedState = parseCookies(req.headers.cookie)[STATE_COOKIE];
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state || state !== expectedState) {
      res.status(400).send('Invalid LinkedIn OAuth callback state');
      return;
    }
    res.clearCookie(STATE_COOKIE, { path: '/' });

    const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
    if (oauthError) {
      const description = typeof req.query.error_description === 'string' ? req.query.error_description : undefined;
      const query = new URLSearchParams({ linkedin: 'error', linkedin_error: linkedinOAuthErrorMessage(oauthError, description) });
      res.redirect(`${config.FRONTEND_URL}/designer?${query}`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) {
      res.status(400).send('LinkedIn did not return an authorization code');
      return;
    }

    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code,
        client_id: config.LINKEDIN_CLIENT_ID,
        client_secret: config.LINKEDIN_CLIENT_SECRET,
        redirect_uri: config.LINKEDIN_REDIRECT_URI,
      }),
    });
    if (!tokenResponse.ok) throw new Error(`LinkedIn token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`);
    const token = await tokenResponse.json() as {
      access_token: string; expires_in: number; refresh_token?: string;
      refresh_token_expires_in?: number; scope?: string;
    };
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!profileResponse.ok) throw new Error(`LinkedIn profile fetch failed: ${profileResponse.status}`);
    const profile = await profileResponse.json() as { sub: string; name?: string };
    const memberUrn = `urn:li:person:${profile.sub}`;

    const connection = await prisma.linkedInConnection.upsert({
      where: { memberUrn },
      create: {
        memberUrn,
        displayName: profile.name,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        refreshTokenExpiresAt: token.refresh_token_expires_in
          ? new Date(Date.now() + token.refresh_token_expires_in * 1000) : null,
        scopes: (token.scope ?? '').split(' ').filter(Boolean),
      },
      update: {
        displayName: profile.name,
        isActive: true,
        accessTokenEncrypted: encryptSecret(token.access_token),
        refreshTokenEncrypted: token.refresh_token ? encryptSecret(token.refresh_token) : undefined,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        refreshTokenExpiresAt: token.refresh_token_expires_in
          ? new Date(Date.now() + token.refresh_token_expires_in * 1000) : undefined,
        scopes: (token.scope ?? '').split(' ').filter(Boolean),
      },
    });
    const defaultDestination = await prisma.linkedInDestination.findFirst({
      where: { isDefault: true, connection: { isActive: true } }, select: { id: true },
    });
    await prisma.linkedInDestination.upsert({
      where: { authorUrn: memberUrn },
      create: {
        connectionId: connection.id, type: 'MEMBER', authorUrn: memberUrn,
        label: profile.name ?? 'Personal profile', isDefault: !defaultDestination,
      },
      update: {
        connectionId: connection.id,
        label: profile.name ?? 'Personal profile',
        ...(!defaultDestination ? { isDefault: true } : {}),
      },
    });
    res.redirect(`${config.FRONTEND_URL}/designer?linkedin=connected`);
  } catch (error) {
    console.error('[linkedin-oauth-callback]', error);
    if (res.headersSent) {
      next(error);
      return;
    }
    const query = new URLSearchParams({
      linkedin: 'error',
      linkedin_error: 'LinkedIn connection failed. Check the API logs for details and verify the enabled LinkedIn products and scopes.',
    });
    res.redirect(`${config.FRONTEND_URL}/designer?${query}`);
  }
});

router.get('/status', requireAdmin, async (_req, res, next) => {
  try {
    const connections = await prisma.linkedInConnection.findMany({
      where: { isActive: true },
      include: { destinations: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
    });
    res.json({
      configured: Boolean(config.LINKEDIN_CLIENT_ID && config.LINKEDIN_CLIENT_SECRET),
      connections: connections.map((connection) => ({
        id: connection.id,
        member_urn: connection.memberUrn,
        display_name: connection.displayName,
        expires_at: connection.accessTokenExpiresAt,
        scopes: connection.scopes,
        destinations: connection.destinations.map((destination) => ({
          id: destination.id, type: destination.type, author_urn: destination.authorUrn,
          label: destination.label, is_default: destination.isDefault,
        })),
      })),
    });
  } catch (error) { next(error); }
});

router.post('/destinations', requireAdmin, requireCsrf, async (req: AuthenticatedRequest, res, next) => {
  try {
    const input = z.object({
      connection_id: z.string().uuid(), organization_id: z.string().regex(/^\d+$/),
      label: z.string().min(1).max(255), make_default: z.boolean().default(true),
    }).parse(req.body);
    const authorUrn = `urn:li:organization:${input.organization_id}`;
    const connection = await prisma.linkedInConnection.findFirst({
      where: { id: input.connection_id, isActive: true }, select: { id: true },
    });
    if (!connection) {
      res.status(409).json({ error: 'Reconnect LinkedIn before adding a destination' });
      return;
    }
    const destination = await prisma.$transaction(async (tx) => {
      if (input.make_default) await tx.linkedInDestination.updateMany({ data: { isDefault: false } });
      return tx.linkedInDestination.upsert({
        where: { authorUrn },
        create: {
          connectionId: input.connection_id, type: 'ORGANIZATION', authorUrn,
          label: input.label, isDefault: input.make_default,
        },
        update: { connectionId: input.connection_id, label: input.label, isDefault: input.make_default },
      });
    });
    res.status(201).json(destination);
  } catch (error) { next(error); }
});

router.patch('/destinations/:id/default', requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const destinationId = z.string().uuid().parse(req.params.id);
    const destination = await prisma.$transaction(async (tx) => {
      const active = await tx.linkedInDestination.findFirst({
        where: { id: destinationId, connection: { isActive: true } }, select: { id: true },
      });
      if (!active) throw new Error('LinkedIn destination is not active');
      await tx.linkedInDestination.updateMany({ data: { isDefault: false } });
      return tx.linkedInDestination.update({ where: { id: destinationId }, data: { isDefault: true } });
    });
    res.json(destination);
  } catch (error) { next(error); }
});

router.delete('/connections/:id', requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const connectionId = z.string().uuid().parse(req.params.id);
    const disconnected = await prisma.$transaction(async (tx) => {
      await tx.linkedInDestination.updateMany({ where: { connectionId }, data: { isDefault: false } });
      return tx.linkedInConnection.updateMany({
        where: { id: connectionId, isActive: true },
        data: {
          isActive: false,
          accessTokenEncrypted: encryptSecret(randomBytes(32).toString('base64url')),
          refreshTokenEncrypted: null,
          accessTokenExpiresAt: new Date(0),
          refreshTokenExpiresAt: null,
          scopes: [],
        },
      });
    });
    if (disconnected.count === 0) {
      res.status(404).json({ error: 'Active LinkedIn connection not found' });
      return;
    }
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
