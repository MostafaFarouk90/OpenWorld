// Harrowmark's ash state (Act 4, L2; plans/act4-L2.md section 2): from `story.gate.a4` Vey's checkpoints stand on the main
// streets (a barricade with a 3 m pass, a brazier, a black banner), "By order of the Lord-Regent" posters hang on the Keep
// road and the market, and soot lies on the streets and round the fountain. The shut stalls and the dry fountain are the
// shipped world change's (worldChange.ts, A4_FLAG). Derived through ctx.gates, so a load either way re-derives it. Emissive
// flames only: nothing registers a glow source, so the 3/2/0 light pool is untouched.
import * as THREE from 'three';
import type { CoreContext } from '../../region/coreTypes';
import type { StructureSpec } from '../../region/layoutTypes';
import { buildCity, type BuildDeps } from '../cityBuild';
import { FOUNTAIN } from '../worldChange';
import { A4_FLAG, CHECKPOINTS } from './sites';

/** The rail pieces either side of the pass (local x from the checkpoint centre) and their size. */
export const RAIL = { offset: 2.75, length: 2.5, depth: 0.6, height: 1.2 } as const;
export const POSTER_COUNT = 24;
export const SOOT_COUNT = 40;

const round = (n: number) => Math.round(n * 100) / 100;

/** Local x along a checkpoint's rail -> world (x, z): the rail runs across the street, local x = (cos h, -sin h). */
function along(c: (typeof CHECKPOINTS)[number], s: number): { x: number; z: number } {
  const h = (c.heading * Math.PI) / 180;
  return { x: round(c.x + Math.cos(h) * s), z: round(c.z - Math.sin(h) * s) };
}

/** The checkpoints' solid pieces: two rail sections each (a 3 m pass between them) and a brazier post (open). */
export function checkpointStructures(): StructureSpec[] {
  return CHECKPOINTS.flatMap((c) => {
    const yawDeg = c.heading;
    const rails = [-1, 1].map((s): StructureSpec => {
      const p = along(c, s * RAIL.offset);
      return { id: `a4cp.${c.id}.rail-${s < 0 ? 'l' : 'r'}`, kind: 'fence', x: p.x, z: p.z, yawDeg, footprint: [RAIL.length, RAIL.depth], mode: 'solid', height: RAIL.height };
    });
    const b = along(c, -RAIL.offset - RAIL.length / 2 - 1.2);
    const brazier: StructureSpec = { id: `a4cp.${c.id}.brazier`, kind: 'pole', x: b.x, z: b.z, yawDeg, footprint: [0.5, 0.5], mode: 'open', height: 1.4 };
    return [...rails, brazier];
  });
}

/** Where the posters hang: the house fronts either side of the Keep road (x 8462 and 8538) and the market's houses. */
export function posterSpots(): { x: number; z: number; facing: number }[] {
  const out: { x: number; z: number; facing: number }[] = [];
  // The Keep road houses' street faces (keep-road.w/e, 24 m wide at x 8450 and 8550): posters on each, 1.5 m up.
  for (const z of [1850, 1930, 2010, 2090, 2230, 2310]) {
    out.push({ x: 8462.06, z: z - 6, facing: 90 }, { x: 8462.06, z: z + 6, facing: 90 });
    out.push({ x: 8537.94, z: z - 6, facing: 270 }, { x: 8537.94, z: z + 6, facing: 270 });
  }
  return out.slice(0, POSTER_COUNT);
}

/** Soot blots on the streets: a deterministic scatter along the Keep road and round each checkpoint. */
export function sootSpots(): { x: number; z: number; r: number }[] {
  const out: { x: number; z: number; r: number }[] = [];
  let seed = 0xa54;
  const next = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed >>> 8) / 16777216;
  };
  for (const c of CHECKPOINTS) for (let k = 0; k < 4; k++) out.push({ x: round(c.x + (next() - 0.5) * 10), z: round(c.z + (next() - 0.5) * 10), r: round(0.8 + next() * 1.2) });
  while (out.length < SOOT_COUNT) out.push({ x: round(8470 + next() * 60), z: round(1780 + next() * 740), r: round(0.6 + next() * 1.6) });
  return out;
}

