import { PublishError } from '../http';
import { appSecretProof } from '../crypto';
import type { PublisherDeps, PublishInput, PublishResult } from './types';
import type { ConnectionMeta } from '../store';

export interface MetaSecret {
  userToken: string;
  pageTokens: Record<string, string>; // pageId -> page access token
}

export function graphBase(deps: PublisherDeps) {
  return `https://graph.facebook.com/${deps.config.facebook.graphVersion}`;
}

/** Adds access_token + appsecret_proof to Graph params. */
export function graphParams(deps: PublisherDeps, token: string, extra: Record<string, any> = {}) {
  const p: Record<string, any> = { ...extra, access_token: token };
  if (deps.config.facebook.appSecret) p.appsecret_proof = appSecretProof(token, deps.config.facebook.appSecret);
  return p;
}

/**
 * After the OAuth code exchange: swap for a long-lived user token, list the Pages the
 * user manages (each with its own Page token) and any linked Instagram Business accounts.
 */
export async function buildMetaConnections(deps: PublisherDeps, shortUserToken: string) {
  const { http, config } = deps;
  const base = graphBase(deps);
  const ll = await http.get(`${base}/oauth/access_token`, {
    params: { grant_type: 'fb_exchange_token', client_id: config.facebook.appId, client_secret: config.facebook.appSecret, fb_exchange_token: shortUserToken },
  });
  const userToken: string = ll.data.access_token || shortUserToken;
  const expiresIn: number | undefined = ll.data.expires_in;

  const me = await http.get(`${base}/me`, { params: graphParams(deps, userToken, { fields: 'id,name' }) });
  const pagesRes = await http.get(`${base}/me/accounts`, {
    params: graphParams(deps, userToken, { fields: 'id,name,access_token,tasks,instagram_business_account{id,username,profile_picture_url,followers_count}', limit: 100 }),
  });
  const pages: any[] = pagesRes.data?.data || [];
  const pageTokens: Record<string, string> = {};
  const fbTargets: ConnectionMeta['targets'] = [];
  const igTargets: ConnectionMeta['targets'] = [];
  for (const pg of pages) {
    if (!pg.access_token) continue;
    pageTokens[pg.id] = pg.access_token;
    fbTargets!.push({ id: String(pg.id), name: String(pg.name || pg.id) });
    const ig = pg.instagram_business_account;
    if (ig?.id) igTargets!.push({ id: String(ig.id), name: ig.username ? `@${ig.username}` : String(ig.id), extra: { pageId: String(pg.id) } });
  }
  const now = (deps.now || (() => new Date()))();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000).toISOString() : null;
  const warnings: string[] = [];
  if (!fbTargets!.length) warnings.push('No Facebook Pages were shared with SocialSync. Reconnect and tick your Page(s) in the Facebook dialog.');

  const secret: MetaSecret = { userToken, pageTokens };
  const fbMeta: ConnectionMeta = {
    platform: 'facebook', accountId: String(me.data.id), username: fbTargets![0]?.name || String(me.data.name || 'Facebook'),
    connectedAt: now.toISOString(), expiresAt, scopes: config.facebook.scopes, targets: fbTargets, selectedTargetId: fbTargets![0]?.id || null, warnings,
  };
  const igMeta: ConnectionMeta | null = igTargets!.length ? {
    platform: 'instagram', accountId: igTargets![0].id, username: igTargets![0].name.replace(/^@/, ''),
    connectedAt: now.toISOString(), expiresAt, scopes: config.facebook.scopes, targets: igTargets, selectedTargetId: igTargets![0].id, warnings: [],
  } : null;
  return { secret, fbMeta, igMeta };
}

export async function publishFacebook(deps: PublisherDeps, workspaceId: string, input: PublishInput): Promise<PublishResult> {
  const conn = deps.store.getConnection<MetaSecret>(workspaceId, 'facebook');
  if (!conn) throw new PublishError('Facebook is not connected for this workspace.', 'not_connected', 400);
  const pageId = input.targetId || conn.meta.selectedTargetId;
  if (!pageId) throw new PublishError('No Facebook Page selected. Reconnect Facebook and grant access to a Page.', 'bad_request', 400);
  const token = conn.secret.pageTokens[pageId];
  if (!token) throw new PublishError('SocialSync has no access token for that Facebook Page. Reconnect Facebook.', 'reconnect_required', 400);

  const base = graphBase(deps);
  const image = input.mediaUrls[0];
  let id: string;
  if (image) {
    const r = await deps.http.post(`${base}/${pageId}/photos`, null, { params: graphParams(deps, token, { url: image, caption: input.text, published: true }) });
    id = r.data.post_id || r.data.id;
  } else {
    const extra: Record<string, any> = { message: input.text };
    if (input.link) extra.link = input.link;
    const r = await deps.http.post(`${base}/${pageId}/feed`, null, { params: graphParams(deps, token, extra) });
    id = r.data.id;
  }
  if (!id) throw new PublishError('Facebook did not return a post id.');
  return { postId: String(id), url: `https://www.facebook.com/${id}` };
}
