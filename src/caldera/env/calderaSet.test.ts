// Act 5 N1 PR 3: the Lava Stair's channels for M48, the Anvil of Ages, and the art on N6's D10 arena.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { envDiskSource } from '../../env/testing/envDiskSource';
import { TILES } from '../../env/tiles';
import { heightAt } from '../../terrain/heightfield';
import { ANVIL_ARENA_LAYOUT } from '../../bosses/act5/ulthred/anvilArena';
import { QUEST_WORLD_ANCHORS } from '../../quests/content/act5/rim/anchors';
import { M48_LEVER_PULLED, M48_VENT_ID } from '../../quests/content/act5/rim/m48.quest';
import { onLavaShape } from '../lava';
import { surfaceAt } from '../lava/LavaField';
import { ANVIL_ISLAND, LAVA_LAKE, radiusOf } from '../calderaSites';
import { dressAnvilArena } from './anvilArenaArt';
import { ANVIL_OF_AGES_AT, createCalderaSetPlugin, GANTRY_RAISED } from './calderaSet.plugin';
import { CHANNEL_SURFACE_LIFT, GANTRY_SURFACE_DROP, M48_COMPLETE, stairChannels, stairChannelVolume, stairCrossing } from './lavaStair';

const channels = stairChannels(heightAt);
const anchor = (id: string) => {
  const a = QUEST_WORLD_ANCHORS.find((x) => x.id === id);
  if (!a) throw new Error(`no anchor ${id}`);
  return a;
};
/** Points over a channel's shape, every 0.4 m. */
function inside(c: (typeof channels)[number]): [number, number][] {
  const out: [number, number][] = [];
  for (let a = -3; a <= 3; a += 0.4) for (let b = -7; b <= 7; b += 0.4) {
    const x = c.centre[0] + c.dir[0] * a + c.up[0] * b;
    const z = c.centre[1] + c.dir[1] * a + c.up[1] * b;
    if (onLavaShape(c.volume.shape, x, z)) out.push([x, z]);
  }
  return out;
}

