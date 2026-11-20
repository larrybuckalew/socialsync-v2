import axios from 'axios';

/** Minimal HTTP surface the publishers use, so tests can swap in a fake. */
export interface HttpResponse<T = any> { status: number; data: T; headers: Record<string, any> }
export interface HttpClient {
  get<T = any>(url: string, opts?: { params?: Record<string, any>; headers?: Record<string, string>; responseType?: 'json' | 'arraybuffer' }): Promise<HttpResponse<T>>;
  post<T = any>(url: string, body?: any, opts?: { params?: Record<string, any>; headers?: Record<string, string> }): Promise<HttpResponse<T>>;
  put<T = any>(url: string, body?: any, opts?: { headers?: Record<string, string> }): Promise<HttpResponse<T>>;
}

export const realHttp: HttpClient = {
  async get(url, opts = {}) {
    const r = await axios.get(url, { params: opts.params, headers: opts.headers, responseType: opts.responseType || 'json', timeout: 30000, maxContentLength: 25 * 1024 * 1024 });
    return { status: r.status, data: r.data, headers: r.headers as any };
  },
  async post(url, body, opts = {}) {
    const r = await axios.post(url, body, { params: opts.params, headers: opts.headers, timeout: 60000 });
    return { status: r.status, data: r.data, headers: r.headers as any };
  },
  async put(url, body, opts = {}) {
    const r = await axios.put(url, body, { headers: opts.headers, timeout: 120000, maxBodyLength: 25 * 1024 * 1024 });
    return { status: r.status, data: r.data, headers: r.headers as any };
  },
};

/** Typed publishing error with a safe, user-facing message (never contains tokens). */
export class PublishError extends Error {
  constructor(message: string, public code: 'not_connected' | 'not_implemented' | 'bad_request' | 'reconnect_required' | 'platform_error' = 'platform_error', public httpStatus = 502) {
    super(message);
  }
}

/**
 * Turn an axios/other error into a short message that is safe to log and store.
 * Deliberately ignores error.config (which contains URLs/params with tokens).
 */
export function safeErrorMessage(e: any): string {
  if (e instanceof PublishError) return e.message;
  const status = e?.response?.status;
  const d = e?.response?.data;
  let msg =
    d?.error?.message ||               // Graph API / Groq
    d?.error_description ||
    d?.message ||                      // LinkedIn
    d?.detail || d?.title ||           // X
    (typeof d?.error === 'string' ? d.error : '') ||
    e?.message || 'Unknown error';
  msg = String(msg).replace(/(access_token|token|key|secret|code)=[^&\s]+/gi, '$1=<redacted>');
  if (msg.length > 500) msg = msg.slice(0, 500) + '…';
  return status ? `HTTP ${status}: ${msg}` : msg;
}
