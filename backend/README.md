# Atlanta Roleplay website backend

This API powers the on-site staff application form, Discord role-checked admin dashboard, decision DMs, and editable website content. GitHub Pages serves only static files; this Node.js API must be hosted separately.

## Included

- Staff applications saved in SQLite.
- Discord OAuth login for admins.
- Server-role verification on every admin session using the Discord bot.
- Pending/reviewed application dashboard.
- Accept/deny decisions with a Discord DM attempt and optional note.
- Website content fields served from the API.
- Rate limiting, input validation, secure HTTP-only session cookie, and CORS restriction.

## 1. Create/configure the Discord application

1. In the Discord Developer Portal, create or select the application used for the website's OAuth login.
2. Under OAuth2, add the exact redirect URI: `https://YOUR-BACKEND-DOMAIN/auth/discord/callback`.
3. Copy the OAuth Client ID and Client Secret into the backend environment variables.
4. Invite the Discord bot to Atlanta Roleplay. It must be able to look up guild members and create/send DMs. Keep the bot token secret; never put it in any frontend file.
5. The default admin roles are Founder (`1538727238483050664`) and SHR (`1538727238441369677`). Set `ADMIN_ROLE_IDS` to the exact role IDs you want to authorise. Do not add broad staff roles unless you want those staff to have access to every application and editable content.

## 2. Deploy the backend

Use a Node.js host that supports persistent storage, such as a Railway service with a persistent volume, or another Node 20+ host. Deploy the repository's `backend` directory as the service root.

- Build/install command: `npm install`
- Start command: `npm start`
- Health check: `/health`
- Attach a persistent volume and set `DATABASE_PATH` to a location on that volume, for example `/data/arp.sqlite`.
- Add all variables from `.env.example` in the host's Variables/Environment panel. Never commit a real `.env` file.
- `FRONTEND_URL` must be the exact public website origin, without a trailing slash.
- `API_PUBLIC_URL` must be the backend's public HTTPS origin, without a trailing slash.
- `DISCORD_REDIRECT_URI` must equal `API_PUBLIC_URL/auth/discord/callback`.
- Use a random `SESSION_SECRET` with at least 32 characters.

## 3. Connect the website

Edit the root `api-config.js` and replace `https://REPLACE-WITH-YOUR-BACKEND-DOMAIN` with the deployed API origin. Commit the change. GitHub Actions should publish the static website.

## 4. Browser cookie note

This setup uses an HTTP-only secure cookie for the admin session. Browsers may restrict cross-site cookies when the GitHub Pages domain and API host are on unrelated domains. If login loops or the session is not retained, use a custom domain with same-site subdomains (for example `www.example.com` for Pages and `api.example.com` for the backend) or put the API behind a same-origin proxy. Do not solve this by exposing bot tokens or session secrets in JavaScript.

## 5. Test

1. Visit `/health` on the API and confirm it returns `{"ok":true}`.
2. Submit a test application from the live Applications page.
3. Visit `/admin.html`, sign in with a Discord account that has an authorised role, and review the application.
4. Test both decisions with a test account that allows server-member DMs.
5. Change the homepage headline and verify the public page updates after adding `data-site-content` attributes where noted below.

## Important limitations

- The admin content editor stores public site content in the backend. The homepage fields only affect elements marked with matching `data-site-content` attributes; add those attributes to the exact elements you want editable. The announcement is displayed where an element with `data-site-announcement` exists.
- Decisions are saved even if Discord cannot deliver a DM; the dashboard response will include a warning. The bot cannot force DMs from users who block it or restrict server DMs.
- The SQLite database must be on persistent storage. Ephemeral host storage can lose application records during redeploys.
