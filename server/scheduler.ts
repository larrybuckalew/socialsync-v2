import { publishTo } from './publishers';
import type { PublisherDeps } from './publishers/types';
import type { PlatformResult, ScheduledPost } from './store';
import { safeErrorMessage } from './http';

export interface SchedulerHandle { tick(): Promise<number>; stop(): void }

const log = (...a: any[]) => console.log('[scheduler]', ...a);

/** Publish one post to all of its not-yet-published platforms and record per-platform results. */
export async function runPost(deps: PublisherDeps, post: ScheduledPost): Promise<ScheduledPost> {
  const { store, config } = deps;
  await store.updatePost(post.id, { status: 'publishing', attempts: post.attempts + 1 });
  const results: ScheduledPost['results'] = { ...post.results };

  if (config.publishMode === 'n8n') {
    try {
      await deps.http.post(config.n8nWebhookUrl, { type: 'publish_post', post: { ...post, results: undefined } }, { headers: { 'Content-Type': 'application/json' } });
      for (const p of post.platforms) results[p] = { status: 'published', at: new Date().toISOString(), error: undefined, postId: 'handed-to-n8n' };
      return store.updatePost(post.id, { status: 'published', results, lastError: null });
    } catch (e) {
      const msg = `n8n webhook failed: ${safeErrorMessage(e)}`;
      for (const p of post.platforms) results[p] = { status: 'failed', error: msg, at: new Date().toISOString() };
      return store.updatePost(post.id, { status: 'failed', results, lastError: msg });
    }
  }

  for (const platform of post.platforms) {
    if (results[platform]?.status === 'published') continue;
    const text = post.platformContent?.[platform] || post.content;
    const at = new Date().toISOString();
    try {
      const r = await publishTo(deps, platform, post.workspaceId, { text, mediaUrls: post.mediaUrls || [], link: post.link || null });
      results[platform] = { status: 'published', postId: r.postId, url: r.url, at } as PlatformResult;
      log(`post ${post.id} -> ${platform}: published`);
    } catch (e: any) {
      results[platform] = { status: 'failed', error: e?.message || safeErrorMessage(e), at };
      log(`post ${post.id} -> ${platform}: failed: ${results[platform]!.error}`);
    }
  }
  const vals = post.platforms.map(p => results[p]?.status);
  const status = vals.every(v => v === 'published') ? 'published' : vals.some(v => v === 'published') ? 'partial' : 'failed';
  const lastError = post.platforms.map(p => results[p]?.error ? `${p}: ${results[p]!.error}` : '').filter(Boolean).join(' | ') || null;
  return store.updatePost(post.id, { status, results, lastError });
}

export function startScheduler(deps: PublisherDeps): SchedulerHandle {
  const { store, config } = deps;
  // Posts caught mid-publish by a crash/restart are NOT retried automatically (could double-post).
  for (const p of store.allPosts()) {
    if (p.status === 'publishing') {
      void store.updatePost(p.id, { status: 'failed', lastError: 'Interrupted by a server restart while publishing. Check the platforms, then use Retry if it did not post.' });
    }
  }
  let running = false;
  const tick = async () => {
    if (running) return 0;
    running = true;
    let n = 0;
    try {
      const now = (deps.now || (() => new Date()))().getTime();
      const due = store.allPosts().filter(p => p.status === 'scheduled' && Date.parse(p.scheduledAt) <= now);
      for (const p of due) {
        n++;
        try { await runPost(deps, p); } catch (e) { log(`post ${p.id} crashed: ${safeErrorMessage(e)}`); }
      }
    } finally {
      running = false;
    }
    return n;
  };
  const timer = config.scheduler.enabled ? setInterval(() => { void tick(); }, config.scheduler.intervalMs) : null;
  if (timer) { timer.unref?.(); log(`running every ${Math.round(config.scheduler.intervalMs / 1000)}s (mode: ${config.publishMode})`); }
  else log('disabled (SCHEDULER_ENABLED=false)');
  return { tick, stop: () => { if (timer) clearInterval(timer); } };
}
