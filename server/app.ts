import express, { type Request, type Response, type NextFunction } from 'express';
import session from 'express-session';
import { TwitterApi } from 'twitter-api-v2';
import type { AppConfig } from './config';
import { platformAvailability } from './config';
import { Store, type PlatformId } from './store';
import { requireUser, currentUser, type TokenVerifier } from './auth';
import { PublishError, safeErrorMessage, type HttpClient } from './http';
import { randomState } from './crypto';
import { popupHtml } from './popup';
import { publishTo, isKnownPlatform } from './publishers';
import { buildMetaConnections, graphBase } from './publishers/facebook';
import { authorizeUrl as linkedinAuthorizeUrl, completeLinkedInOAuth } from './publishers/linkedin';
import { runPost } from './scheduler';
import type { PublisherDeps } from './publishers/types';

const WS_RE = /^[A-Za-z0-9_-]{1,128}$/;
const OAUTH_TTL_MS = 15 * 60 * 1000;
const OAUTH_PLATFORMS = ['twitter', 'linkedin', 'linkedin_page', 'facebook', 'instagram'] as const;

interface PendingOAuth { platform: string; workspaceId: string; uid: string; verifier?: string; createdAt: number }

function wsParam(req: Request): string {
  const v = String((req.method === 'GET' || req.method === 'DELETE' ? req.query.workspaceId : (req.body?.workspaceId ?? req.query.workspaceId)) || '');
  if (!WS_RE.test(v)) throw new PublishError('Missing or invalid workspaceId', 'bad_request', 400);
  return v;
}

function cleanUrls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(String).filter(u => /^https:\/\//i.test(u)).slice(0, 10);
}

function cleanLink(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^https?:\/\//i.test(s) ? s.slice(0, 2000) : null;
}

