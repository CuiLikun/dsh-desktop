const { isSameOrigin } = require('./runtime.cjs');
// Read only the official startup line. Never treat arbitrary backend output as a URL.
function extractLaunchUrl(output, origin) {
  const text = output.replace(/\u001b\[[0-9;]*m/g, '');
  const matches = text.matchAll(/(?:^|\n)dsh web: (http:\/\/[^\s]+)/g);
  for (const match of matches) {
    try {
      const url = new URL(match[1]);
      if (isSameOrigin(url.href, origin) && !url.username && !url.password && url.pathname === '/' && !url.hash) return url.href;
    } catch { /* Wait for the next complete startup line. */ }
  }
}
async function readBackendPage(launchUrl) {
  const origin = new URL(launchUrl).origin;
  let response = await fetch(launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(3000) });
  let cookie = '';
  if ([302, 303, 307].includes(response.status)) {
    const location = response.headers.get('location');
    const next = location && new URL(location, launchUrl);
    if (!next || !isSameOrigin(next.href, origin)) throw new Error('Unexpected backend redirect');
    cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    await response.body?.cancel();
    response = await fetch(next, { redirect: 'manual', headers: { Cookie: cookie }, signal: AbortSignal.timeout(3000) });
  }
  if (!response.ok) { await response.body?.cancel(); return null; }
  const html = await response.text();
  return html.includes('__DSH_BOOT__') ? { html, cookie } : null;
}
module.exports = { extractLaunchUrl, readBackendPage };
