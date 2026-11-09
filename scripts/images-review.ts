/**
 * Local review page for photo picks. Nothing here is part of the app.
 * Approve, Use backup 1, Use backup 2 or Reject. Choices go to
 * assets-src/image-review/choices.json (gitignored).
 *
 * npm run images:review
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const REVIEW = join(ROOT, 'assets-src', 'image-review');
const STATE_PATH = join(REVIEW, 'state.json');
const CHOICES_PATH = join(REVIEW, 'choices.json');
const PORT = 4737;

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function send(res: import('node:http').ServerResponse, status: number, body: string, type: string): void {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ascenda photo review</title>
<style>
  body { font-family: Georgia, serif; margin: 24px; background: #f6f1ec; color: #2b211c; }
  h1 { font-weight: 500; }
  .card { background: white; border-radius: 16px; padding: 16px; margin: 0 0 20px; }
  .brief { margin: 0 0 12px; }
  .row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  figure { margin: 0; }
  img { width: 100%; height: 220px; object-fit: cover; border-radius: 12px; background: #efe4dc; }
  figcaption { font-family: system-ui, sans-serif; font-size: 13px; margin-top: 6px; }
  button { font: 14px system-ui, sans-serif; margin: 12px 8px 0 0; padding: 8px 12px; border-radius: 999px; border: 1px solid #5c3d55; background: white; cursor: pointer; }
  button.on { background: #5c3d55; color: white; }
  .meta { font-family: system-ui, sans-serif; font-size: 13px; color: #6b564c; }
</style>
</head>
<body>
<h1>Photo review</h1>
<p class="meta">Choices save on this computer. Upload uses only Approve or a backup.</p>
<div id="grid"></div>
<script>
async function load() {
  const data = await fetch('/api/state').then((r) => r.json());
  const choices = data.choices || {};
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const slugs = Object.values(data.slugs || {});
  if (!slugs.length) {
    grid.textContent = 'No picks yet. Run npm run images:find first.';
    return;
  }
  for (const item of slugs) {
    const card = document.createElement('section');
    card.className = 'card';
    const title = document.createElement('h2');
    title.textContent = item.slug;
    const brief = document.createElement('p');
    brief.className = 'brief';
    brief.textContent = item.brief || '';
    card.append(title, brief);
    const row = document.createElement('div');
    row.className = 'row';
    const slots = [
      ['pick', item.pick, 'Pick'],
      ['backup-1', (item.backups || [])[0], 'Backup 1'],
      ['backup-2', (item.backups || [])[1], 'Backup 2'],
    ];
    for (const [key, photo, label] of slots) {
      const fig = document.createElement('figure');
      if (photo && photo.file) {
        const img = document.createElement('img');
        img.src = '/file/' + item.slug + '/' + photo.file;
        img.alt = photo.alt_text || label;
        fig.append(img);
      }
      const cap = document.createElement('figcaption');
      cap.textContent = photo
        ? label + ' · ' + photo.score + ' · ' + photo.photographer + (photo.accepted ? '' : ' · did not pass')
        : label + ' · none';
      fig.append(cap);
      row.append(fig);
    }
    card.append(row);
    const actions = [
      ['approve', 'Approve'],
      ['backup-1', 'Use backup 1'],
      ['backup-2', 'Use backup 2'],
      ['reject', 'Reject'],
    ];
    for (const [choice, label] of actions) {
      const button = document.createElement('button');
      button.textContent = label;
      if (choices[item.slug] === choice) button.className = 'on';
      button.onclick = async () => {
        await fetch('/api/choice', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug: item.slug, choice }),
        });
        load();
      };
      card.append(button);
    }
    grid.append(card);
  }
}
load();
</script>
</body>
</html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/') {
    send(res, 200, page, 'text/html; charset=utf-8');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/state') {
    const state = readJson(STATE_PATH) ?? { slugs: {} };
    const choices = readJson(CHOICES_PATH) ?? {};
    send(res, 200, JSON.stringify({ ...(state as object), choices }), 'application/json');
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/file/')) {
    const rel = normalize(decodeURIComponent(url.pathname.slice('/file/'.length)));
    if (rel.includes('..')) {
      send(res, 400, 'Bad path', 'text/plain');
      return;
    }
    const file = join(REVIEW, rel);
    if (!file.startsWith(REVIEW) || !existsSync(file)) {
      send(res, 404, 'Missing', 'text/plain');
      return;
    }
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end(readFileSync(file));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/choice') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { slug?: string; choice?: string };
      const allowed = new Set(['approve', 'backup-1', 'backup-2', 'reject']);
      if (!body.slug || !body.choice || !allowed.has(body.choice)) {
        send(res, 400, 'Bad choice', 'text/plain');
        return;
      }
      const choices = (readJson(CHOICES_PATH) as Record<string, string> | null) ?? {};
      choices[body.slug] = body.choice;
      writeFileSync(CHOICES_PATH, JSON.stringify(choices, null, 2));
      send(res, 200, '{"ok":true}', 'application/json');
    });
    return;
  }
  send(res, 404, 'Not found', 'text/plain');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Photo review: http://127.0.0.1:${PORT}`);
  console.log('Leave this running while you choose. Ctrl+C stops it.');
});
