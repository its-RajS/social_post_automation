export const DEFAULT_LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social'] as const;

export function parseLinkedInScopes(value = DEFAULT_LINKEDIN_SCOPES.join(' ')): string[] {
  return [...new Set(value.split(/[\s,]+/).map((scope) => scope.trim()).filter(Boolean))];
}

export function linkedinOAuthErrorMessage(error: string, description?: string): string {
  const detail = description?.trim().slice(0, 288);
  if (error === 'access_denied') {
    return detail ? `LinkedIn authorization was denied: ${detail}` : 'LinkedIn authorization was denied';
  }
  return detail
    ? `LinkedIn authorization failed (${error}): ${detail}${description && description.length > 288 ? '…' : ''}`
    : `LinkedIn authorization failed (${error})`;
}
