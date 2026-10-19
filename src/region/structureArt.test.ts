import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ModelLibrary } from '../assets/swap/ModelLibrary';
import { diskSource } from '../assets/swap/testing/diskSource';
import { SWAP_ASSETS } from '../assets/swap/swapModels';
import { BRIGHTWATER_LAYOUT } from './brightwater.layout';
import { BuildingLookup } from './buildingLookup';
import { DEADROAD_LAYOUT } from './deadroad.layout';
import { WALL_THICKNESS } from './geometry';
import { DOOR_HEIGHT, structureHeight } from './greybox';
import type { StructureSpec } from './layoutTypes';
import { createStructureArt } from './structureArt';

let lib: ModelLibrary;
let source: Awaited<ReturnType<typeof diskSource>>;
let art: ReturnType<typeof createStructureArt>;
beforeAll(async () => {
  source = await diskSource();
  lib = new ModelLibrary(source);
  art = createStructureArt(lib);
});

const swapped = (l: { structures: StructureSpec[] }) => l.structures.filter((s) => ['house', 'tavern', 'mill', 'well', 'pole', 'fence', 'yard-fence', 'gate', 'chapel', 'bakery'].includes(s.kind) && !(s.kind === 'chapel' && s.mode !== 'enterable'));
const aabb = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
};

describe('structure art (Brightwater and the Dead Road, real geometry)', () => {
  it('builds art for every swapped structure and none for the kinds it leaves alone', async () => {
    for (const l of [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT]) {
      for (const s of swapped(l)) expect(await art(s), s.id).not.toBeNull();
      for (const s of l.structures.filter((x) => ['rock', 'altar', 'waystone', 'cart', 'loft', 'board', 'stair', 'bridge'].includes(x.kind))) {
        expect(await art(s), s.id).toBeNull();
      }
    }
  });

  it('keeps every visual inside its collider footprint (roofs may overhang 0.5 m) and covering most of it', async () => {
    const report: string[] = [];
    for (const l of [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT]) {
      for (const s of swapped(l)) {
        if (s.kind === 'pole') continue;
        const box = aabb((await art(s))!);
        const [w, d] = s.footprint;
        const tol = 0.5;
        expect(box.max.x, s.id).toBeLessThanOrEqual(w / 2 + tol);
        expect(box.min.x, s.id).toBeGreaterThanOrEqual(-w / 2 - tol);
        expect(box.max.z, s.id).toBeLessThanOrEqual(d / 2 + tol);
        expect(box.min.z, s.id).toBeGreaterThanOrEqual(-d / 2 - tol);
        expect(box.min.y, s.id).toBeGreaterThanOrEqual(-0.01);
        // A fence is a line: only its long axis has to be covered.
        const thin = Math.min(w, d) < 1.5;
        const cx = Math.min(1, (box.max.x - box.min.x) / w);
        const cz = Math.min(1, (box.max.z - box.min.z) / d);
        const cover = thin ? (w >= d ? cx : cz) : cx * cz;
        report.push(`${s.id} ${(cover * 100).toFixed(0)}%`);
        if (s.kind !== 'well') expect(cover, `${s.id} covers too little of its collider`).toBeGreaterThan(0.6);
      }
    }
    console.info(report.join('\n'));
  });

  it('rotates the tavern a quarter turn to match its 12 x 10 footprint', async () => {
    const tavern = BRIGHTWATER_LAYOUT.structures.find((s) => s.kind === 'tavern')!;
    const box = aabb((await art(tavern))!);
    expect(box.max.x - box.min.x).toBeGreaterThan(box.max.z - box.min.z);
  });

  it('is deterministic: the same house id gets the same model', async () => {
    const h = BRIGHTWATER_LAYOUT.structures.find((s) => s.kind === 'house')!;
    const a = (await art(h))!;
    const b = (await art(h))!;
    expect(aabb(a).equals(aabb(b))).toBe(true);
  });

  it('keeps the greybox roof on the enterable shells and drops the greybox walls', async () => {
    for (const s of BRIGHTWATER_LAYOUT.structures.filter((x) => x.mode === 'enterable')) {
      const shell = (await art(s))!;
      const names: string[] = [];
      shell.traverse((o) => names.push(o.name));
      expect(names).toContain('roof');
      expect(names).not.toContain('wall');
      expect(names).not.toContain('lintel');
    }
  });

  it('leaves a clear doorway of at least door.width by the door slab height, with no baked leaf', async () => {
    for (const s of BRIGHTWATER_LAYOUT.structures.filter((x) => x.mode === 'enterable' && x.door)) {
      const shell = (await art(s))!;
      shell.traverse((o) => expect(o.name).not.toMatch(/_door(_left|_right)?$/));
      shell.updateMatrixWorld(true);
      const door = s.door!;
      const [w, d] = s.footprint;
      const dir = { W: [1, 0], E: [-1, 0], S: [0, 1], N: [0, -1] }[door.side] as [number, number];
      const from = { W: [-w / 2 - 2, 0], E: [w / 2 + 2, 0], S: [0, -d / 2 - 2], N: [0, d / 2 + 2] }[door.side] as [number, number];
      const across = [-dir[1], dir[0]];
      const ray = new THREE.Raycaster();
      const hits = (lateral: number, y: number) => {
        ray.set(new THREE.Vector3(from[0] + across[0] * lateral, y, from[1] + across[1] * lateral), new THREE.Vector3(dir[0], 0, dir[1]));
        // First hits only count inside the wall thickness (the back wall is across the room).
        return ray.intersectObject(shell, true).filter((h) => h.distance < 2 + WALL_THICKNESS + 0.3);
      };
      for (const lateral of [-door.width / 2 + 0.1, 0, door.width / 2 - 0.1]) {
        // The opening is arched, so the top corners are rounded off; the middle clears the full slab height.
        const ys = Math.abs(lateral) < 0.2 ? [0.3, 1.3, DOOR_HEIGHT - 0.1] : [0.3, 1.3, 1.9];
        for (const y of ys) expect(hits(lateral, y), `${s.id} blocked at ${lateral},${y}`).toHaveLength(0);
      }
      // Beside the opening the wall stands.
      expect(hits(door.width / 2 + 0.7, 1.3).length).toBeGreaterThan(0);
      // And above the slab the lintel closes the wall.
      expect(hits(0, DOOR_HEIGHT + 0.4).length).toBeGreaterThan(0);
    }
  });

  it('stacks courses for the 8 m chapel', async () => {
    const chapel = BRIGHTWATER_LAYOUT.structures.find((s) => s.id === 'chapel')!;
    const box = aabb((await art(chapel))!);
    expect(box.max.y).toBeGreaterThanOrEqual(structureHeight(chapel) - 0.01);
  });
});

