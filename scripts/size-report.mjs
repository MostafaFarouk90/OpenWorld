// December roadmap T2: the download size after `vite build`, as a Markdown table (design 14.7 budgets the first playable
// download under 15 MB). Run `npm run size` after a build; CI appends it to the build job's summary. Never fails a build.
//
// "First load" is what index.html pulls in directly (its scripts, styles and modulepreloads) plus the Rapier wasm, gzipped
// as a server would send them. Assets fetched later (models, textures, lazy chunks) are listed by type.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'dist';
const BUDGET_MB = 15;

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const mb = (n) => (n / 1024 / 1024).toFixed(2);
const gz = (p) => gzipSync(readFileSync(p)).length;

function report() {
  if (!existsSync(DIST)) return `Size report: no ${DIST}/ folder (run the build first).\n`;
  const files = walk(DIST).map((p) => ({ p, rel: relative(DIST, p).replaceAll('\\', '/'), raw: statSync(p).size }));
  const html = existsSync(join(DIST, 'index.html')) ? readFileSync(join(DIST, 'index.html'), 'utf8') : '';
  const refs = new Set([...html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)].map((m) => m[1].replace(/^.*?assets\//, 'assets/')));
  const first = files.filter((f) => refs.has(f.rel) || f.rel.endsWith('.wasm'));
  const firstGz = first.reduce((s, f) => s + gz(f.p), 0);
  const byType = new Map();
  for (const f of files) {
    const ext = extname(f.rel).slice(1) || 'other';
    const t = byType.get(ext) ?? { n: 0, raw: 0 };
    t.n++;
    t.raw += f.raw;
    byType.set(ext, t);
  }
  const total = files.reduce((s, f) => s + f.raw, 0);
  const lines = [
    '### Download size',
    '',
    `First load (index.html's scripts and styles + wasm, gzipped): **${mb(firstGz)} MB** of a ${BUDGET_MB} MB budget${firstGz > BUDGET_MB * 1024 * 1024 ? ' (over)' : ''}`,
    '',
    '| Type | Files | Size (MB) |',
    '| --- | ---: | ---: |',
    ...[...byType.entries()].sort((a, b) => b[1].raw - a[1].raw).map(([ext, t]) => `| ${ext} | ${t.n} | ${mb(t.raw)} |`),
    `| **all** | ${files.length} | **${mb(total)}** |`,
    '',
  ];
  return lines.join('\n');
}

try {
  process.stdout.write(report());
} catch (e) {
  process.stdout.write(`Size report failed: ${e instanceof Error ? e.message : String(e)}\n`);
}
