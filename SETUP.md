# SocialSync setup (Facebook, Instagram, LinkedIn, X)

SocialSync publishes posts itself. The browser never sees a social-media token. Tokens are stored on the
server, encrypted with `TOKEN_ENCRYPTION_KEY`, in `DATA_DIR/socialsync-store.json`. A built-in scheduler
checks once a minute and publishes posts that are due, recording success or the error for each platform.
n8n is optional (`PUBLISH_MODE=n8n`).

App address used below: **https://socialsync.aisetuppros.com** (`APP_URL`).

## Redirect URIs (copy exactly)

| Platform | Redirect / callback URL |
|---|---|
| Facebook **and** Instagram | `https://socialsync.aisetuppros.com/api/auth/facebook/callback` |
| LinkedIn (personal profile) | `https://socialsync.aisetuppros.com/api/auth/linkedin/callback` |
| LinkedIn Page (company) | `https://socialsync.aisetuppros.com/api/auth/linkedin_page/callback` |
| X / Twitter (optional) | `https://socialsync.aisetuppros.com/api/auth/twitter/callback` |

---

## 1. Core server settings (`.env` on the server)

1. `SESSION_SECRET`: run `openssl rand -hex 32`. The server will not start with a weak or default value.
2. `TOKEN_ENCRYPTION_KEY`: run `openssl rand -hex 32`. Keep a copy somewhere safe (a password manager). If you lose it, every account must be reconnected.
3. `APP_URL=https://socialsync.aisetuppros.com`
4. `FIREBASE_PROJECT_ID`: the Firebase project the site signs in to. Use the same value as `VITE_FIREBASE_PROJECT_ID`.
5. `ALLOWED_EMAILS`: the Google or Firebase email(s) allowed to use SocialSync, comma-separated. Everyone else gets "not allowed".
6. `VITE_FIREBASE_*` (and `VITE_FIRESTORE_DATABASE_ID` if the project uses a named database). Get these from Firebase console → Project settings → Your apps → Web app → SDK config. They are needed when building (`npm run build`).
7. `GROQ_API_KEY` (and optionally `GEMINI_API_KEY`) for the AI writing helpers. Use **new, rotated** keys.

## 2. Meta app: Facebook Page + Instagram Business

Before you start:
- The Instagram account must be a **Business or Creator** account.
- It must be linked to your Facebook Page: in Instagram go to Settings → Account type and tools, or use Meta Business Suite → Settings → Instagram accounts.

Steps:
1. Go to https://developers.facebook.com/apps → **Create app**.
   - Use cases: choose **"Manage everything on your Page"**. Also add **"Manage messaging & content on Instagram"** (Instagram API *with Facebook Login*).
   - App type, if asked: **Business**. Connect it to your Business portfolio (Buckalew Financial Services / AI Setup Pros).
