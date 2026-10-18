#!/usr/bin/env node
// Copies the files listed in tools/assets/selection.json from local clones of the pinned
// upstream repos into public/assets/<pack>/, together with every buffer and texture they
// reference and the pack's licence file. Writes public/assets/provenance.json and
// public/assets/fit.json. Upstream bytes are copied unchanged.
//
//   node tools/assets/import-packs.mjs <dir containing the clones>
//
// Each clone must be named after its repo (e.g. KayKit-Medieval-Hexagon-Pack-1.0) and be
// checked out at the commit the selection pins; the script refuses otherwise.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';

const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), '..', '..');
const ASSETS = join(REPO_ROOT, 'public', 'assets');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** External URIs (buffers and images) a .gltf or .glb file references. */
export function externalUris(bytes, name) {
  let json;
  if (name.endsWith('.glb')) {
    if (bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${name}: not a GLB`);
    const len = bytes.readUInt32LE(12);
    json = JSON.parse(bytes.subarray(20, 20 + len).toString('utf8'));
  } else {
    json = JSON.parse(bytes.toString('utf8'));
  }
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((x) => x.uri)
    .filter((u) => u && !u.startsWith('data:'));
  return uris.map((u) => decodeURIComponent(u));
}

function main() {
  const clones = process.argv[2];
  if (!clones) throw new Error('usage: import-packs.mjs <clones dir>');
  const selection = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/assets/selection.json'), 'utf8'));
  const provPath = join(ASSETS, 'provenance.json');
  const prov = existsSync(provPath) ? JSON.parse(readFileSync(provPath, 'utf8')) : { files: {} };
  const fit = { $comment: 'Game-scale factor, yaw and y offset per imported model; pivots are base centre.', models: {} };

  for (const pack of selection.packs) {
    const clone = join(clones, basename(pack.repo));
    const head = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== pack.commit) throw new Error(`${clone} is at ${head}, selection pins ${pack.commit}`);
    const destDir = join(ASSETS, pack.id, pack.dest ?? '');
    mkdirSync(destDir, { recursive: true });
    // Re-imports start clean for this pack so dropped files leave no stale entries.
    const prefix = posix.join(pack.id, pack.dest ?? '') + '/';
    for (const k of Object.keys(prov.files)) if (k.startsWith(prefix) || k === posix.join(pack.id, 'LICENSE.txt')) delete prov.files[k];

    const licBytes = readFileSync(join(clone, pack.licence));
    const licDest = posix.join(pack.id, 'LICENSE.txt');
    copyFileSync(join(clone, pack.licence), join(ASSETS, licDest));
    const licence = { path: licDest, upstreamPath: pack.licence, sha256: sha256(licBytes), id: 'CC0-1.0' };
    prov.files[licDest] = { sha256: licence.sha256, bytes: licBytes.length, source: { repo: pack.repo, commit: pack.commit, path: pack.licence }, licence };

    const record = (upstream, destName) => {
      const bytes = readFileSync(join(clone, upstream));
      const rel = posix.join(pack.id, pack.dest ?? '', destName);
      const prior = prov.files[rel];
      if (prior && prior.sha256 !== sha256(bytes)) throw new Error(`${rel}: two different upstream files share this name`);
      copyFileSync(join(clone, upstream), join(ASSETS, rel));
      prov.files[rel] = { sha256: sha256(bytes), bytes: bytes.length, source: { repo: pack.repo, commit: pack.commit, path: upstream }, licence };
      return bytes;
    };

    for (const group of pack.groups) {
      for (const file of group.files) {
        const upstream = posix.join(pack.root, file);
        const name = basename(file);
        const bytes = record(upstream, name);
        for (const uri of externalUris(bytes, name)) {
          if (uri.includes('/') || uri.includes('\\')) throw new Error(`${upstream}: nested URI ${uri} not supported`);
          record(posix.join(dirname(upstream), uri), uri);
        }
        fit.models[posix.join(pack.id, pack.dest ?? '', name)] = { kind: group.kind, scale: group.scale, yawDeg: 0, yOffset: 0 };
      }
    }
  }

  const sorted = Object.fromEntries(Object.entries(prov.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(provPath, JSON.stringify({ ...prov, files: sorted }, null, 2) + '\n');
  const fitPath = join(ASSETS, 'fit.json');
  const prevFit = existsSync(fitPath) ? JSON.parse(readFileSync(fitPath, 'utf8')).models : {};
  fit.models = Object.fromEntries(Object.entries({ ...prevFit, ...fit.models }).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(fitPath, JSON.stringify(fit, null, 2) + '\n');
  console.log(`imported ${Object.keys(sorted).length} files`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
