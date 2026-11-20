import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { loadConfig, type AppConfig } from '../server/config';
import { Store } from '../server/store';
import type { HttpClient } from '../server/http';

export const TEST_ENV: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  APP_URL: 'https://socialsync.example.test',
  SESSION_SECRET: 'x'.repeat(40),
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  FIREBASE_PROJECT_ID: 'demo-project',
  ALLOWED_EMAILS: 'larry@example.test',
  FACEBOOK_APP_ID: 'fb-app', FACEBOOK_APP_SECRET: 'fb-secret',
  LINKEDIN_CLIENT_ID: 'li', LINKEDIN_CLIENT_SECRET: 'li-secret',
  LINKEDIN_ORG_CLIENT_ID: 'li-org', LINKEDIN_ORG_CLIENT_SECRET: 'li-org-secret',
  TWITTER_CLIENT_ID: 'x', TWITTER_CLIENT_SECRET: 'x-secret',
  SCHEDULER_ENABLED: 'false',
};

export function testConfig(over: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...over });
}

export function tempStore(config: AppConfig) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-test-'));
  return new Store(dir, config.tokenEncryptionKey);
}

export interface Call { method: string; url: string; params?: any; body?: any; headers?: any }
type Handler = (c: Call) => { status?: number; data?: any; headers?: any } | Promise<{ status?: number; data?: any; headers?: any }>;

/** Fake HTTP client: first matching [method, regex] route answers; unmatched calls throw. */
export function fakeHttp(routes: [string, RegExp, Handler][]) {
  const calls: Call[] = [];
  const run = async (c: Call) => {
    calls.push(c);
    const r = routes.find(([m, re]) => m === c.method && re.test(c.url));
    if (!r) throw new Error(`Unexpected ${c.method} ${c.url}`);
    const out = await r[2](c);
    if ((out.status || 200) >= 400) {
      const err: any = new Error(`Request failed with status code ${out.status}`);
      err.response = { status: out.status, data: out.data };
      err.config = { url: c.url, params: c.params }; // like axios: contains tokens -> must never be surfaced
      throw err;
    }
    return { status: out.status || 200, data: out.data, headers: out.headers || {} };
  };
  const http: HttpClient = {
    get: (url, o = {}) => run({ method: 'GET', url, params: o.params, headers: o.headers }),
    post: (url, body, o = {}) => run({ method: 'POST', url, body, params: o.params, headers: o.headers }),
    put: (url, body, o = {}) => run({ method: 'PUT', url, body, headers: o.headers }),
  };
  return { http, calls };
}
