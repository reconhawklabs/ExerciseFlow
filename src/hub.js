// Server-Sent Events fan-out. Heartbeats keep the Cloudflare tunnel from idling the stream out.

export const STREAM_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
});

export function createHub({ heartbeatMs = 20_000 } = {}) {
  let clients = new Set();

  const sendAll = (text) => {
    for (const res of clients) res.write(text);
  };

  const timer = setInterval(() => sendAll(': ping\n\n'), heartbeatMs);
  timer.unref();

  return {
    subscribe(req, res) {
      res.writeHead(200, STREAM_HEADERS);
      res.write('retry: 3000\n\n');
      clients = new Set([...clients, res]);
      req.on('close', () => {
        clients = new Set([...clients].filter((c) => c !== res));
      });
    },
    broadcast(event, data) {
      sendAll(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    size() {
      return clients.size;
    },
    close() {
      clearInterval(timer);
      for (const res of clients) res.end?.();
      clients = new Set();
    },
  };
}