describe('the download set of the swapped region', () => {
  it('stays under 4 MB for every model Brightwater and the Dead Road use, atlas textures counted once', async () => {
    for (const layout of [BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT]) for (const spec of swapped(layout)) await art(spec);
    expect(source.loaded.size).toBeGreaterThan(5);
    const fsModule = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsModule)) as unknown as {
      statSync(p: string): { size: number };
      readFileSync(p: string, enc: 'utf8'): string;
    };
    const files = new Set<string>();
    for (const id of source.loaded) {
      const url = SWAP_ASSETS[id].url.replace(import.meta.env.BASE_URL, '/');
      const path = 'public' + url;
      files.add(path);
      if (path.endsWith('.gltf')) {
        const dir = path.slice(0, path.lastIndexOf('/') + 1);
        const json = JSON.parse(fs.readFileSync(path, 'utf8')) as { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
        for (const r of [...(json.buffers ?? []), ...(json.images ?? [])]) if (r.uri && !r.uri.startsWith('data:')) files.add(dir + decodeURIComponent(r.uri));
      }
    }
    let bytes = 0;
    for (const f of files) bytes += fs.statSync(f).size;
    expect(bytes).toBeLessThan(4 * 1024 * 1024);
  });
});

describe('BuildingLookup with art', () => {
  const spec = (kind: string): StructureSpec => ({ id: 's', kind, x: 0, z: 0, yawDeg: 0, footprint: [4, 4], mode: 'solid' }) as StructureSpec;

  it('returns art when it has some and the greybox when it does not', async () => {
    const lookup = new BuildingLookup(undefined, undefined, async (s) => (s.kind === 'house' ? new THREE.Group() : null));
    expect((await lookup.get(spec('house'))).userData.greybox).toBeUndefined();
    expect((await lookup.get(spec('mill'))).userData.greybox).toBe(true);
  });

  it('falls back and warns once per kind when the art throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = new BuildingLookup(undefined, undefined, async () => {
      throw new Error('boom');
    });
    expect((await lookup.get(spec('house'))).userData.greybox).toBe(true);
    await lookup.get(spec('house'));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('keeps the greybox when the library has no source (headless) without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lookup = new BuildingLookup(undefined, undefined, createStructureArt(new ModelLibrary(undefined)));
    expect((await lookup.get(spec('house'))).userData.greybox).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
