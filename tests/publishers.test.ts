import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testConfig, tempStore, fakeHttp } from './helpers';
import { encryptJson, decryptJson } from '../server/crypto';
import { loadConfig } from '../server/config';
import { popupHtml } from '../server/popup';
import { safeErrorMessage } from '../server/http';
import { buildMetaConnections } from '../server/publishers/facebook';
import { publishTo } from '../server/publishers';
import { makeTwitterPublisher } from '../server/publishers/twitter';
import { runPost, startScheduler } from '../server/scheduler';
import type { PublisherDeps } from '../server/publishers/types';

const noSleep = async () => {};

test('crypto round-trips and detects tampering', () => {
  const cfg = testConfig();
  const blob = encryptJson(cfg.tokenEncryptionKey, { accessToken: 'abc' });
  assert.ok(!blob.includes('abc'));
  assert.deepEqual(decryptJson(cfg.tokenEncryptionKey, blob), { accessToken: 'abc' });
  const parts = blob.split('.');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptJson(cfg.tokenEncryptionKey, parts.join('.')));
});

test('config refuses weak SESSION_SECRET, missing key and missing allowlist', () => {
  assert.throws(() => testConfig({ SESSION_SECRET: 'super-secret-key' }), /SESSION_SECRET/);
  assert.throws(() => testConfig({ TOKEN_ENCRYPTION_KEY: 'short' }), /TOKEN_ENCRYPTION_KEY/);
  assert.throws(() => testConfig({ ALLOWED_EMAILS: '' }), /ALLOWED_EMAILS/);
  const c = testConfig();
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.port, 3460);
  // error text never echoes values
  try { loadConfig({ SESSION_SECRET: 'super-secret-key' }); } catch (e: any) { assert.ok(!e.message.includes('super-secret-key')); }
});

test('OAuth popup escapes provider data (no script injection) and targets our origin', () => {
  const html = popupHtml('https://socialsync.example.test', { type: 'OAUTH_SUCCESS', accounts: [{ username: "</script><script>alert(1)</script>'" }] }, 'Connected <b>x</b>');
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('\\u003c/script\\u003e'));
  assert.ok(html.includes('"https://socialsync.example.test"'));
  assert.ok(!html.includes("'*'"));
  assert.ok(html.includes('Connected &lt;b&gt;x&lt;/b&gt;'));
});

test('safeErrorMessage never leaks tokens from axios config/urls', () => {
  const err: any = new Error('fail access_token=SECRET123');
  err.config = { params: { access_token: 'SECRET123' } };
  const msg = safeErrorMessage(err);
  assert.ok(!msg.includes('SECRET123'));
});

function metaRoutes() {
  return [
    ['GET', /oauth\/access_token$/, () => ({ data: { access_token: 'LONG_USER', expires_in: 5184000 } })],
    ['GET', /\/me$/, () => ({ data: { id: 'u1', name: 'Larry' } })],
    ['GET', /\/me\/accounts$/, () => ({ data: { data: [{ id: 'p1', name: 'Buckalew Financial', access_token: 'PAGE_TOKEN', instagram_business_account: { id: 'ig1', username: 'bfs' } }] } })],
  ] as any[];
}

async function connectMeta(deps: PublisherDeps) {
  const { secret, fbMeta, igMeta } = await buildMetaConnections(deps, 'SHORT');
  await deps.store.saveConnection('ws1', fbMeta, secret);
  await deps.store.saveConnection('ws1', igMeta!, secret);
}

test('Facebook: builds page connection and publishes text and photo posts with page token + appsecret_proof', async () => {
  const config = testConfig();
  const store = tempStore(config);
  const { http, calls } = fakeHttp([
    ...metaRoutes(),
    ['POST', /\/p1\/feed$/, () => ({ data: { id: 'p1_111' } })],
    ['POST', /\/p1\/photos$/, () => ({ data: { id: 'ph1', post_id: 'p1_222' } })],
  ]);
  const deps = { http, config, store };
  await connectMeta(deps);
  const meta = store.listConnections('ws1').find(c => c.platform === 'facebook')!;
  assert.equal(meta.selectedTargetId, 'p1');
  assert.ok(!JSON.stringify(store.listConnections('ws1')).includes('PAGE_TOKEN'), 'metadata must not contain tokens');

  const r1 = await publishTo(deps, 'facebook', 'ws1', { text: 'Hello', mediaUrls: [], link: 'https://aisetuppros.com' });
  assert.equal(r1.postId, 'p1_111');
  const feed = calls.find(c => c.url.endsWith('/p1/feed'))!;
  assert.equal(feed.params.access_token, 'PAGE_TOKEN');
  assert.equal(feed.params.message, 'Hello');
  assert.equal(feed.params.link, 'https://aisetuppros.com');
  assert.match(feed.params.appsecret_proof, /^[0-9a-f]{64}$/);

  const r2 = await publishTo(deps, 'facebook', 'ws1', { text: 'Pic', mediaUrls: ['https://cdn.example/x.jpg'] });
  assert.equal(r2.postId, 'p1_222');
});