describe('the Lava Stair channels (M48)', () => {
  it('are six, on N10\'s lips: the near and far lips are the safe lips, a 5 m Leap apart, both off the lava', () => {
    expect(channels.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of channels) {
      const far = anchor(`caldera.stair.chan.${c.n}`);
      const near = anchor(`caldera.stair.chan.${c.n}.near`);
      expect(Math.hypot(c.far.x - far.x, c.far.z - far.z), `far ${c.n}`).toBeLessThan(0.15);
      expect(Math.hypot(c.near.x - near.x, c.near.z - near.z), `near ${c.n}`).toBeLessThan(0.15);
      expect(Math.hypot(c.far.x - c.near.x, c.far.z - c.near.z)).toBeLessThanOrEqual(5.4);
      expect(c.volume.safeLips).toEqual([c.near, c.far]);
      expect(c.crossing).toEqual({ id: stairCrossing(c.n), from: c.near, to: c.far });
      for (const p of [c.near, c.far]) expect(onLavaShape(c.volume.shape, p.x, p.z), `lip ${c.n}`).toBe(false);
    }
  });

  it('keep N10\'s trigger, wheel and lever anchors, and every c1 row, off the lava', () => {
    const ids = channels.flatMap((c) => [`caldera.stair.chan.${c.n}.landed`]);
    for (let v = 1; v <= 4; v++) ids.push(`caldera.stair.vent.${v}`);
    for (let l = 1; l <= 2; l++) ids.push(`caldera.stair.lever.${l}`);
    for (const id of ids) {
      const a = anchor(id);
      for (const c of channels) expect(onLavaShape({ ...c.volume.shape, halfWidth: (c.volume.shape as { halfWidth: number }).halfWidth + 1 } as never, a.x, a.z), `${id} by channel ${c.n}`).toBe(false);
    }
    for (const r of TILES.c1!) for (const c of channels) expect(onLavaShape(c.volume.shape, r.x, r.z), `${r.id} in channel ${c.n}`).toBe(false);
  });

  it('burn across their whole width (the ground under the surface everywhere) and sit close on the ground', () => {
    for (const c of channels) {
      const pts = inside(c);
      expect(pts.length).toBeGreaterThan(100);
      for (const [x, z] of pts) {
        const s = surfaceAt({ def: c.volume, surfaceY: c.volume.surfaceY }, x, z);
        const g = heightAt(x, z);
        expect(s - g, `channel ${c.n} at ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(0.01);
        expect(s - g, `channel ${c.n} floats`).toBeLessThan(1.5);
      }
    }
  });

  it('have vents on 1, 3, 4 and 6 (N10\'s ids and wheels) whose crust covers the channel, and gantries on 2 and 5', () => {
    expect(channels.filter((c) => c.vent).map((c) => c.n)).toEqual([1, 3, 4, 6]);
    channels.filter((c) => c.vent).forEach((c, i) => {
      expect(c.vent!.id).toBe(M48_VENT_ID(i + 1));
      expect(c.vent!.wheel).toBe(`m48-${i + 1}`);
      expect(c.vent!.volumeId).toBe(stairChannelVolume(c.n));
      for (const [x, z] of inside(c)) expect(onLavaShape(c.vent!.crust, x, z)).toBe(true);
    });
    expect(channels.filter((c) => c.lever).map((c) => [c.n, c.lever])).toEqual([[2, 1], [5, 2]]);
  });

  it('drain lip to lip under a lowered gantry', () => {
    for (const c of channels.filter((x) => x.lever)) {
      const drop = GANTRY_SURFACE_DROP - CHANNEL_SURFACE_LIFT;
      for (const [x, z] of inside(c)) {
        const s = surfaceAt({ def: c.volume, surfaceY: c.volume.surfaceY + drop }, x, z);
        expect(heightAt(x, z), `channel ${c.n}`).toBeGreaterThanOrEqual(s);
      }
    }
  });
});

/** A small context: a recording lava service, flags, events. */
function rig(flags: Record<string, boolean> = {}) {
  const calls = { add: [] as string[], vents: [] as string[], crossings: [] as string[], surface: new Map<string, number>(), live: new Set<string>() };
  const handlers = new Map<string, ((e: any) => void)[]>();
  const lava = {
    add: (d: { id: string }) => (calls.add.push(d.id), calls.live.add(d.id), () => calls.live.delete(d.id)),
    addVent: (d: { id: string }) => (calls.vents.push(d.id), calls.live.add(d.id), () => calls.live.delete(d.id)),
    addCrossing: (d: { id: string }) => (calls.crossings.push(d.id), calls.live.add(d.id), () => calls.live.delete(d.id)),
    setSurface: (id: string, y: number) => (calls.surface.set(id, y), true),
  };
  const scene = new THREE.Scene();
  const ctx = {
    scene,
    assets: undefined,
    physics: undefined,
    services: { get: (k: string) => (k === 'lava' ? lava : undefined) },
    state: { getBool: (k: string) => !!flags[k] },
    events: {
      on: (k: string, f: (e: any) => void) => {
        handlers.set(k, [...(handlers.get(k) ?? []), f]);
        return () => handlers.set(k, (handlers.get(k) ?? []).filter((g) => g !== f));
      },
    },
  };
  const set = (k: string, v: boolean) => {
    flags[k] = v;
    for (const f of handlers.get('flag.changed') ?? []) f({ key: k, value: v });
  };
  return { ctx, calls, set, scene };
}

describe('the set plugin', () => {
  it('adds the six channels, four vents and six crossings while M48 is open, and takes them away when it completes', () => {
    const r = rig();
    const p = createCalderaSetPlugin();
    p.setup(r.ctx as never);
    expect(r.calls.add).toEqual([1, 2, 3, 4, 5, 6].map(stairChannelVolume));
    expect(r.calls.vents).toEqual([1, 2, 3, 4].map(M48_VENT_ID));
    expect(r.calls.crossings).toEqual([1, 2, 3, 4, 5, 6].map(stairCrossing));
    expect(r.calls.live.size).toBe(16);
    r.set(M48_COMPLETE, true);
    expect(r.calls.live.size).toBe(0);
    p.dispose!();
    expect(r.scene.getObjectByName('caldera-set')).toBeUndefined();
  });

  it('adds nothing on a save where M48 is done, and keeps the gantries down there', () => {
    const r = rig({ [M48_COMPLETE]: true });
    const p = createCalderaSetPlugin();
    p.setup(r.ctx as never);
    expect(r.calls.add).toEqual([]);
    for (const l of [1, 2]) expect(r.scene.getObjectByName(`caldera-gantry-${l}`)!.rotation.x).not.toBe(GANTRY_RAISED);
    p.dispose!();
  });

  it('lowers a gantry and drains its channel when N10\'s lever flag is set', () => {
    const r = rig();
    const p = createCalderaSetPlugin();
    p.setup(r.ctx as never);
    const g = r.scene.getObjectByName('caldera-gantry-1')!;
    expect(g.rotation.x).toBeCloseTo(GANTRY_RAISED);
    r.set(M48_LEVER_PULLED(1), true);
    expect(g.rotation.x).toBeGreaterThan(-0.2);
    const c = channels[1]!;
    expect(r.calls.surface.get(c.volume.id)).toBeCloseTo(c.volume.surfaceY + GANTRY_SURFACE_DROP - CHANNEL_SURFACE_LIFT);
    expect(r.scene.getObjectByName('caldera-gantry-2')!.rotation.x).toBeCloseTo(GANTRY_RAISED);
    p.dispose!();
  });
});

describe('the Anvil of Ages', () => {
  it('stands on the island clear of N6\'s fight pieces and N3\'s lips, on level ground', () => {
    const [x, z] = ANVIL_OF_AGES_AT;
    const half = Math.hypot(1.5, 3);
    expect(radiusOf(ANVIL_OF_AGES_AT) + half).toBeLessThan(ANVIL_ISLAND.r - 3);
    const L = ANVIL_ARENA_LAYOUT;
    expect(radiusOf(ANVIL_OF_AGES_AT) - half).toBeGreaterThan(Math.max(L.flameR, L.anvilR, L.platformR + Math.hypot(3, 4)) + 2);
    for (const lip of LAVA_LAKE.safeLips.filter((p) => radiusOf(p) < ANVIL_ISLAND.r)) expect(Math.hypot(lip[0] - x, lip[1] - z)).toBeGreaterThan(half + 4);
    const ys = [-1, 1].flatMap((a) => [-1, 1].map((b) => heightAt(x + a * 2, z + b * 2)));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.6);
  });
});

describe('the D10 arena art', () => {
  it('puts the env pieces on N6\'s primitives, hides them, and lights one crack-anvil at a time', async () => {
    const lib = new ModelLibrary(await envDiskSource());
    const parent = new THREE.Group();
    const box = (w: number, h: number, d: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
      m.position.set(Math.random() * 10, h / 2, 0);
      parent.add(m);
      return m;
    };
    const slabs = [box(6, 0.35, 8)];
    const anvils = [box(1.2, 1, 2), box(1.2, 1, 2)];
    const posts = [new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8))];
    posts[0]!.position.set(3, 0.8, 3);
    parent.add(posts[0]!);
    const flames = [new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8))];
    flames[0]!.position.set(3, 2.05, 3);
    const art = dressAnvilArena(lib, { slabs, anvils, posts, flames });
    await art.ready;
    for (const m of [...slabs, ...anvils, ...posts]) expect(m.visible).toBe(false);
    expect(parent.children.filter((c) => c.name.startsWith('caldera-art:')).length).toBe(4);
    expect(flames[0]!.position.y).toBeCloseTo(2.65);
    const glow = (i: number): number[] => {
      const out: number[] = [];
      parent.children.filter((c) => c.name.startsWith('caldera-art:'))[1 + i]!.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat?.name === 'Glow') out.push(mat.emissiveIntensity);
      });
      return out;
    };
    expect(glow(0).every((v) => v === 0)).toBe(true);
    art.setCracked(0, true);
    expect(glow(0).every((v) => v > 0)).toBe(true);
    expect(glow(1).every((v) => v === 0)).toBe(true);
    art.dispose();
    expect(parent.children.some((c) => c.name.startsWith('caldera-art:'))).toBe(false);
  });

  it('leaves the primitives showing when nothing loads (no loader)', async () => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 8));
    const art = dressAnvilArena(new ModelLibrary(undefined, () => {}), { slabs: [slab], anvils: [], posts: [], flames: [] });
    await art.ready;
    expect(slab.visible).toBe(true);
  });
});
