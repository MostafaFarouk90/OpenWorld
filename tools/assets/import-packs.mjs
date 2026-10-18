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
//
// Provenance and fit are rebuilt from the selection on every run. Entries for generated files
// (those with a `generated` field, e.g. the horse from tools/assets/blender/convert_horse.py)
// and the licence files beside them are kept. Files in a selected pack's folder that the
// selection no longer lists are deleted.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = join(REPO_ROOT, 'public', 'assets');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * External URIs (buffers and images) a .gltf or .glb file references. Mirrors gltfJson and
 * externalUris in src/assets/provenance.ts, which the tests use; this copy runs in plain Node.
 */
export function externalUris(bytes, name) {
  let json;
  if (name.endsWith('.glb')) {
    if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67) throw new Error(`${name}: not a GLB`);
    const len = bytes.readUInt32LE(12);
    if (20 + len > bytes.length) throw new Error(`${name}: truncated GLB`);
    json = JSON.parse(bytes.subarray(20, 20 + len).toString('utf8'));
  } else {
    json = JSON.parse(bytes.toString('utf8'));
  }
  const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((x) => x.uri)
    .filter((u) => u && !u.startsWith('data:'));
  return uris.map((u) => decodeURIComponent(u));
}

const packDir = (pack) => posix.join(pack.id, pack.dest ?? '');

function main() {
  const clones = process.argv[2];
  if (!clones) throw new Error('usage: import-packs.mjs <clones dir>');
  const selection = JSON.parse(readFileSync(join(REPO_ROOT, 'tools/assets/selection.json'), 'utf8'));

  // Check every pin before copying anything, so a bad clone leaves public/assets untouched.
  for (const pack of selection.packs) {
    const clone = join(clones, basename(pack.repo));
    const head = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (head !== pack.commit) throw new Error(`${clone} is at ${head}, selection pins ${pack.commit}`);
  }

  const provPath = join(ASSETS, 'provenance.json');
  const fitPath = join(ASSETS, 'fit.json');
  const oldProv = existsSync(provPath) ? JSON.parse(readFileSync(provPath, 'utf8')).files : {};
  const oldFit = existsSync(fitPath) ? JSON.parse(readFileSync(fitPath, 'utf8')).models : {};
  const files = {};
  const models = {};
  for (const [rel, e] of Object.entries(oldProv)) {
    if (!e.generated) continue;
    files[rel] = e;
    files[e.licence.path] = oldProv[e.licence.path];
    if (oldFit[rel]) models[rel] = oldFit[rel];
  }

  for (const pack of selection.packs) {
    const clone = join(clones, basename(pack.repo));
    mkdirSync(join(ASSETS, packDir(pack)), { recursive: true });

    const licBytes = readFileSync(join(clone, pack.licence));
    const licDest = posix.join(pack.id, 'LICENSE.txt');
    copyFileSync(join(clone, pack.licence), join(ASSETS, licDest));
    const licence = { path: licDest, upstreamPath: pack.licence, sha256: sha256(licBytes), id: 'CC0-1.0' };
    files[licDest] = { sha256: licence.sha256, bytes: licBytes.length, source: { repo: pack.repo, commit: pack.commit, path: pack.licence }, licence };

    const record = (upstream, destName) => {
      const bytes = readFileSync(join(clone, upstream));
      const rel = posix.join(packDir(pack), destName);
      const prior = files[rel];
      if (prior && (prior.source.path !== upstream || prior.source.repo !== pack.repo)) {
        // Shared textures (one atlas per folder) are fine only when the bytes are identical.
        if (prior.sha256 !== sha256(bytes)) throw new Error(`${rel}: ${prior.source.path} and ${upstream} differ but share this name`);
        return bytes;
      }
      copyFileSync(join(clone, upstream), join(ASSETS, rel));
      files[rel] = { sha256: sha256(bytes), bytes: bytes.length, source: { repo: pack.repo, commit: pack.commit, path: upstream }, licence };
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
        models[posix.join(packDir(pack), name)] = { kind: group.kind, scale: group.scale, yawDeg: 0, yOffset: 0 };
      }
    }

    // Drop files the selection no longer lists.
    const dir = join(ASSETS, packDir(pack));
    for (const name of readdirSync(dir)) {
      const rel = posix.join(packDir(pack), name);
      if (statSync(join(dir, name)).isFile() && !files[rel]) {
        rmSync(join(dir, name));
        console.log(`removed stale ${rel}`);
      }
    }
  }

  const sort = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  for (const rel of Object.keys(oldProv)) if (!files[rel] && existsSync(join(ASSETS, rel))) console.warn(`no longer tracked (delete it or re-add it): ${rel}`);
  writeFileSync(provPath, JSON.stringify({ files: sort(files) }, null, 2) + '\n');
  const fit = { $comment: 'Game-scale factor, yaw and y offset per imported model. yOffset is 0 throughout; pivots vary (see public/assets/README.md).', models: sort(models) };
  writeFileSync(fitPath, JSON.stringify(fit, null, 2) + '\n');
  console.log(`imported ${Object.keys(files).length} files`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
