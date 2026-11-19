// NEON BAY dev server — serves the static game/ folder over local HTTP.
// Node 22, standard library only, no dependencies. Run `node serve.ts`
// (or `node serve.ts --port 8080`) and open http://localhost:8080.
// ES modules need HTTP, so this exists purely so the game can be played
// and tested locally without any build step. It is not a production
// server: it only reads files under game/, refuses anything outside
// that folder, and serves nothing else.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Folder served, resolved next to this file so the cwd does not matter.
const gameDir = resolve(fileURLToPath(new URL('./game', import.meta.url)));

// Port: --port N wins, anything invalid falls back to 8080.
function pickPort(argv) {
  const at = argv.indexOf('--port');
  const n = at === -1 ? NaN : Number(argv[at + 1]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}
const listenPort = pickPort(process.argv.slice(2));

// Smallest useful MIME table for a browser game.
const byExtension = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.bin', 'application/octet-stream'],
  ['.wasm', 'application/wasm'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
]);

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    reply(res, 400, 'bad request');
    return;
  }
  // Health probe for the test harnesses: answers without touching game/.
  if (pathname === '/__health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, game: 'NEON BAY' }));
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside game/ and reject anything that escapes it.
  const target = resolve(join(gameDir, pathname));
  if (target !== gameDir && !target.startsWith(gameDir + sep)) {
    reply(res, 403, 'forbidden');
    return;
  }

  let bytes;
  try {
    bytes = await readFile(target);
  } catch {
    reply(res, 404, 'not found');
    return;
  }
  res.writeHead(200, {
    'content-type': byExtension.get(extname(target).toLowerCase()) ?? 'application/octet-stream',
    'content-length': bytes.length,
    'cache-control': 'no-store',
  });
  res.end(bytes);
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`NEON BAY: game/ is on http://localhost:${listenPort}`);
});
