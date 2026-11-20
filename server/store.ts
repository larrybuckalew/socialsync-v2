import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { encryptJson, decryptJson } from './crypto';

export type PlatformId =
  | 'twitter' | 'linkedin' | 'linkedin_page' | 'facebook' | 'instagram'
  | 'tiktok' | 'youtube' | 'pinterest';

/** Non-secret, safe-to-show connection info. */
export interface ConnectionMeta {
  platform: PlatformId;
  accountId: string;
  username: string;
  avatar?: string;
  followers?: number;
  connectedAt: string;
  expiresAt?: string | null;       // access token expiry if known
  refreshExpiresAt?: string | null;
  scopes?: string[];
  /** facebook: pages; instagram: linked IG accounts; linkedin_page: organizations */
  targets?: { id: string; name: string; extra?: Record<string, string> }[];
  selectedTargetId?: string | null;
  warnings?: string[];
}

interface StoredConnection {
  meta: ConnectionMeta;
  secret: string; // encrypted JSON
}

export type PostStatus = 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed' | 'cancelled';

export interface PlatformResult {
  status: 'pending' | 'published' | 'failed';
  postId?: string;
  url?: string;
  error?: string;
  at?: string;
}

export interface ScheduledPost {
  id: string;
  workspaceId: string;
  createdBy: string;          // firebase uid
  firestorePostId?: string | null;
  content: string;
  platformContent?: Partial<Record<PlatformId, string>> | null;
  platforms: PlatformId[];
  mediaUrls: string[];
  link?: string | null;
  scheduledAt: string;        // ISO UTC
  status: PostStatus;
  attempts: number;
  results: Partial<Record<PlatformId, PlatformResult>>;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoreShape {
  version: 1;
  connections: Record<string, Partial<Record<PlatformId, StoredConnection>>>; // by workspaceId
  posts: ScheduledPost[];
}

/**
 * Tiny JSON-file store. Single process (pm2 fork mode, 1 instance).
 * Secrets are AES-256-GCM encrypted; the file itself is written with mode 0600.
 */
export class Store {
  private data: StoreShape;
  private file: string;
  private writing: Promise<void> = Promise.resolve();

  constructor(private dir: string, private key: Buffer) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, 'socialsync-store.json');
    this.data = { version: 1, connections: {}, posts: [] };
    if (fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    }
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writing = this.writing.then(async () => {
      const tmp = this.file + '.' + process.pid + '.tmp';
      await fs.promises.writeFile(tmp, snapshot, { mode: 0o600 });
      await fs.promises.rename(tmp, this.file);
    });
    return this.writing;
  }

  // ---- connections ----
  async saveConnection(workspaceId: string, meta: ConnectionMeta, secret: unknown) {
    const ws = (this.data.connections[workspaceId] ||= {});
    ws[meta.platform] = { meta, secret: encryptJson(this.key, secret) };
    await this.persist();
  }

  getConnection<S = any>(workspaceId: string, platform: PlatformId): { meta: ConnectionMeta; secret: S } | null {
    const c = this.data.connections[workspaceId]?.[platform];
    if (!c) return null;
    return { meta: c.meta, secret: decryptJson<S>(this.key, c.secret) };
  }

  async updateConnection(workspaceId: string, platform: PlatformId, patch: { meta?: Partial<ConnectionMeta>; secret?: unknown }) {
    const c = this.data.connections[workspaceId]?.[platform];
    if (!c) throw new Error('Connection not found');
    if (patch.meta) c.meta = { ...c.meta, ...patch.meta };
    if (patch.secret !== undefined) c.secret = encryptJson(this.key, patch.secret);
    await this.persist();
  }

  listConnections(workspaceId: string): ConnectionMeta[] {
    return Object.values(this.data.connections[workspaceId] || {}).map(c => c!.meta);
  }

  async deleteConnection(workspaceId: string, platform: PlatformId) {
    if (this.data.connections[workspaceId]) delete this.data.connections[workspaceId]![platform];
    await this.persist();
  }

  // ---- posts ----
  async addPost(p: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt' | 'attempts' | 'results' | 'status'> & { status?: PostStatus }) {
    const now = new Date().toISOString();
    const post: ScheduledPost = {
      ...p,
      id: crypto.randomUUID(),
      status: p.status || 'scheduled',
      attempts: 0,
      results: Object.fromEntries(p.platforms.map(pl => [pl, { status: 'pending' }])),
      createdAt: now,
      updatedAt: now,
    };
    this.data.posts.push(post);
    await this.persist();
    return post;
  }

  getPost(id: string) {
    return this.data.posts.find(p => p.id === id) || null;
  }

  listPosts(workspaceId: string) {
    return this.data.posts.filter(p => p.workspaceId === workspaceId);
  }

  allPosts() {
    return this.data.posts;
  }

  async updatePost(id: string, patch: Partial<ScheduledPost>) {
    const p = this.getPost(id);
    if (!p) throw new Error('Post not found');
    Object.assign(p, patch, { updatedAt: new Date().toISOString() });
    await this.persist();
    return p;
  }

  flush() {
    return this.writing;
  }
}
