import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';
import { testConfig, tempStore, fakeHttp } from './helpers';
import { createApp, errorHandler } from '../server/app';

async function withServer(fn: (base: string, store: any) => Promise<void>) {
  const config = testConfig();
  const store = tempStore(config);
  const verifyToken = async (t: string) => {
    if (t === 'good') return { sub: 'uid-larry', email: 'larry@example.test', email_verified: true } as any;
    if (t === 'stranger') return { sub: 'uid-x', email: 'x@evil.test', email_verified: true } as any;
    if (t === 'unverified') return { sub: 'uid-u', email: 'larry@example.test', email_verified: false } as any;
    throw new Error('bad token');
  };
  const app = createApp(config, { store, http: fakeHttp([]).http, verifyToken });
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { await fn(base, store); } finally { server.close(); }
}

const H = (t?: string) => (t ? { Authorization: `Bearer ${t}` } : {});

test('API: health is public; everything else requires an allowed, verified Firebase user', async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/connections?workspaceId=ws1`)).status, 401);
    assert.equal((await fetch(`${base}/api/connections?workspaceId=ws1`, { headers: H('garbage') })).status, 401);
    assert.equal((await fetch(`${base}/api/connections?workspaceId=ws1`, { headers: H('stranger') })).status, 403);
    assert.equal((await fetch(`${base}/api/connections?workspaceId=ws1`, { headers: H('unverified') })).status, 403);
    assert.equal((await fetch(`${base}/api/connections?workspaceId=ws1`, { headers: H('good') })).status, 200);
    assert.equal((await fetch(`${base}/api/config/check`)).status, 401);
    assert.equal((await fetch(`${base}/api/publish/facebook`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/api/ai/generate`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${base}/api/auth/facebook/login?workspaceId=ws1`)).status, 401);
    const nf = await fetch(`${base}/api/workspaces`, { headers: H('good') });
    assert.equal(nf.status, 404);
  });
});

test('API: connections endpoint returns metadata only, never tokens', async () => {
  await withServer(async (base, store) => {
    await store.saveConnection('ws1', { platform: 'facebook', accountId: 'u', username: 'BFS', connectedAt: '' }, { userToken: 'SECRET_USER', pageTokens: { p: 'SECRET_PAGE' } });
    const body = await (await fetch(`${base}/api/connections?workspaceId=ws1`, { headers: H('good') })).text();
    assert.ok(body.includes('BFS'));
    assert.ok(!body.includes('SECRET'));
  });
});

test('API: OAuth login returns provider URL with exact redirect URI; callback rejects unknown state', async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/api/auth/facebook/login?workspaceId=ws1`, { headers: H('good') });
    assert.equal(r.status, 200);
    const { url } = await r.json();
    const u = new URL(url);
    assert.equal(u.searchParams.get('redirect_uri'), 'https://socialsync.example.test/api/auth/facebook/callback');
    assert.match(u.searchParams.get('scope')!, /pages_manage_posts/);
    assert.ok((u.searchParams.get('state') || '').length >= 24);
    const li = await (await fetch(`${base}/api/auth/linkedin_page/login?workspaceId=ws1`, { headers: H('good') })).json();
    assert.match(new URL(li.url).searchParams.get('scope')!, /w_organization_social/);
    const cb = await fetch(`${base}/api/auth/facebook/callback?state=nope&code=abc`);
    assert.equal(cb.status, 400);
    assert.match(await cb.text(), /expired/);
    assert.equal((await fetch(`${base}/api/auth/tiktok/login?workspaceId=ws1`, { headers: H('good') })).status, 501);
  });
});

test('API: schedule, list, cancel; validation; malformed URLs do not crash', async () => {
  await withServer(async (base) => {
    const bad = await fetch(`${base}/api/posts`, { method: 'POST', headers: { ...H('good'), 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: 'ws1', platforms: ['myspace'], scheduledAt: 'x', content: 'a' }) });
    assert.equal(bad.status, 400);
    const ok = await fetch(`${base}/api/posts`, { method: 'POST', headers: { ...H('good'), 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: 'ws1', platforms: ['facebook'], scheduledAt: '2030-01-01T15:00:00.000Z', content: 'Hello', mediaUrls: ['http://insecure/x.jpg', 'https://ok/x.jpg'] }) });
    assert.equal(ok.status, 201);
    const { post } = await ok.json();
    assert.deepEqual(post.mediaUrls, ['https://ok/x.jpg']);
    const list = await (await fetch(`${base}/api/posts?workspaceId=ws1`, { headers: H('good') })).json();
    assert.equal(list.posts.length, 1);
    const del = await fetch(`${base}/api/posts/${post.id}?workspaceId=ws1`, { method: 'DELETE', headers: H('good') });
    assert.equal((await del.json()).post.status, 'cancelled');
    const weird = await fetch(`${base}/api/%C0`);
    assert.ok([400, 401, 404].includes(weird.status));
    const pub = await fetch(`${base}/api/publish/facebook`, { method: 'POST', headers: { ...H('good'), 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: 'ws1', text: 'x' }) });
    assert.equal(pub.status, 400);
    assert.match((await pub.json()).error, /not connected/);
  });
});
