/**
 * HTML for the OAuth popup. All dynamic data is JSON-encoded and escaped so that
 * names/usernames from providers cannot break out of the <script> (fixes the old XSS),
 * and the message is only posted to our own origin. No tokens are ever included.
 */
export function escapeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function popupHtml(appOrigin: string, message: Record<string, unknown>, visibleText: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>SocialSync</title></head><body>
<p>${escapeHtml(visibleText)}</p>
<script>
(function () {
  var msg = ${escapeForScript(message)};
  var origin = ${escapeForScript(appOrigin)};
  if (window.opener) { window.opener.postMessage(msg, origin); setTimeout(function () { window.close(); }, 300); }
})();
</script></body></html>`;
}
