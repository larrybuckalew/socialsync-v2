import dotenv from 'dotenv';
import path from 'path';

// Load .env.local first (developer overrides), then .env. Existing process env always wins.
dotenv.config({ path: [path.join(process.cwd(), '.env.local'), path.join(process.cwd(), '.env')], quiet: true } as any);

const WEAK_SECRETS = new Set(['super-secret-key', 'changeme', 'secret', 'your-session-secret', '']);

function bool(v: string | undefined, def = false) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function list(v: string | undefined): string[] {
  return (v || '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

export interface AppConfig {
  nodeEnv: string;
  isProd: boolean;
  host: string;
  port: number;
  appUrl: string;
  sessionSecret: string;
  tokenEncryptionKey: Buffer;
  dataDir: string;
  firebaseProjectId: string;
  allowedEmails: string[];
  allowedUids: string[];
  allowUnverifiedEmail: boolean;
  allowAnyFirebaseUser: boolean;
  scheduler: { enabled: boolean; intervalMs: number };
  publishMode: 'native' | 'n8n';
  n8nWebhookUrl: string;
  groqApiKey: string;
  geminiApiKey: string;
  twitter: { clientId: string; clientSecret: string };
  linkedin: { clientId: string; clientSecret: string; scopes: string[] };
  linkedinOrg: { clientId: string; clientSecret: string; scopes: string[] };
  linkedinApiVersion: string;
  facebook: { appId: string; appSecret: string; scopes: string[]; graphVersion: string; configId: string };
}

export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  if (!raw) return null;
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  try {
    const b = Buffer.from(v, 'base64');
    if (b.length === 32) return b;
  } catch { /* ignore */ }
  return null;
}

/**
 * Builds the config from process.env. Throws (with variable NAMES only, never values)
 * when something required is missing or unsafe.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const errors: string[] = [];
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const sessionSecret = env.SESSION_SECRET || '';
  if (WEAK_SECRETS.has(sessionSecret) || sessionSecret.length < 32) {
    errors.push('SESSION_SECRET must be set to a random string of at least 32 characters (e.g. `openssl rand -hex 32`).');
  }

  const key = parseEncryptionKey(env.TOKEN_ENCRYPTION_KEY);
  if (!key) errors.push('TOKEN_ENCRYPTION_KEY must be 32 bytes, given as 64 hex chars or base64 (e.g. `openssl rand -hex 32`).');

  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(appUrl)) errors.push('APP_URL must be set (e.g. https://socialsync.aisetuppros.com).');
  if (isProd && appUrl && !appUrl.startsWith('https://')) errors.push('APP_URL must use https in production.');

  const firebaseProjectId = env.FIREBASE_PROJECT_ID || env.VITE_FIREBASE_PROJECT_ID || '';
  if (!firebaseProjectId) errors.push('FIREBASE_PROJECT_ID must be set (the Firebase project the web app signs in to).');

  const allowedEmails = list(env.ALLOWED_EMAILS).map(e => e.toLowerCase());
  const allowedUids = list(env.ALLOWED_UIDS);
  const allowAnyFirebaseUser = bool(env.ALLOW_ANY_FIREBASE_USER);
  if (allowedEmails.length === 0 && allowedUids.length === 0 && !allowAnyFirebaseUser) {
    errors.push('ALLOWED_EMAILS (or ALLOWED_UIDS) must list who may use the app (ALLOW_ANY_FIREBASE_USER=true is not recommended).');
  }

  const publishMode = (env.PUBLISH_MODE || 'native').toLowerCase() === 'n8n' ? 'n8n' : 'native';
  const n8nWebhookUrl = env.N8N_WEBHOOK_URL || '';
  if (publishMode === 'n8n' && !n8nWebhookUrl) errors.push('PUBLISH_MODE=n8n requires N8N_WEBHOOK_URL.');

  if (errors.length) {
    const e = new Error('SocialSync configuration is incomplete:\n - ' + errors.join('\n - '));
    (e as any).configErrors = errors;
    throw e;
  }

  return {
    nodeEnv,
    isProd,
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT) || 3460,
    appUrl,
    sessionSecret,
    tokenEncryptionKey: key!,
    dataDir: env.DATA_DIR || path.join(process.cwd(), 'data'),
    firebaseProjectId,
    allowedEmails,
    allowedUids,
    allowUnverifiedEmail: bool(env.ALLOW_UNVERIFIED_EMAIL),
    allowAnyFirebaseUser,
    scheduler: { enabled: bool(env.SCHEDULER_ENABLED, true), intervalMs: Math.max(15000, Number(env.SCHEDULER_INTERVAL_MS) || 60000) },
    publishMode,
    n8nWebhookUrl,
    groqApiKey: env.GROQ_API_KEY || '',
    geminiApiKey: env.GEMINI_API_KEY || '',
    twitter: { clientId: env.TWITTER_CLIENT_ID || '', clientSecret: env.TWITTER_CLIENT_SECRET || '' },
    linkedin: {
      clientId: env.LINKEDIN_CLIENT_ID || '',
      clientSecret: env.LINKEDIN_CLIENT_SECRET || '',
      scopes: list(env.LINKEDIN_SCOPES).length ? list(env.LINKEDIN_SCOPES) : ['openid', 'profile', 'w_member_social'],
    },
    linkedinOrg: {
      clientId: env.LINKEDIN_ORG_CLIENT_ID || '',
      clientSecret: env.LINKEDIN_ORG_CLIENT_SECRET || '',
      scopes: list(env.LINKEDIN_ORG_SCOPES).length
        ? list(env.LINKEDIN_ORG_SCOPES)
        : ['r_basicprofile', 'w_organization_social', 'r_organization_social', 'rw_organization_admin'],
    },
    linkedinApiVersion: env.LINKEDIN_API_VERSION || '202610',
    facebook: {
      appId: env.FACEBOOK_APP_ID || '',
      appSecret: env.FACEBOOK_APP_SECRET || '',
      configId: env.FACEBOOK_LOGIN_CONFIG_ID || '',
      scopes: list(env.FACEBOOK_SCOPES).length
        ? list(env.FACEBOOK_SCOPES)
        : ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish', 'business_management'],
      graphVersion: env.FACEBOOK_GRAPH_VERSION || 'v24.0',
    },
  };
}

export function platformAvailability(c: AppConfig) {
  return {
    twitter: !!(c.twitter.clientId && c.twitter.clientSecret),
    linkedin: !!(c.linkedin.clientId && c.linkedin.clientSecret),
    linkedin_page: !!(c.linkedinOrg.clientId && c.linkedinOrg.clientSecret),
    facebook: !!(c.facebook.appId && c.facebook.appSecret),
    instagram: !!(c.facebook.appId && c.facebook.appSecret),
    tiktok: false,
    youtube: false,
    pinterest: false,
  };
}
