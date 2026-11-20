import { PublishError } from '../http';
import type { PublisherDeps, PublishInput, PublishResult } from './types';
import type { ConnectionMeta, PlatformId } from '../store';

export interface LinkedInSecret { accessToken: string; refreshToken?: string | null }

export type LinkedInKind = 'linkedin' | 'linkedin_page';

function appFor(deps: PublisherDeps, kind: LinkedInKind) {
  return kind === 'linkedin' ? deps.config.linkedin : deps.config.linkedinOrg;
}

export function restHeaders(deps: PublisherDeps, token: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': deps.config.linkedinApiVersion,
    'X-Restli-Protocol-Version': '2.0.0',
    ...extra,
  };
}

export function authorizeUrl(deps: PublisherDeps, kind: LinkedInKind, redirectUri: string, state: string) {
  const app = appFor(deps, kind);
  const q = new URLSearchParams({ response_type: 'code', client_id: app.clientId, redirect_uri: redirectUri, state, scope: app.scopes.join(' ') });
  return `https://www.linkedin.com/oauth/v2/authorization?${q.toString()}`;
}

async function tokenRequest(deps: PublisherDeps, kind: LinkedInKind, form: Record<string, string>) {
  const app = appFor(deps, kind);
  const body = new URLSearchParams({ ...form, client_id: app.clientId, client_secret: app.clientSecret }).toString();
  const r = await deps.http.post('https://www.linkedin.com/oauth/v2/accessToken', body, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  return r.data as { access_token: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; scope?: string };
}

/** Identify the member: OpenID userinfo when `openid` was granted, otherwise /v2/me (r_basicprofile). */
async function whoAmI(deps: PublisherDeps, kind: LinkedInKind, token: string) {
  const scopes = appFor(deps, kind).scopes;
  if (scopes.includes('openid')) {
    const r = await deps.http.get('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } });
    return { id: String(r.data.sub), name: String(r.data.name || [r.data.given_name, r.data.family_name].filter(Boolean).join(' ') || 'LinkedIn member'), avatar: r.data.picture };
  }
  const r = await deps.http.get('https://api.linkedin.com/v2/me', { headers: { Authorization: `Bearer ${token}` } });
  return { id: String(r.data.id), name: [r.data.localizedFirstName, r.data.localizedLastName].filter(Boolean).join(' ') || 'LinkedIn member', avatar: undefined };
}

/** Pages the member can post to (needs rw_organization_admin or r_organization_admin). */
async function listOrganizations(deps: PublisherDeps, token: string) {
  const orgs: { id: string; name: string }[] = [];
  for (const role of ['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR', 'DIRECT_SPONSORED_CONTENT_POSTER']) {
    const r = await deps.http.get('https://api.linkedin.com/rest/organizationAcls', {
      params: { q: 'roleAssignee', role, state: 'APPROVED', count: 100 },
      headers: restHeaders(deps, token),
    });
    for (const el of r.data?.elements || []) {
      const urn: string = el.organization || el.organizationTarget;
      if (urn && !orgs.some(o => o.id === urn)) orgs.push({ id: urn, name: urn });
    }
  }
  for (const o of orgs) {
    try {
      const id = o.id.split(':').pop();
      const r = await deps.http.get(`https://api.linkedin.com/rest/organizations/${id}`, { headers: restHeaders(deps, token) });
      o.name = r.data?.localizedName || o.name;
    } catch { /* name lookup is best-effort */ }
  }
  return orgs;
}

export async function completeLinkedInOAuth(deps: PublisherDeps, kind: LinkedInKind, code: string, redirectUri: string) {
  const t = await tokenRequest(deps, kind, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const now = (deps.now || (() => new Date()))();
  const me = await whoAmI(deps, kind, t.access_token);
  const warnings: string[] = [];
  let targets: ConnectionMeta['targets'] = [{ id: `urn:li:person:${me.id}`, name: `${me.name} (personal profile)` }];
  let selected: string | null = targets[0].id;
  if (kind === 'linkedin_page') {
    try {
      const orgs = await listOrganizations(deps, t.access_token);
      targets = orgs;
      selected = orgs[0]?.id || null;
      if (!orgs.length) warnings.push('No LinkedIn Pages found where you are an admin/content admin.');
    } catch (e: any) {
      targets = [];
      selected = null;
      warnings.push('Could not list your LinkedIn Pages (the app needs the Community Management API with rw_organization_admin).');
    }
  }
  const meta: ConnectionMeta = {
    platform: kind as PlatformId,
    accountId: me.id,
    username: kind === 'linkedin_page' ? (targets.find(x => x.id === selected)?.name || me.name) : me.name,
    avatar: me.avatar,
    connectedAt: now.toISOString(),
    expiresAt: t.expires_in ? new Date(now.getTime() + t.expires_in * 1000).toISOString() : null,
    refreshExpiresAt: t.refresh_token_expires_in ? new Date(now.getTime() + t.refresh_token_expires_in * 1000).toISOString() : null,
    scopes: t.scope ? t.scope.split(/[ ,]+/) : appFor(deps, kind).scopes,
    targets,
    selectedTargetId: selected,
    warnings,
  };
  const secret: LinkedInSecret = { accessToken: t.access_token, refreshToken: t.refresh_token || null };
  return { meta, secret };
}

async function freshToken(deps: PublisherDeps, workspaceId: string, kind: LinkedInKind) {
  const conn = deps.store.getConnection<LinkedInSecret>(workspaceId, kind);
  if (!conn) throw new PublishError(`${kind === 'linkedin' ? 'LinkedIn (personal)' : 'LinkedIn Page'} is not connected for this workspace.`, 'not_connected', 400);
  const now = (deps.now || (() => new Date()))();
  const exp = conn.meta.expiresAt ? Date.parse(conn.meta.expiresAt) : Infinity;
  if (exp - now.getTime() > 5 * 60 * 1000) return { conn, token: conn.secret.accessToken };
  if (!conn.secret.refreshToken) {
    throw new PublishError('LinkedIn access expired (LinkedIn tokens last 60 days). Reconnect LinkedIn in Settings.', 'reconnect_required', 401);
  }
  const t = await tokenRequest(deps, kind, { grant_type: 'refresh_token', refresh_token: conn.secret.refreshToken });
  const secret: LinkedInSecret = { accessToken: t.access_token, refreshToken: t.refresh_token || conn.secret.refreshToken };
  await deps.store.updateConnection(workspaceId, kind, {
    secret,
    meta: { expiresAt: t.expires_in ? new Date(now.getTime() + t.expires_in * 1000).toISOString() : null },
  });
  return { conn, token: t.access_token };
}

async function uploadImage(deps: PublisherDeps, token: string, owner: string, imageUrl: string) {
  const init = await deps.http.post('https://api.linkedin.com/rest/images?action=initializeUpload',
    { initializeUploadRequest: { owner } },
    { headers: restHeaders(deps, token, { 'Content-Type': 'application/json' }) });
  const uploadUrl: string = init.data?.value?.uploadUrl;
  const imageUrn: string = init.data?.value?.image;
  if (!uploadUrl || !imageUrn) throw new PublishError('LinkedIn did not return an image upload URL.');
  const img = await deps.http.get(imageUrl, { responseType: 'arraybuffer' });
  await deps.http.put(uploadUrl, img.data, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' } });
  return imageUrn;
}

export function makeLinkedInPublisher(kind: LinkedInKind) {
  return async (deps: PublisherDeps, workspaceId: string, input: PublishInput): Promise<PublishResult> => {
    const { conn, token } = await freshToken(deps, workspaceId, kind);
    const author = input.targetId || conn.meta.selectedTargetId;
    if (!author) throw new PublishError('No LinkedIn author selected (person or Page). Reconnect LinkedIn.', 'bad_request', 400);
    if (kind === 'linkedin' && !author.startsWith('urn:li:person:')) throw new PublishError('Personal LinkedIn connection can only post as yourself.', 'bad_request', 400);
    if (kind === 'linkedin_page' && !author.startsWith('urn:li:organization:')) throw new PublishError('LinkedIn Page connection must post as an organization.', 'bad_request', 400);

    const body: any = {
      author,
      commentary: input.text,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    if (input.mediaUrls[0]) {
      const imageUrn = await uploadImage(deps, token, author, input.mediaUrls[0]);
      body.content = { media: { id: imageUrn } };
    } else if (input.link) {
      body.content = { article: { source: input.link, title: input.link } };
    }
    const r = await deps.http.post('https://api.linkedin.com/rest/posts', body, { headers: restHeaders(deps, token, { 'Content-Type': 'application/json' }) });
    const urn: string | undefined = r.headers?.['x-restli-id'] || r.headers?.['x-linkedin-id'] || r.data?.id;
    if (!urn) throw new PublishError('LinkedIn did not return a post id.');
    return { postId: urn, url: `https://www.linkedin.com/feed/update/${urn}/` };
  };
}
