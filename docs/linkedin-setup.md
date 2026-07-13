# LinkedIn publishing setup

The designer dashboard uses LinkedIn's three-legged OAuth flow and publishes only after the read-only preview is confirmed.

## Developer Portal

1. Create or identify the LinkedIn Company Page that will own the Developer app. The member connecting the dashboard must be allowed to publish for that page.
2. Create an app in the [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) and associate it with the Company Page.
3. Add the exact OAuth redirect URL:
   - Local: `http://localhost:3001/api/v1/linkedin/oauth/callback`
   - Production: `https://<dashboard-host>/api/v1/linkedin/oauth/callback`
4. Enable the products that grant `openid`, `profile`, `w_member_social`, and `w_organization_social`. Organization publishing requires LinkedIn Community Management API approval.
5. Copy the Client ID and Client Secret into deployment secrets. Never expose the Client Secret to the frontend.

## Environment

Set the values documented in `.env.example`, especially:

```dotenv
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_REDIRECT_URI=https://<dashboard-host>/api/v1/linkedin/oauth/callback
LINKEDIN_API_VERSION=202606
TOKEN_ENCRYPTION_KEY=<at-least-32-random-characters>
ADMIN_EMAIL=designer@example.com
ADMIN_PASSWORD_HASH=<salt>:<scrypt-hash>
```

For local-only development, `ADMIN_PASSWORD` is supported. Production deployments should set `ADMIN_PASSWORD_HASH`; when it is present, the plaintext value is ignored.
The OAuth callback must use the same public host as the dashboard so its secure session and OAuth-state cookies are available through the frontend proxy.

Generate the hash from `nodejs-api/`:

```bash
npm run admin:hash-password -- "your-production-password"
```

## Dashboard

1. Open `/designer` and sign in.
2. Open **Settings**, then select **Connect LinkedIn**.
3. After OAuth completes, add the numeric Company Page organization ID and label. Saving it makes the Company Page the default destination.
4. A personal destination is also retained. Change the default destination from Settings when needed.

Access tokens are encrypted in Postgres. If LinkedIn does not issue a refresh token, the dashboard will require reconnection when the access token expires.
