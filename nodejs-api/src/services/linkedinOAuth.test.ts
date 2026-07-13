import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_LINKEDIN_SCOPES,
  linkedinOAuthErrorMessage,
  parseLinkedInScopes,
} from './linkedinOAuth';

test('LinkedIn defaults to OIDC and member publishing scopes', () => {
  assert.deepEqual(parseLinkedInScopes(), DEFAULT_LINKEDIN_SCOPES);
  assert.deepEqual(DEFAULT_LINKEDIN_SCOPES, ['openid', 'profile', 'w_member_social']);
});

test('LinkedIn scopes remove duplicates and preserve configured order', () => {
  assert.deepEqual(
    parseLinkedInScopes('openid profile w_member_social w_organization_social profile'),
    ['openid', 'profile', 'w_member_social', 'w_organization_social'],
  );
});

test('LinkedIn OAuth errors are safe to show in the dashboard', () => {
  assert.equal(
    linkedinOAuthErrorMessage('access_denied', 'The user denied access'),
    'LinkedIn authorization was denied: The user denied access',
  );
  assert.equal(
    linkedinOAuthErrorMessage('invalid_scope', 'x'.repeat(500)),
    `LinkedIn authorization failed (invalid_scope): ${'x'.repeat(288)}…`,
  );
});
