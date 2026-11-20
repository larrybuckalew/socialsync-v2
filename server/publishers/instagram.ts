import { PublishError } from '../http';
import { graphBase, graphParams, type MetaSecret } from './facebook';
import { defaultSleep, isVideoUrl, type PublisherDeps, type PublishInput, type PublishResult } from './types';

/** Instagram Business/Creator publishing via the Graph API: create container -> wait -> media_publish. */
export async function publishInstagram(deps: PublisherDeps, workspaceId: string, input: PublishInput): Promise<PublishResult> {
  const conn = deps.store.getConnection<MetaSecret>(workspaceId, 'instagram');
  if (!conn) throw new PublishError('Instagram is not connected. Connect Facebook/Instagram with an Instagram Business account linked to your Page.', 'not_connected', 400);
  const igId = input.targetId || conn.meta.selectedTargetId;
  const target = conn.meta.targets?.find(t => t.id === igId);
  const pageId = target?.extra?.pageId;
  const token = pageId ? conn.secret.pageTokens[pageId] : undefined;
  if (!igId || !token) throw new PublishError('No Instagram account/token available. Reconnect Instagram.', 'reconnect_required', 400);

  const media = input.mediaUrls[0];
  if (!media) throw new PublishError('Instagram requires an image (or video). Attach media to this post.', 'bad_request', 400);

  const base = graphBase(deps);
  const sleep = deps.sleep || defaultSleep;
  const caption = input.link ? `${input.text}\n\n${input.link}` : input.text;
  const containerParams: Record<string, any> = isVideoUrl(media)
    ? { media_type: 'REELS', video_url: media, caption }
    : { image_url: media, caption };

  const c = await deps.http.post(`${base}/${igId}/media`, null, { params: graphParams(deps, token, containerParams) });
  const creationId = c.data?.id;
  if (!creationId) throw new PublishError('Instagram did not return a media container id.');

  // Images are usually ready immediately; videos take longer.
  const maxChecks = isVideoUrl(media) ? 30 : 10;
  for (let i = 0; i < maxChecks; i++) {
    const st = await deps.http.get(`${base}/${creationId}`, { params: graphParams(deps, token, { fields: 'status_code,status' }) });
    const code = st.data?.status_code;
    if (code === 'FINISHED') break;
    if (code === 'ERROR' || code === 'EXPIRED') throw new PublishError(`Instagram could not process the media (${st.data?.status || code}).`);
    if (i === maxChecks - 1) throw new PublishError('Instagram media was still processing; try again in a few minutes.');
    await sleep(isVideoUrl(media) ? 10000 : 3000);
  }

  const pub = await deps.http.post(`${base}/${igId}/media_publish`, null, { params: graphParams(deps, token, { creation_id: creationId }) });
  const id = pub.data?.id;
  if (!id) throw new PublishError('Instagram did not return a post id.');
  let url: string | undefined;
  try {
    const pl = await deps.http.get(`${base}/${id}`, { params: graphParams(deps, token, { fields: 'permalink' }) });
    url = pl.data?.permalink;
  } catch { /* permalink is optional */ }
  return { postId: String(id), url };
}
