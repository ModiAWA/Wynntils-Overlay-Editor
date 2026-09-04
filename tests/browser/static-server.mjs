import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number.parseInt(process.env.WYNNTILS_EDITOR_PORT || '4173', 10);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.ttf', 'font/ttf'],
  ['.webp', 'image/webp'],
]);

function resolveRequestPath(requestUrl) {
  const pathname = decodeURIComponent(new URL(requestUrl || '/', 'http://127.0.0.1').pathname);
  const relativePath = pathname === '/' ? 'index.html' : `.${pathname}`;
  const filePath = resolve(editorRoot, relativePath);
  if (filePath !== editorRoot && !filePath.startsWith(`${editorRoot}${sep}`)) return null;
  return filePath;
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || '')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }

  let filePath;
  try {
    filePath = resolveRequestPath(request.url);
  } catch (_error) {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }
  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  try {
    const metadata = await stat(filePath);
    if (!metadata.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': metadata.size,
      'Content-Type': mimeTypes.get(extname(filePath)) || 'application/octet-stream',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  } catch (_error) {
    response.writeHead(404);
    response.end('Not Found');
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Wynntils editor test server listening on http://127.0.0.1:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
