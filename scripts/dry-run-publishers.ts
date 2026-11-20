/**
 * Dry run: exercises the Facebook, Instagram, LinkedIn (personal + Page) and X publishers
 * against a MOCKED HTTP layer and prints every request they would make (tokens redacted).
 * Nothing is sent to any real platform. Usage: npm run dry-run
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfig } from '../server/config';
import { Store } from '../server/store';
import { buildMetaConnections } from '../server/publishers/facebook';
import { publishTo } from '../server/publishers';
import type { HttpClient } from '../server/http';

const redact = (o: any) => JSON.stringify(o, (k, v) => (/token|secret|proof|authorization/i.test(k) ? '<redacted>' : v));

const config = loadConfig({
  NODE_ENV: 'test', APP_URL: 'https://socialsync.aisetuppros.com', SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), FIREBASE_PROJECT_ID: 'dry-run', ALLOWED_EMAILS: 'dry@run.test',
  FACEBOOK_APP_ID: 'app', FACEBOOK_APP_SECRET: 'app-secret', SCHEDULER_ENABLED: 'false',
});
const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-dry-')), config.tokenEncryptionKey);

const respond = (method: string, url: string): { data: any; headers?: any } => {
  if (url.endsWith('/oauth/access_token')) return { data: { access_token: 'LL', expires_in: 5184000 } };
  if (url.endsWith('/me')) return { data: { id: 'user1', name: 'Larry' } };
  if (url.endsWith('/me/accounts')) return { data: { data: [{ id: 'PAGE1', name: 'Buckalew Financial Services', access_token: 'PT', instagram_business_account: { id: 'IG1', username: 'bfs' } }] } };
  if (url.endsWith('/feed') || url.endsWith('/photos')) return { data: { id: 'PAGE1_123', post_id: 'PAGE1_124' } };
  if (url.endsWith('/IG1/media')) return { data: { id: 'CONTAINER1' } };
  if (url.endsWith('/CONTAINER1')) return { data: { status_code: 'FINISHED' } };
  if (url.endsWith('/media_publish')) return { data: { id: 'IGMEDIA1' } };
  if (url.endsWith('/IGMEDIA1')) return { data: { permalink: 'https://www.instagram.com/p/IGMEDIA1/' } };
  if (url.includes('initializeUpload')) return { data: { value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/x', image: 'urn:li:image:1' } } };
  if (url.endsWith('/rest/posts')) return { data: '', headers: { 'x-restli-id': 'urn:li:share:7000000000' } };
  if (method === 'GET' && url.startsWith('https://cdn.')) return { data: Buffer.from('fake image') };
  if (method === 'PUT') return { data: '' };
  throw new Error('No mock for ' + method + ' ' + url);
};
const http: HttpClient = {
  async get(url, o = {}) { console.log('  GET ', url, redact(o.params || {})); return { status: 200, headers: {}, ...respond('GET', url) }; },
  async post(url, b, o = {}) { console.log('  POST', url, redact(o.params || {}), b ? redact(typeof b === 'string' ? '<form>' : b) : ''); return { status: 201, headers: {}, ...respond('POST', url) }; },
  async put(url) { console.log('  PUT ', url, '<binary>'); return { status: 201, headers: {}, data: '' as any }; },
};
const deps = { http, config, store, sleep: async () => {} };

(async () => {
  console.log('\n== Meta connect (code exchange already done)');
  const { secret, fbMeta, igMeta } = await buildMetaConnections(deps, 'SHORT');
  await store.saveConnection('ws', fbMeta, secret);
  if (igMeta) await store.saveConnection('ws', igMeta, secret);
  await store.saveConnection('ws', { platform: 'linkedin', accountId: 'p', username: 'Larry', connectedAt: '', expiresAt: new Date(Date.now() + 864e5).toISOString(), targets: [{ id: 'urn:li:person:p', name: 'Larry' }], selectedTargetId: 'urn:li:person:p' }, { accessToken: 'LI' });
  await store.saveConnection('ws', { platform: 'linkedin_page', accountId: 'p', username: 'AI Setup Pros', connectedAt: '', expiresAt: new Date(Date.now() + 864e5).toISOString(), targets: [{ id: 'urn:li:organization:1', name: 'AI Setup Pros' }], selectedTargetId: 'urn:li:organization:1' }, { accessToken: 'LI' });

  const input = { text: 'Dry run post from SocialSync', mediaUrls: ['https://cdn.example.com/image.jpg'], link: null };
  for (const p of ['facebook', 'instagram', 'linkedin', 'linkedin_page', 'twitter', 'tiktok']) {
    console.log(`\n== ${p}`);
    try {
      const r = await publishTo(deps, p, 'ws', input);
      console.log('  ->', r);
    } catch (e: any) {
      console.log(`  -> ERROR (${e.code}): ${e.message}`);
    }
  }
})();