export function createApp(config: AppConfig, deps: { store: Store; http: HttpClient; verifyToken: TokenVerifier; now?: () => Date }) {
  const { store, http } = deps;
  const pdeps: PublisherDeps = { http, config, store, now: deps.now };
  const app = express();
  const appOrigin = new URL(config.appUrl).origin;
  const redirectFor = (platform: string) => `${config.appUrl}/api/auth/${platform === 'instagram' ? 'facebook' : platform}/callback`;

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(session({
    name: 'ss.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: config.isProd, sameSite: 'lax', httpOnly: true, maxAge: OAUTH_TTL_MS },
  }));

  const auth = requireUser(config, deps.verifyToken);
  const wrap = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  // ---------- public ----------
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // ---------- OAuth: start (signed-in) ----------
  app.get('/api/auth/:platform/login', auth, wrap(async (req, res) => {
    const platform = req.params.platform;
    const workspaceId = wsParam(req);
    if (!(OAUTH_PLATFORMS as readonly string[]).includes(platform)) {
      return res.status(501).json({ error: `Connecting ${platform} is not implemented yet.` });
    }
    const avail = platformAvailability(config) as Record<string, boolean>;
    if (!avail[platform]) return res.status(500).json({ error: `${platform} app credentials are not configured on the server (see SETUP.md).` });

    const state = randomState();
    const pending: PendingOAuth = { platform, workspaceId, uid: currentUser(req).uid, createdAt: Date.now() };
    let url: string;
    if (platform === 'twitter') {
      const client = new TwitterApi({ clientId: config.twitter.clientId, clientSecret: config.twitter.clientSecret });
      const link = client.generateOAuth2AuthLink(redirectFor('twitter'), { scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'], state });
      pending.verifier = link.codeVerifier;
      url = link.url;
    } else if (platform === 'linkedin' || platform === 'linkedin_page') {
      url = linkedinAuthorizeUrl(pdeps, platform, redirectFor(platform), state);
    } else {
      const q = new URLSearchParams({ client_id: config.facebook.appId, redirect_uri: redirectFor('facebook'), state, response_type: 'code' });
      if (config.facebook.configId) q.set('config_id', config.facebook.configId); else q.set('scope', config.facebook.scopes.join(','));
      url = `https://www.facebook.com/${config.facebook.graphVersion}/dialog/oauth?${q.toString()}`;
    }
    const s = req.session as any;
    s.oauth = Object.fromEntries(Object.entries(s.oauth || {}).filter(([, v]: any) => Date.now() - v.createdAt < OAUTH_TTL_MS));
    s.oauth[state] = pending;
    res.json({ url });
  }));

  // ---------- OAuth: callbacks (public, bound to the session state) ----------
  const finish = (res: Response, ok: boolean, platform: string, workspaceId: string | null, text: string, accounts: any[] = []) =>
    res.status(ok ? 200 : 400).type('html').send(popupHtml(appOrigin, { type: ok ? 'OAUTH_SUCCESS' : 'OAUTH_ERROR', platform, workspaceId, accounts, error: ok ? undefined : text }, text));

  app.get('/api/auth/:platform/callback', wrap(async (req, res) => {
    const platform = req.params.platform;
    const state = String(req.query.state || '');
    const s = req.session as any;
    const pending: PendingOAuth | undefined = s.oauth?.[state];
    if (s.oauth) delete s.oauth[state];
    if (req.query.error) return finish(res, false, platform, pending?.workspaceId || null, `Connection cancelled or refused: ${String(req.query.error_description || req.query.error).slice(0, 200)}`);
    if (!pending || Date.now() - pending.createdAt > OAUTH_TTL_MS) return finish(res, false, platform, null, 'This sign-in link expired. Close this window and click Connect again.');
    const expectedCb = pending.platform === 'instagram' ? 'facebook' : pending.platform;
    if (expectedCb !== platform) return finish(res, false, platform, pending.workspaceId, 'Mismatched callback.');
    const code = String(req.query.code || '');
    if (!code) return finish(res, false, platform, pending.workspaceId, 'No authorization code returned.');
    const ws = pending.workspaceId;

    try {
      if (platform === 'twitter') {
        const client = new TwitterApi({ clientId: config.twitter.clientId, clientSecret: config.twitter.clientSecret });
        const r = await client.loginWithOAuth2({ code, codeVerifier: pending.verifier!, redirectUri: redirectFor('twitter') });
        const me = await r.client.v2.me({ 'user.fields': ['public_metrics', 'profile_image_url'] });
        const now = new Date();
        await store.saveConnection(ws, {
          platform: 'twitter', accountId: me.data.id, username: me.data.username, avatar: me.data.profile_image_url,
          followers: me.data.public_metrics?.followers_count || 0, connectedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + r.expiresIn * 1000).toISOString(), scopes: r.scope,
        }, { accessToken: r.accessToken, refreshToken: r.refreshToken || null });
        return finish(res, true, 'twitter', ws, `Connected X as @${me.data.username}. You can close this window.`, [{ platform: 'twitter', username: me.data.username }]);
      }
      if (platform === 'linkedin' || platform === 'linkedin_page') {
        const { meta, secret } = await completeLinkedInOAuth(pdeps, platform, code, redirectFor(platform));
        await store.saveConnection(ws, meta, secret);
        return finish(res, true, platform, ws, `Connected LinkedIn as ${meta.username}. You can close this window.`, [{ platform, username: meta.username }]);
      }
      // facebook (+ instagram)
      const tok = await http.get(`${graphBase(pdeps)}/oauth/access_token`, {
        params: { client_id: config.facebook.appId, client_secret: config.facebook.appSecret, redirect_uri: redirectFor('facebook'), code },
      });
      const { secret, fbMeta, igMeta } = await buildMetaConnections(pdeps, tok.data.access_token);
      await store.saveConnection(ws, fbMeta, secret);
      const accounts: any[] = [{ platform: 'facebook', username: fbMeta.username }];
      if (igMeta) { await store.saveConnection(ws, igMeta, secret); accounts.push({ platform: 'instagram', username: igMeta.username }); }
      const msg = igMeta
        ? `Connected Facebook Page "${fbMeta.username}" and Instagram @${igMeta.username}. You can close this window.`
        : `Connected Facebook Page "${fbMeta.username}". No Instagram Business account is linked to it.`;
      return finish(res, true, pending.platform, ws, msg, accounts);
    } catch (e) {
      console.error(`[oauth] ${platform} callback failed: ${safeErrorMessage(e)}`);
      return finish(res, false, platform, ws, `Connection failed: ${safeErrorMessage(e)}`);
    }
  }));

  // ---------- everything else under /api requires a signed-in, allowed user ----------
  app.use('/api', (req, res, next) => (req.path === '/health' || /^\/auth\/[^/]+\/callback$/.test(req.path) ? next() : auth(req, res, next)));

  app.get('/api/me', (req, res) => res.json({ user: currentUser(req) }));

  app.get('/api/config/check', (_req, res) => {
    res.json({ ...platformAvailability(config), ai: { groq: !!config.groqApiKey, gemini: !!config.geminiApiKey }, scheduler: { enabled: config.scheduler.enabled, mode: config.publishMode } });
  });

  // connections (metadata only — tokens never leave the server)
  app.get('/api/connections', wrap(async (req, res) => res.json({ connections: store.listConnections(wsParam(req)) })));

  app.delete('/api/connections/:platform', wrap(async (req, res) => {
    const ws = wsParam(req);
    if (!isKnownPlatform(req.params.platform)) return res.status(400).json({ error: 'Unknown platform' });
    await store.deleteConnection(ws, req.params.platform as PlatformId);
    res.json({ success: true });
  }));

  app.post('/api/connections/:platform/target', wrap(async (req, res) => {
    const ws = wsParam(req);
    const p = req.params.platform as PlatformId;
    const conn = store.listConnections(ws).find(c => c.platform === p);
    const targetId = String(req.body?.targetId || '');
    if (!conn) return res.status(404).json({ error: 'Not connected' });
    const t = conn.targets?.find(x => x.id === targetId);
    if (!t) return res.status(400).json({ error: 'That page/account is not available on this connection' });
    await store.updateConnection(ws, p, { meta: { selectedTargetId: t.id, username: t.name.replace(/^@/, '') } });
    res.json({ success: true });
  }));

  // publish now
  app.post('/api/publish/:platform', wrap(async (req, res) => {
    const ws = wsParam(req);
    const r = await publishTo(pdeps, req.params.platform, ws, {
      text: String(req.body?.text || ''), mediaUrls: cleanUrls(req.body?.mediaUrls), link: cleanLink(req.body?.link), targetId: req.body?.targetId ? String(req.body.targetId) : null,
    });
    res.json({ success: true, ...r });
  }));

  // scheduled posts (server-side queue + built-in scheduler)
  app.post('/api/posts', wrap(async (req, res) => {
    const ws = wsParam(req);
    const b = req.body || {};
    const platforms: string[] = Array.isArray(b.platforms) ? b.platforms.map(String) : [];
    if (!platforms.length || !platforms.every(isKnownPlatform)) return res.status(400).json({ error: 'platforms must be a non-empty list of supported platforms' });
    const when = Date.parse(String(b.scheduledAt || ''));
    if (!Number.isFinite(when)) return res.status(400).json({ error: 'scheduledAt must be an ISO date-time' });
    const content = String(b.content || '');
    if (!content.trim() && !cleanUrls(b.mediaUrls).length) return res.status(400).json({ error: 'Post has no text or media' });
    const post = await store.addPost({
      workspaceId: ws, createdBy: currentUser(req).uid, firestorePostId: b.firestorePostId ? String(b.firestorePostId) : null,
      content, platformContent: b.platformContent && typeof b.platformContent === 'object' ? b.platformContent : null,
      platforms: platforms as PlatformId[], mediaUrls: cleanUrls(b.mediaUrls), link: cleanLink(b.link), scheduledAt: new Date(when).toISOString(),
    });
    res.status(201).json({ post });
  }));

  app.get('/api/posts', wrap(async (req, res) => res.json({ posts: store.listPosts(wsParam(req)) })));

  app.delete('/api/posts/:id', wrap(async (req, res) => {
    const ws = wsParam(req);
    const p = store.getPost(req.params.id);
    if (!p || p.workspaceId !== ws) return res.status(404).json({ error: 'Not found' });
    if (p.status !== 'scheduled') return res.status(409).json({ error: `Cannot cancel a post that is ${p.status}` });
    res.json({ post: await store.updatePost(p.id, { status: 'cancelled' }) });
  }));

  app.post('/api/posts/:id/retry', wrap(async (req, res) => {
    const ws = wsParam(req);
    const p = store.getPost(req.params.id);
    if (!p || p.workspaceId !== ws) return res.status(404).json({ error: 'Not found' });
    if (!['failed', 'partial'].includes(p.status)) return res.status(409).json({ error: `Cannot retry a post that is ${p.status}` });
    res.json({ post: await runPost(pdeps, p) });
  }));

  // analytics (server uses stored tokens)
  app.get('/api/analytics/:platform/:postId', wrap(async (req, res) => {
    const ws = wsParam(req);
    if (req.params.platform !== 'twitter') return res.status(501).json({ error: `Analytics for ${req.params.platform} are not implemented yet.` });
    const conn = store.getConnection<{ accessToken: string }>(ws, 'twitter');
    if (!conn) return res.status(400).json({ error: 'X is not connected' });
    try {
      const t = await new TwitterApi(conn.secret.accessToken).v2.singleTweet(req.params.postId, { 'tweet.fields': ['public_metrics'] });
      res.json({ success: true, data: t.data?.public_metrics });
    } catch (e) {
      res.status(502).json({ error: safeErrorMessage(e) });
    }
  }));

  // ---------- AI (server-side keys only) ----------
  app.post('/api/ai/generate', wrap(async (req, res) => {
    const { prompt, model, provider } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    const useProvider = provider === 'gemini' ? 'gemini' : 'groq';
    try {
      let text = '';
      if (useProvider === 'groq') {
        if (!config.groqApiKey) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server' });
        const r = await http.post('https://api.groq.com/openai/v1/chat/completions',
          { model: model || 'llama-3.1-8b-instant', messages: [{ role: 'user', content: String(prompt) }], temperature: 0.7, max_tokens: 2048 },
          { headers: { Authorization: `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' } });
        text = r.data?.choices?.[0]?.message?.content || '';
      } else {
        if (!config.geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' });
        const r = await http.post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:generateContent`,
          { contents: [{ role: 'user', parts: [{ text: String(prompt) }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } },
          { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiApiKey } });
        text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      res.json({ text });
    } catch (e) {
      console.error(`[ai] ${useProvider} error: ${safeErrorMessage(e)}`);
      res.status(502).json({ error: safeErrorMessage(e) });
    }
  }));

  /** OpenAI-compatible Groq chat proxy used by the UI's "Groq" provider (key stays on the server). */
  app.post('/api/ai/groq/chat', wrap(async (req, res) => {
    if (!config.groqApiKey) return res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server' });
    const { model, messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ error: 'Missing messages' });
    try {
      const r = await http.post('https://api.groq.com/openai/v1/chat/completions',
        { model: model || 'llama-3.1-8b-instant', messages: messages.slice(0, 50) },
        { headers: { Authorization: `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' } });
      res.json(r.data);
    } catch (e) {
      res.status(502).json({ error: { message: safeErrorMessage(e) } });
    }
  }));

  // Unknown API routes: JSON 404 (instead of falling through to the SPA)
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}

/** Final error handler: no stack traces or provider internals to clients/logs. */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof URIError || err?.status === 400 && err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Bad request' });
  }
  if (err instanceof PublishError) return res.status(err.httpStatus).json({ error: err.message, code: err.code });
  console.error(`[http] ${safeErrorMessage(err)}`);
  res.status(500).json({ error: 'Server error' });
}