2. **App settings → Basic**:
   - App domains: `socialsync.aisetuppros.com`
   - Privacy Policy URL and User data deletion URL: required to go Live (your website's privacy page works).
   - Category: Business.
   - Copy the **App ID** to `FACEBOOK_APP_ID` and the **App Secret** to `FACEBOOK_APP_SECRET`.
3. **Facebook Login for Business → Settings**:
   - Valid OAuth Redirect URIs: `https://socialsync.aisetuppros.com/api/auth/facebook/callback`
   - Turn ON: Client OAuth login, Web OAuth login, Enforce HTTPS, Use Strict Mode for redirect URIs.
   - Optional: create a *Configuration* containing the permissions below and put its ID in `FACEBOOK_LOGIN_CONFIG_ID`. If you leave it empty, SocialSync asks for the scopes directly.
4. Permissions (Use cases → Customize / App Review → Permissions and features):
   - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` (Facebook Page posting)
   - `instagram_basic`, `instagram_content_publish` (Instagram posting)
   - `business_management` (needed when the Page is owned by a Business portfolio)
5. **Roles**: make sure your own Facebook profile is an **Admin** of the app. You must also be an admin of the Page.
6. **Access level / App Review**:
   - People with a role on the app (you) can use these permissions with *Standard access* without App Review.
   - **Advanced access** needs App Review and **Business Verification** (Settings → Business verification in Business Manager). Business Verification needs your legal business name, address and phone, plus a document.
   - Switch the app to **Live** mode (top bar) when the Basic settings are complete. Posts made by apps still in Development mode may not be shown publicly.
7. In SocialSync, go to **Settings → Accounts → Facebook → Connect Account**. In the Facebook dialog, **tick your Page(s) and the Instagram account**. SocialSync stores a Page token for each Page, plus the Instagram account linked to each Page. If you have several Pages, pick the one to post to from the dropdown on the card.

Notes:
- Instagram posts **require an image** (or a video for Reels). The image must be a public `https://` URL; uploads from the Media Library qualify.
- Facebook posts can be text, text plus link, or image plus caption.

## 3. LinkedIn: two separate apps

LinkedIn only grants the **Community Management API** (company Page posting) to an app that has **no other
products**. So:

### 3a. LinkedIn personal profile app (quick, self-serve)
1. Go to https://www.linkedin.com/developers/apps → **Create app**. Link it to your LinkedIn Page (any Page you admin) and upload a logo.
2. **Products** tab: add **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**.
3. **Auth** tab: add the redirect URL `https://socialsync.aisetuppros.com/api/auth/linkedin/callback`.
4. Copy the Client ID to `LINKEDIN_CLIENT_ID` and the Primary Client Secret to `LINKEDIN_CLIENT_SECRET`.
   - Scopes used: `openid profile w_member_social` (override with `LINKEDIN_SCOPES`).

### 3b. LinkedIn Page (company) app: Community Management API (reviewed by LinkedIn)
1. Create a **second, new** app with **no other products**, linked to your company Page (Buckalew Financial Services or AI Setup Pros).
2. **Settings** tab: click **Verify** next to the Page. A Super admin of the Page must approve the verification link.
3. **Products** tab: request **Community Management API** and fill in the form (legal business name, website, address, use case "publish posts to my company Pages"). Watch for a vetting email. Approval starts at the *Development tier*: 500 calls per day per app, which is plenty for scheduling.
4. **Auth** tab: add the redirect URL `https://socialsync.aisetuppros.com/api/auth/linkedin_page/callback`. After approval, confirm the scopes `r_basicprofile`, `w_organization_social`, `r_organization_social` and `rw_organization_admin` are listed.
5. Copy the Client ID to `LINKEDIN_ORG_CLIENT_ID` and the Secret to `LINKEDIN_ORG_CLIENT_SECRET`.
6. In SocialSync, go to **Settings → Accounts → LinkedIn Page (company) → Connect**. Your Pages (where you are an Admin or Content admin) appear in a dropdown.

Notes:
- LinkedIn access tokens last **60 days**. Refresh tokens are only given to some approved apps. SocialSync shows "Access expires soon" on the card; click **Reconnect** when that appears.
- `LINKEDIN_API_VERSION` (default `202610`) must be a version LinkedIn still supports. LinkedIn sunsets each version about a year after release, so bump it when LinkedIn warns.

## 4. X / Twitter (optional)
- Posting needs a **paid** X API tier (Basic or higher).
- Create a project and app at https://developer.x.com:
  - User authentication: **OAuth 2.0**, type *Web App*, permissions **Read and write**.
  - Callback `https://socialsync.aisetuppros.com/api/auth/twitter/callback`.
  - Website `https://socialsync.aisetuppros.com`.
- Copy the OAuth 2.0 Client ID and Secret to `TWITTER_CLIENT_ID` and `TWITTER_CLIENT_SECRET`.
- Tokens refresh automatically (scope `offline.access`). Image posts to X are not implemented yet; text and links work.

## 5. Not implemented yet (honest errors, no fake "success")
TikTok, YouTube and Pinterest return "not implemented". Reddit, Telegram, WordPress and GHL in the UI are not
published by the server either.

## 6. Operations
- **Logs**: install pm2 log rotation so the error log never grows to 190 MB again:
  `pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 10M && pm2 set pm2-logrotate:retain 7`
- **Backups**: back up `DATA_DIR` (encrypted tokens and the post queue) and keep `TOKEN_ENCRYPTION_KEY` somewhere separate.
- **Single process only**: keep pm2 `instances: 1`. The scheduler and store are single-process.
- **Network**: the app binds to `127.0.0.1:3460` and is reachable only through Caddy (HTTPS).
- **Tests**: `npm test` (mocked HTTP) and `npm run dry-run` (prints the exact API calls each publisher makes, with tokens redacted; nothing is sent).