test('Instagram: requires media, then container -> status -> media_publish', async () => {
  const config = testConfig();
  const store = tempStore(config);
  let polls = 0;
  const { http, calls } = fakeHttp([
    ...metaRoutes(),
    ['POST', /\/ig1\/media$/, () => ({ data: { id: 'c1' } })],
    ['GET', /\/c1$/, () => ({ data: { status_code: ++polls < 2 ? 'IN_PROGRESS' : 'FINISHED' } })],
    ['POST', /\/ig1\/media_publish$/, () => ({ data: { id: 'm1' } })],
    ['GET', /\/m1$/, () => ({ data: { permalink: 'https://instagram.com/p/m1' } })],
  ]);
  const deps = { http, config, store, sleep: noSleep };
  await connectMeta(deps);
  await assert.rejects(publishTo(deps, 'instagram', 'ws1', { text: 'no image', mediaUrls: [] }), /requires an image/);
  const r = await publishTo(deps, 'instagram', 'ws1', { text: 'cap', mediaUrls: ['https://cdn.example/x.jpg'] });
  assert.equal(r.postId, 'm1');
  assert.equal(r.url, 'https://instagram.com/p/m1');
  assert.equal(calls.find(c => c.url.endsWith('/ig1/media'))!.params.image_url, 'https://cdn.example/x.jpg');
  assert.equal(calls.find(c => c.url.endsWith('/media_publish'))!.params.creation_id, 'c1');
});

test('LinkedIn Page: posts as organization via /rest/posts with version headers, uploads image', async () => {
  const config = testConfig();
  const store = tempStore(config);
  const { http, calls } = fakeHttp([
    ['POST', /images\?action=initializeUpload$/, () => ({ data: { value: { uploadUrl: 'https://upload.linkedin.example/u1', image: 'urn:li:image:I1' } } })],
    ['GET', /cdn\.example/, () => ({ data: Buffer.from('img') })],
    ['PUT', /upload\.linkedin\.example/, () => ({ status: 201, data: '' })],
    ['POST', /\/rest\/posts$/, () => ({ status: 201, data: '', headers: { 'x-restli-id': 'urn:li:share:999' } })],
  ]);
  await store.saveConnection('ws1', {
    platform: 'linkedin_page', accountId: 'm1', username: 'AI Setup Pros', connectedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 864e5).toISOString(), targets: [{ id: 'urn:li:organization:42', name: 'AI Setup Pros' }], selectedTargetId: 'urn:li:organization:42',
  }, { accessToken: 'LI_TOKEN' });
  const r = await publishTo({ http, config, store }, 'linkedin_page', 'ws1', { text: 'Hi page', mediaUrls: ['https://cdn.example/a.png'] });
  assert.equal(r.postId, 'urn:li:share:999');
  const post = calls.find(c => c.url.endsWith('/rest/posts'))!;
  assert.equal(post.body.author, 'urn:li:organization:42');
  assert.equal(post.body.content.media.id, 'urn:li:image:I1');
  assert.equal(post.headers['LinkedIn-Version'], config.linkedinApiVersion);
  assert.equal(post.headers['X-Restli-Protocol-Version'], '2.0.0');
});

test('LinkedIn: expired token without refresh token asks to reconnect; with refresh token it refreshes', async () => {
  const config = testConfig();
  const store = tempStore(config);
  const { http } = fakeHttp([
    ['POST', /oauth\/v2\/accessToken$/, () => ({ data: { access_token: 'NEW', expires_in: 5184000, refresh_token: 'R2' } })],
    ['POST', /\/rest\/posts$/, (c) => ({ status: 201, headers: { 'x-restli-id': c.headers.Authorization === 'Bearer NEW' ? 'urn:li:share:1' : 'wrong' } })],
  ]);
  const meta = { platform: 'linkedin' as const, accountId: 'p1', username: 'Larry', connectedAt: '', expiresAt: new Date(Date.now() - 1000).toISOString(), targets: [{ id: 'urn:li:person:p1', name: 'Larry' }], selectedTargetId: 'urn:li:person:p1' };
  await store.saveConnection('ws1', meta, { accessToken: 'OLD' });
  await assert.rejects(publishTo({ http, config, store }, 'linkedin', 'ws1', { text: 'x', mediaUrls: [] }), /Reconnect LinkedIn/);
  await store.saveConnection('ws1', meta, { accessToken: 'OLD', refreshToken: 'R1' });
  const r = await publishTo({ http, config, store }, 'linkedin', 'ws1', { text: 'x', mediaUrls: [] });
  assert.equal(r.postId, 'urn:li:share:1');
  assert.equal(store.getConnection<any>('ws1', 'linkedin')!.secret.refreshToken, 'R2');
});