const SOOT = new THREE.MeshBasicMaterial({ color: 0x15110e, transparent: true, opacity: 0.55, depthWrite: false });
const POSTER = new THREE.MeshLambertMaterial({ color: 0xd8cfb8, side: THREE.DoubleSide });
const POSTER_SEAL = new THREE.MeshBasicMaterial({ color: 0x1a1a1f });
const BANNER = new THREE.MeshLambertMaterial({ color: 0x18181c, side: THREE.DoubleSide });
const FLAME = new THREE.MeshBasicMaterial({ color: 0xff7a24 });

export interface AshState {
  readonly active: boolean;
  counts(): { checkpoints: number; rails: number; posters: number; soot: number };
  dispose(): void;
}

export function buildAshState(
  ctx: Pick<CoreContext, 'scene' | 'gates' | 'physics' | 'anchors'>,
  rapier: BuildDeps['rapier'] | null,
  heightAt: (x: number, z: number) => number,
): AshState {
  let city: ReturnType<typeof buildCity> | null = null;
  const root = new THREE.Group();
  root.name = 'harrowmark-ash-state';
  const geometries: THREE.BufferGeometry[] = [];
  let posters = 0;
  let soot = 0;
  let active = false;
  const structures = checkpointStructures();

  const clear = () => {
    city?.dispose();
    city = null;
    root.removeFromParent();
    root.clear();
    for (const g of geometries.splice(0)) g.dispose();
    posters = 0;
    soot = 0;
    active = false;
  };
  const build = () => {
    clear();
    const track = <T extends THREE.BufferGeometry>(g: T): T => (geometries.push(g), g);
    // Barricades: colliders and greybox through the city builder (headless tests pass no rapier: visuals only).
    if (rapier) city = buildCity({ scene: ctx.scene, physics: ctx.physics, rapier }, structures, heightAt);
    // Brazier flames and black banners at each checkpoint.
    const flameGeo = track(new THREE.ConeGeometry(0.25, 0.6, 6));
    const bannerGeo = track(new THREE.PlaneGeometry(1.1, 2.4));
    for (const s of structures) {
      if (!s.id.endsWith('.brazier')) continue;
      const y = heightAt(s.x, s.z);
      const flame = new THREE.Mesh(flameGeo, FLAME);
      flame.position.set(s.x, y + 1.7, s.z);
      root.add(flame);
      const banner = new THREE.Mesh(bannerGeo, BANNER);
      banner.position.set(s.x, y + 2.6, s.z);
      banner.rotation.y = (s.yawDeg * Math.PI) / 180;
      root.add(banner);
    }
    // Posters: a sheet and a black seal, on the house fronts.
    const sheetGeo = track(new THREE.PlaneGeometry(0.7, 1));
    const sealGeo = track(new THREE.CircleGeometry(0.1, 8));
    for (const p of posterSpots()) {
      const y = heightAt(p.x, p.z) + 1.6;
      const g = new THREE.Group();
      g.position.set(p.x, y, p.z);
      g.rotation.y = (p.facing * Math.PI) / 180;
      const sheet = new THREE.Mesh(sheetGeo, POSTER);
      const seal = new THREE.Mesh(sealGeo, POSTER_SEAL);
      seal.position.set(0, -0.3, 0.01);
      g.add(sheet, seal);
      root.add(g);
      posters++;
    }
    // Soot on the ground, and a ring round the dry fountain.
    const blotGeo = track(new THREE.CircleGeometry(1, 10));
    for (const s of sootSpots()) {
      const blot = new THREE.Mesh(blotGeo, SOOT);
      blot.rotation.x = -Math.PI / 2;
      blot.scale.setScalar(s.r);
      blot.position.set(s.x, heightAt(s.x, s.z) + 0.03, s.z);
      root.add(blot);
      soot++;
    }
    const ringGeo = track(new THREE.RingGeometry(5.2, 7, 24));
    const ring = new THREE.Mesh(ringGeo, SOOT);
    ring.rotation.x = -Math.PI / 2;
    const fy = ctx.anchors.find(FOUNTAIN.anchor)?.position.y ?? heightAt(FOUNTAIN.x, FOUNTAIN.z);
    ring.position.set(FOUNTAIN.x, fy + 0.04, FOUNTAIN.z);
    root.add(ring);
    ctx.scene.add(root);
    active = true;
  };

  const off = ctx.gates.flag(A4_FLAG, (on) => (on ? build() : clear()));
  return {
    get active() {
      return active;
    },
    counts: () => ({ checkpoints: active ? CHECKPOINTS.length : 0, rails: active && city ? structures.filter((s) => s.mode === 'solid').length : 0, posters, soot }),
    dispose() {
      off();
      clear();
    },
  };
}
