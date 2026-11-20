import type { HttpClient } from '../http';
import type { AppConfig } from '../config';
import type { Store, PlatformId } from '../store';

export interface PublishInput {
  text: string;
  mediaUrls: string[];      // public https URLs (e.g. Firebase Storage download URLs)
  link?: string | null;
  targetId?: string | null; // FB page id, IG user id, LinkedIn org URN; defaults to the connection's selected target
}

export interface PublishResult { postId: string; url?: string }

export interface PublisherDeps {
  http: HttpClient;
  config: AppConfig;
  store: Store;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export type Publisher = (deps: PublisherDeps, workspaceId: string, input: PublishInput) => Promise<PublishResult>;

export const isImageUrl = (u: string) => /\.(jpe?g|png|gif|webp)(\?|$)/i.test(u) || /firebasestorage|googleusercontent|image/i.test(u);
export const isVideoUrl = (u: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);

export const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export type { PlatformId };