test('X: refreshes an expired token and persists the rotated refresh token', async () => {
  const config = testConfig();
  const store = tempStore(config);
  await store.saveConnection('ws1', { platform: 'twitter', accountId: '1', username: 'larry', connectedAt: '', expiresAt: new Date(Date.now() - 1).toISOString() }, { accessToken: 'OLD', refreshToken: 'RT1' });
  let usedToken = '';
  const pub = makeTwitterPublisher(() => ({
    refresh: async (rt) => { assert.equal(rt, 'RT1'); return { accessToken: 'NEW', refreshToken: 'RT2', expiresIn: 7200 }; },
    forToken: (t) => { usedToken = t; return { v2: { tweet: async () => ({ data: { id: '77', text: 'x' } }) } }; },
  }));
  const r = await pub({ http: fakeHttp([]).http, config, store }, 'ws1', { text: 'hello', mediaUrls: [] });
  assert.equal(r.postId, '77');
  assert.equal(usedToken, 'NEW');
  assert.equal(store.getConnection<any>('ws1', 'twitter')!.secret.refreshToken, 'RT2');
});

test('TikTok/YouTube/Pinterest return honest not_implemented errors (no fake success)', async () => {
  const config = testConfig();
  const deps = { http: fakeHttp([]).http, config, store: tempStore(config) };
  for (const p of ['tiktok', 'youtube', 'pinterest']) {
    await assert.rejects(publishTo(deps, p, 'ws1', { text: 'x', mediaUrls: [] }), (e: any) => e.code === 'not_implemented' && e.httpStatus === 501);
  }
});

test('Graph token errors become reconnect_required without leaking the token', async () => {
  const config = testConfig();
  const store = tempStore(config);
  const { http } = fakeHttp([
    ...metaRoutes(),
    ['POST', /\/p1\/feed$/, () => ({ status: 400, data: { error: { message: 'Error validating access token', code: 190 } } })],
  ]);
  const deps = { http, config, store };
  await connectMeta(deps);
  await assert.rejects(publishTo(deps, 'facebook', 'ws1', { text: 'x', mediaUrls: [] }), (e: any) => e.code === 'reconnect_required' && !e.message.includes('PAGE_TOKEN'));
});

test('scheduler publishes due posts, records per-platform results, and never auto-retries interrupted posts', async () => {
  const config = testConfig();
  const store = tempStore(config);
  const { http } = fakeHttp([...metaRoutes(), ['POST', /\/p1\/feed$/, () => ({ data: { id: 'p1_5' } })]]);
  const deps = { http, config, store };
  await connectMeta(deps);
  const due = await store.addPost({ workspaceId: 'ws1', createdBy: 'u', content: 'Due', platforms: ['facebook', 'tiktok'], mediaUrls: [], scheduledAt: new Date(Date.now() - 1000).toISOString() });
  const later = await store.addPost({ workspaceId: 'ws1', createdBy: 'u', content: 'Later', platforms: ['facebook'], mediaUrls: [], scheduledAt: new Date(Date.now() + 3600e3).toISOString() });
  const stuck = await store.addPost({ workspaceId: 'ws1', createdBy: 'u', content: 'Stuck', platforms: ['facebook'], mediaUrls: [], scheduledAt: new Date().toISOString() });
  await store.updatePost(stuck.id, { status: 'publishing' });

  const sched = startScheduler(deps);
  const n = await sched.tick();
  sched.stop();
  assert.equal(n, 1);
  const d = store.getPost(due.id)!;
  assert.equal(d.status, 'partial');
  assert.equal(d.results.facebook!.status, 'published');
  assert.equal(d.results.facebook!.postId, 'p1_5');
  assert.equal(d.results.tiktok!.status, 'failed');
  assert.match(d.results.tiktok!.error!, /not implemented/);
  assert.equal(store.getPost(later.id)!.status, 'scheduled');
  await store.flush();
  assert.equal(store.getPost(stuck.id)!.status, 'failed');

  // retry only re-attempts the failed platform
  const again = await runPost(deps, d);
  assert.equal(again.results.facebook!.postId, 'p1_5');
});

test('n8n mode hands due posts to the webhook instead of publishing natively', async () => {
  const config = testConfig({ PUBLISH_MODE: 'n8n', N8N_WEBHOOK_URL: 'https://n8n.example/webhook/ss' });
  const store = tempStore(config);
  const { http, calls } = fakeHttp([['POST', /n8n\.example/, () => ({ data: { ok: true } })]]);
  const p = await store.addPost({ workspaceId: 'ws1', createdBy: 'u', content: 'x', platforms: ['facebook'], mediaUrls: [], scheduledAt: new Date().toISOString() });
  const r = await runPost({ http, config, store }, p);
  assert.equal(r.status, 'published');
  assert.equal(calls[0].body.type, 'publish_post');
});
