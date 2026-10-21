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

// The media bridge validates Twilio's WSS signature and a call-bound one-use token in Nest.
gateway.on('upgrade', (req, socket, head) => {
  if (!['/api/v1/voice/webhook/media-stream', '/api/v1/voice/webhook/media-stream/'].includes(req.url) ||
      !req.headers['x-twilio-signature']) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  const headers = { ...req.headers };
  delete headers.authorization;
  delete headers['proxy-authorization'];
  const upstream = http.request({ hostname: '127.0.0.1', port: backendPort,
    path: req.url, method: 'GET', headers });
  upstream.setTimeout(10_000, () => upstream.destroy());
  upstream.on('upgrade', (response, stream, upstreamHead) => {
    let handshake = 'HTTP/1.1 101 Switching Protocols\r\n';
    for (let i = 0; i < response.rawHeaders.length; i += 2)
      handshake += `${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}\r\n`;
    socket.write(`${handshake}\r\n`);
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) stream.write(head);
    stream.pipe(socket);
    socket.pipe(stream);
    stream.on('error', () => socket.destroy());
    socket.on('error', () => stream.destroy());
    socket.on('close', () => stream.destroy());
  });
  upstream.on('response', () => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});

gateway.listen(port, '127.0.0.1', () => {
  console.log(`Voice webhook gateway listening on 127.0.0.1:${port}`);
});
