const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { extractLaunchUrl, readBackendPage } = require('../src/backend.cjs');
test('startup URL parsing accepts official line and rejects wrong origins', () => {
  const origin = 'http://127.0.0.1:3080';
  assert.equal(extractLaunchUrl('noise\ndsh web: ' + origin + '/?token=example\n', origin), origin + '/?token=example');
  assert.equal(extractLaunchUrl('dsh web: ' + origin + '\n', origin), origin + '/');
  for (const url of ['http://127.0.0.1:30801/', 'http://evil.test/', 'http://user@127.0.0.1:3080/', origin + '/wrong']) {
    assert.equal(extractLaunchUrl('dsh web: ' + url + '\n', origin), undefined);
  }
  assert.equal(extractLaunchUrl('log: ' + origin + '/?token=example', origin), undefined);
});
test('readiness exchanges token for cookie and verifies authenticated Harness page', async t => {
  const server = http.createServer((req, res) => {
    if (req.url === '/?token=example') {
      res.writeHead(303, { Location: '/', 'Set-Cookie': 'session=test; HttpOnly; Path=/' }); res.end();
    } else if (req.headers.cookie === 'session=test') {
      res.end('<html><script>window.__DSH_BOOT__={}</script></html>');
    } else { res.writeHead(401); res.end('Sign in'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = 'http://127.0.0.1:' + server.address().port;
  assert.equal(await readBackendPage(origin), null);
  const result = await readBackendPage(origin + '/?token=example');
  assert.equal(result.cookie, 'session=test');
  assert.match(result.html, /__DSH_BOOT__/);
});
test('readiness never forwards credentials through an external redirect', async t => {
  const server = http.createServer((_req, res) => {
    res.writeHead(303, { Location: 'http://example.invalid/', 'Set-Cookie': 'secret=test' }); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  await assert.rejects(readBackendPage('http://127.0.0.1:' + server.address().port), /Unexpected backend redirect/);
});
