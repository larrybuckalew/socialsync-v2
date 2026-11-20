import { TwitterApi } from 'twitter-api-v2';
import { PublishError } from '../http';
import type { PublisherDeps, PublishInput, PublishResult } from './types';

export interface TwitterSecret { accessToken: string; refreshToken?: string | null }

/** Factory so tests can inject a fake client. */
export type TwitterClientFactory = {
  forToken(token: string): { v2: { tweet(text: string): Promise<{ data: { id: string; text: string } }> } };
  refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }>;
};

export function realTwitterFactory(deps: PublisherDeps): TwitterClientFactory {
  return {
    forToken: (token) => new TwitterApi(token) as any,
    refresh: async (rt) => {
      const app = new TwitterApi({ clientId: deps.config.twitter.clientId, clientSecret: deps.config.twitter.clientSecret });
      const r = await app.refreshOAuth2Token(rt);
      return { accessToken: r.accessToken, refreshToken: r.refreshToken, expiresIn: r.expiresIn };
    },
  };
}

export function makeTwitterPublisher(factory?: (deps: PublisherDeps) => TwitterClientFactory) {
  return async (deps: PublisherDeps, workspaceId: string, input: PublishInput): Promise<PublishResult> => {
    const conn = deps.store.getConnection<TwitterSecret>(workspaceId, 'twitter');
    if (!conn) throw new PublishError('X (Twitter) is not connected for this workspace.', 'not_connected', 400);
    const f = (factory || realTwitterFactory)(deps);
    const now = (deps.now || (() => new Date()))();
    let token = conn.secret.accessToken;
    const exp = conn.meta.expiresAt ? Date.parse(conn.meta.expiresAt) : 0;
    if (exp - now.getTime() < 2 * 60 * 1000) {
      if (!conn.secret.refreshToken) throw new PublishError('X access expired. Reconnect X in Settings.', 'reconnect_required', 401);
      const r = await f.refresh(conn.secret.refreshToken);
      token = r.accessToken;
      // X rotates refresh tokens: always persist the new one.
      await deps.store.updateConnection(workspaceId, 'twitter', {
        secret: { accessToken: r.accessToken, refreshToken: r.refreshToken || conn.secret.refreshToken },
        meta: { expiresAt: new Date(now.getTime() + r.expiresIn * 1000).toISOString() },
      });
    }
    if (input.mediaUrls.length) {
      // Media upload on X needs the v2 media endpoint + extra scopes; text-only for now.
      throw new PublishError('Posting images to X is not implemented yet; remove the image or post text only.', 'not_implemented', 501);
    }
    const text = input.link ? `${input.text}\n${input.link}` : input.text;
    const r = await f.forToken(token).v2.tweet(text);
    return { postId: r.data.id, url: `https://x.com/${conn.meta.username}/status/${r.data.id}` };
  };
}
