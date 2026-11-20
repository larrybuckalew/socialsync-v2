import { PublishError, safeErrorMessage } from '../http';
import { publishFacebook } from './facebook';
import { publishInstagram } from './instagram';
import { makeLinkedInPublisher } from './linkedin';
import { makeTwitterPublisher } from './twitter';
import type { Publisher, PublisherDeps, PublishInput, PublishResult, PlatformId } from './types';

const notImplemented = (name: string, why: string): Publisher => async () => {
  throw new PublishError(`${name} publishing is not implemented yet (${why}).`, 'not_implemented', 501);
};

export const publishers: Record<string, Publisher> = {
  facebook: publishFacebook,
  instagram: publishInstagram,
  linkedin: makeLinkedInPublisher('linkedin'),
  linkedin_page: makeLinkedInPublisher('linkedin_page'),
  twitter: makeTwitterPublisher(),
  tiktok: notImplemented('TikTok', 'needs video upload + TikTok Content Posting API audit'),
  youtube: notImplemented('YouTube', 'needs video upload via the YouTube Data API'),
  pinterest: notImplemented('Pinterest', 'needs an image + board selection'),
};

export function isKnownPlatform(p: string): p is PlatformId {
  return Object.prototype.hasOwnProperty.call(publishers, p);
}

/** Publish to one platform; never throws raw provider errors (which may carry tokens in config). */
export async function publishTo(deps: PublisherDeps, platform: string, workspaceId: string, input: PublishInput): Promise<PublishResult> {
  const fn = publishers[platform];
  if (!fn) throw new PublishError(`Publishing to "${platform}" is not supported.`, 'not_implemented', 501);
  if (!input.text?.trim() && !input.mediaUrls.length) throw new PublishError('Post has no text or media.', 'bad_request', 400);
  try {
    return await fn(deps, workspaceId, input);
  } catch (e: any) {
    if (e instanceof PublishError) throw e;
    const graphCode = e?.response?.data?.error?.code;
    const status = e?.response?.status;
    if (graphCode === 190 || status === 401) {
      throw new PublishError(`${platform}: access was revoked or expired, reconnect it in Settings. (${safeErrorMessage(e)})`, 'reconnect_required', 401);
    }
    throw new PublishError(`${platform}: ${safeErrorMessage(e)}`, 'platform_error', 502);
  }
}
