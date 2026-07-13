import { LinkedInConnection } from '@prisma/client';

import { config } from '../config';
import { prisma } from '../db';
import { decryptSecret, encryptSecret } from './secrets';

const API_BASE = 'https://api.linkedin.com';

export class LinkedInError extends Error {
  constructor(message: string, public readonly ambiguous = false) {
    super(message);
  }
}

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'Linkedin-Version': config.LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
}

async function responseError(response: Response): Promise<LinkedInError> {
  const text = await response.text();
  return new LinkedInError(`LinkedIn ${response.status}: ${text.slice(0, 500)}`, response.status >= 500);
}

export async function accessTokenFor(connection: LinkedInConnection): Promise<string> {
  if (!connection.isActive) throw new LinkedInError('LinkedIn is disconnected; reconnect required');
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
    return decryptSecret(connection.accessTokenEncrypted);
  }
  if (!connection.refreshTokenEncrypted) throw new LinkedInError('LinkedIn authorization expired; reconnect required');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: decryptSecret(connection.refreshTokenEncrypted),
    client_id: config.LINKEDIN_CLIENT_ID,
    client_secret: config.LINKEDIN_CLIENT_SECRET,
  });
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw await responseError(response);
  const token = await response.json() as { access_token: string; expires_in: number };
  await prisma.linkedInConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: encryptSecret(token.access_token),
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
    },
  });
  return token.access_token;
}

export async function initializeImage(owner: string, token: string): Promise<{ uploadUrl: string; urn: string }> {
  const response = await fetch(`${API_BASE}/rest/images?action=initializeUpload`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { value: { uploadUrl: string; image: string } };
  return { uploadUrl: payload.value.uploadUrl, urn: payload.value.image };
}

export async function initializeDocument(owner: string, token: string): Promise<{ uploadUrl: string; urn: string }> {
  const response = await fetch(`${API_BASE}/rest/documents?action=initializeUpload`, {
    method: 'POST', headers: headers(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!response.ok) throw await responseError(response);
  const payload = await response.json() as { value: { uploadUrl: string; document: string } };
  return { uploadUrl: payload.value.uploadUrl, urn: payload.value.document };
}

export async function uploadMedia(uploadUrl: string, token: string, data: Buffer, contentType: string): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: new Uint8Array(data),
  });
  if (!response.ok) throw await responseError(response);
}

export async function createPost(input: {
  owner: string;
  token: string;
  commentary: string;
  assetUrn: string;
  format: 'SINGLE_IMAGE' | 'PDF_DOCUMENT';
  title: string;
}): Promise<string> {
  const payload = {
    author: input.owner,
    commentary: input.commentary,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: {
      media: {
        title: input.title,
        id: input.assetUrn,
      },
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/rest/posts`, {
      method: 'POST', headers: headers(input.token), body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new LinkedInError(`LinkedIn post result is unknown: ${String(error)}`, true);
  }
  if (!response.ok) throw await responseError(response);
  const id = response.headers.get('x-restli-id');
  if (!id) throw new LinkedInError('LinkedIn accepted the post but did not return its ID', true);
  return id;
}
