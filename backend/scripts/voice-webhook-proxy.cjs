// Development gateway for a public tunnel: only signed voice webhooks reach Nest.
// Run: node scripts/voice-webhook-proxy.cjs
const http = require('node:http');

const port = Number(process.env.VOICE_PROXY_PORT || 5010);
const backendPort = Number(process.env.VOICE_BACKEND_PORT || 5001);
const gateway = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Noxtill voice webhook gateway');
    return;
  }
  if (req.method !== 'POST' || !path.startsWith('/api/v1/voice/webhook/')) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (!req.headers['x-twilio-signature']) {
    res.writeHead(403);
    res.end();
    return;
  }

  const headers = { ...req.headers };
  for (const key of [
    'authorization',
    'connection',
    'upgrade',
    'proxy-authorization',
  ]) {
    delete headers[key];
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: backendPort,
      path: req.url,
      method: 'POST',
      headers,
    },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.setTimeout(60_000, () => upstream.destroy());
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.on('aborted', () => upstream.destroy());
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
});

gateway.listen(port, '127.0.0.1', () => {
  console.log(`Voice webhook gateway listening on 127.0.0.1:${port}`);
});
