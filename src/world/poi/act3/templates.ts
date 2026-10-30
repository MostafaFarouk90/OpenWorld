// The eleven Act 3 builders (thread K2): ten points of interest and the standalone Leap cache. Each is pure: (site id, params)
// -> A3Piece in site-local coordinates, decoration seeded from the site id. Generated environment objects (`env/<id>`, natural
// metres, src/env/targets.json) are preferred; `proc:` pieces stand in only where no generated object exists yet (prompt list,
// "Act 3 points of interest"). Colliders are structures: A2's `poi-` kinds and `rock` (ledges, the reed islet).
import type { AnchorSpec, StructureSpec } from '../../../region/layoutTypes';
import { ledgeCluster } from '../../../region/corridor.layout';
import { makeRng, type Rng } from '../rng';
import type { PoiPart } from '../types';
import type { A3Interactable, A3Params, A3Piece, A3Template } from './types';

/** A collider whose visual is the generated model in the parts: the art layer draws nothing for it. */
export const A3_COLLIDER_KIND = 'poi-a3-collider';

/** Rubbing ids are `spine-1` .. `spine-6`. */
export const A3_RUBBING_ID = /^spine-[1-6]$/;

const anchor = (id: string, x: number, z: number, yawDeg: number, tags: string[], dy?: number): AnchorSpec => ({ id, x, z, yawDeg, tags, ...(dy ? { dy } : {}) });
const part = (asset: string, x: number, z: number, yawDeg: number, scale: number, dy?: number): PoiPart => ({ asset, x, z, yawDeg, scale, ...(dy ? { dy } : {}) });

interface Acc {
  parts: PoiPart[];
  anchors: AnchorSpec[];
  structures: StructureSpec[];
  interactables: A3Interactable[];
}

const acc = (): Acc => ({ parts: [], anchors: [], structures: [], interactables: [] });

function ring(rng: Rng, n: number, r0: number, r1: number): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  const phase = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const r = rng.range(r0, r1);
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: (a * 180) / Math.PI + rng.range(-30, 30) });
  }
  return out;
}

/** The Leap ledge (A2's): a 1.8 m rock platform with rock behind and either side; the launch point is 3 m out to local -Z. */
export const LEDGE_HEIGHT = 1.8;
function addLedge(a: Acc, id: string, cx: number, cz: number): void {
  a.structures.push(...ledgeCluster(`poi-a3-${id}`, cx, cz));
  a.anchors.push(anchor('ledge', cx, cz, 0, ['poi', 'leap-gated'], LEDGE_HEIGHT), anchor('ledge.launch', cx, cz - 2.5 - 3, 0, ['poi']));
  a.interactables.push({ id: `use:poi-a3-${id}-ledge`, kind: 'use', anchor: 'ledge', prop: 'cache' });
}

function addChest(a: Acc, id: string, x: number, z: number, yawDeg: number): void {
  a.anchors.push(anchor('chest', x, z, yawDeg, ['poi']));
  a.parts.push(part('dun/chest', x, z, yawDeg, 1));
  a.interactables.push({ id: `chest:poi-a3-${id}`, kind: 'chest', anchor: 'chest' });
}

/** The rubbing stone: a generated carving stone with the hold interaction in front of it. */
function addRubbing(a: Acc, rubbing: string | undefined, x: number, z: number, yawDeg: number): void {
  if (!rubbing) return;
  if (!A3_RUBBING_ID.test(rubbing)) throw new Error(`poi a3: bad rubbing id "${rubbing}"`);
  a.anchors.push(anchor('rubbing', x, z, yawDeg, ['poi', 'rubbing']));
  a.parts.push(part('env/dragonspine-carving-stone', x, z + 0.6, yawDeg, 1));
  a.interactables.push({ id: `use:poi-a3-rubbing-${rubbing}`, kind: 'rubbing', anchor: 'rubbing' });
}

/** Where an ambient group stands (K6b reads it through greyfenSite or its own table); kept 8 m or more from the props. */
function addFauna(a: Acc, x: number, z: number): void {
  a.anchors.push(anchor('fauna', x, z, 0, ['spawn']));
}

function finish(id: string, template: A3Template, radius: number, a: Acc, leap: boolean): A3Piece {
  return { id, template, radius, parts: a.parts, anchors: a.anchors, structures: a.structures, interactables: a.interactables, leap };
}

function drownedChurch(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:church`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  // The nave is the old monastery's broken shell, tipped and half sunk; the bell tower leans at its west end.
  a.parts.push(part('env/greyfen-monastery-ruin', 0, 2, 4, 0.8, -1.2), part('env/greyfen-bell-tower', -9, -5, 8, 1, -0.6));
  for (let i = 0; i < 6; i++) a.parts.push(part(rng.pick(['dun/rubble_half', 'dun/rubble_large']), rng.range(-10, 10), rng.range(-8, 9), rng.range(0, 360), rng.range(0.8, 1.3)));
  for (const t of ring(rng, 8, 11, 15)) a.parts.push(part(rng.pick(['env/reeds-a', 'env/reeds-b']), t.x, t.z, t.yaw, rng.range(0.9, 1.3)));
  a.parts.push(part('dun/candle_triple', 6.5, 7, 0, 1), part('env/greyfen-marker', 3, -9, 0, 1));
  a.structures.push({ id: `poi-a3-${id}-nave`, kind: A3_COLLIDER_KIND, x: 0, z: 8, yawDeg: 0, footprint: [14, 1.2], mode: 'solid', height: 3 });
  addChest(a, id, 5, 5, 180);
  addFauna(a, -4, 14);
  if (p.ledge) addLedge(a, id, -9, -15);
  return finish(id, 'drowned-church', 19, a, !!p.ledge);
}

function stiltCamp(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:stilt`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  a.parts.push(part('env/greyfen-stilt-hut', -6, 4, 90, 1), part('env/greyfen-stilt-house', 7, 5, 200, 1), part('env/campfire-ring', 0, -2, 0, 1));
  a.parts.push(part('env/prop.greyfen.ferry-punt', -2, -9, 75, 1), part('env/woodpile-chop', 3, -6, 30, 1), part('env/crates-stacked-a', -1.5, 2.5, 10, 1));
  for (const t of ring(rng, 2, 3, 3.6)) a.parts.push(part('proc:bedroll', t.x, t.z - 2, t.yaw, 1));
  for (const t of ring(rng, 6, 11, 14)) a.parts.push(part(rng.pick(['env/reeds-a', 'env/reeds-b']), t.x, t.z, t.yaw, rng.range(0.9, 1.3)));
  a.structures.push({ id: `poi-a3-${id}-hut`, kind: A3_COLLIDER_KIND, x: -6, z: 4, yawDeg: 90, footprint: [9, 7], mode: 'solid', height: 5 });
  a.structures.push({ id: `poi-a3-${id}-house`, kind: A3_COLLIDER_KIND, x: 7, z: 5, yawDeg: 200, footprint: [6, 6], mode: 'solid', height: 5 });
  addChest(a, id, 1.5, 4, 180);
  addFauna(a, 0, -10);
  if (p.ledge) addLedge(a, id, 12, -10);
  return finish(id, 'stilt-camp', 18, a, !!p.ledge);
}

function peatCutting(id: string, _p: A3Params): A3Piece {
  const rng = makeRng(`${id}:peat`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  for (let i = 0; i < 5; i++) a.parts.push(part('proc:peat-stack', -7 + i * 3.2, -3 + rng.range(-0.6, 0.6), rng.range(-12, 12), rng.range(0.9, 1.2)));
  a.parts.push(part('env/handcart-a', 6, 3, 110, 1), part('env/woodpile-chop', -6, 4, 0, 1), part('env/tent', -2, 6, 180, 1));
  a.parts.push(part('env/spear-hunter', 4, -5, 70, 0.8), part('env/stump-a', 2, 2, 0, 1), part('env/greyfen-marker', -9, -6, 0, 1));
  a.structures.push({ id: `poi-a3-${id}-bank`, kind: A3_COLLIDER_KIND, x: 0, z: -6.5, yawDeg: 0, footprint: [16, 1.2], mode: 'solid', height: 1.2 });
  addChest(a, id, 0, 5, 180);
  // K6b's Peat Shambler stands in the cut bog south of the bank.
  addFauna(a, 0, -16);
  return finish(id, 'peat-cutting', 16, a, false);
}

/** The islet's two tiers: each step under a plain jump (1.05 m), the top above the fen's 6 m water table. */
export const ISLET_TIERS = [
  { footprint: [12, 10] as [number, number], height: 0.55 },
  { footprint: [7, 6] as [number, number], height: 1.0 },
] as const;

function reedIsland(id: string, _p: A3Params): A3Piece {
  const rng = makeRng(`${id}:islet`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  ISLET_TIERS.forEach((t, i) => a.structures.push({ id: `poi-a3-${id}-tier-${i + 1}`, kind: 'rock', x: 0, z: 0, yawDeg: 0, footprint: t.footprint, mode: 'solid', height: t.height }));
  const top = ISLET_TIERS[1].height;
  a.parts.push(part('env/willow-a', -1.5, 1.5, rng.range(0, 360), 0.8, top), part('env/prop.greyfen.ferry-punt', 7.5, -2, 120, 1, -0.3));
  for (const t of ring(rng, 10, 4.5, 6.5)) a.parts.push(part(rng.pick(['env/reeds-a', 'env/reeds-b']), t.x, t.z, t.yaw, rng.range(1, 1.4), ISLET_TIERS[0].height));
  a.anchors.push(anchor('chest', 1.5, -1, 180, ['poi'], top));
  a.parts.push(part('dun/chest', 1.5, -1, 180, 1, top));
  a.interactables.push({ id: `chest:poi-a3-${id}`, kind: 'chest', anchor: 'chest' });
  addFauna(a, 0, -14);
  return finish(id, 'reed-island', 10, a, false);
}

function songStone(id: string, _p: A3Params): A3Piece {
  const rng = makeRng(`${id}:song`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  // Three shore stones; the middle one carries the readable dragon-song (the outer two are plain).
  a.parts.push(part('env/poi-lore-stone', 0, 0, 0, 1.15), part('env/boulder-large-a', -3.2, 0.8, rng.range(0, 360), 0.6), part('env/boulder-large-a', 3.1, 1, rng.range(0, 360), 0.55));
  a.parts.push(part('proc:ember-glow', 0, 0, 0, 0.6));
  for (const t of ring(rng, 5, 4, 6)) a.parts.push(part(rng.pick(['env/reeds-a', 'env/reeds-b']), t.x, t.z, t.yaw, 1));
  a.anchors.push(anchor('read', 0, -1.2, 0, ['poi']));
  a.interactables.push({ id: `use:poi-a3-${id}`, kind: 'use', anchor: 'read' });
  return finish(id, 'song-stone', 7, a, false);
}

function hawkNest(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:hawk`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  for (const t of ring(rng, 5, 4, 7)) a.parts.push(part(rng.pick(['env/boulder-large-a', 'env/rock-cluster-a']), t.x, t.z, t.yaw, rng.range(0.7, 1.1)));
  for (let i = 0; i < 4; i++) a.parts.push(part('proc:bones', rng.range(-3, 3), rng.range(-3, 3), rng.range(0, 360), rng.range(0.7, 1.1)));
  a.parts.push(part('proc:egg-shells', 1.2, -1.5, 0, 1));
  addRubbing(a, p.rubbing, -3, -5, 0);
  addFauna(a, 6, -6);
  if (p.ledge) {
    addLedge(a, id, 0, 9);
    a.parts.push(part('env/dragonspine-hawk-nest', 0, 9.6, 0, 1, LEDGE_HEIGHT));
  } else {
    a.parts.push(part('env/dragonspine-hawk-nest', 0, 0, 0, 1));
  }
  return finish(id, 'hawk-nest', 14, a, !!p.ledge);
}

function hunterCairn(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:cairn`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  a.parts.push(part('env/cinder-cairn', 0, 0, 0, 1.2), part('env/dragonspine-trophy-wall', 0, 4, 180, 1), part('env/dragonspine-prayer-cairn', -3, -2, 30, 1));
  a.parts.push(part('env/dragonspine-prayer-cairn', 3.2, -1.5, 300, 1), part('env/spear-hunter', 1.5, 3, 40, 1), part('env/spear-hunter', -1.6, 3.2, 130, 1));
  for (const t of ring(rng, 4, 5, 7)) a.parts.push(part('env/cairn-a', t.x, t.z, t.yaw, rng.range(0.8, 1.2)));
  a.structures.push({ id: `poi-a3-${id}-cairn`, kind: A3_COLLIDER_KIND, x: 0, z: 0, yawDeg: 0, footprint: [2.4, 2.4], mode: 'solid', height: 1.8 });
  addRubbing(a, p.rubbing, 0, -3.5, 0);
  addChest(a, id, -2.5, 5.5, 180);
  addFauna(a, 0, 12);
  return finish(id, 'hunter-cairn', 10, a, false);
}

function frozenCamp(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:frozen`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  a.parts.push(part('env/dragonspine-lean-to', -3, 3, 180, 1), part('env/tent', 3.5, 3.5, 200, 1), part('env/campfire-ring', 0, -0.5, 0, 1));
  a.parts.push(part('env/charred-stump', -1, -3, 0, 1), part('env/woodpile-chop', 5, -1, 80, 1), part('env/crates-stacked-a', -5, -1, 20, 1));
  for (const t of ring(rng, 2, 2.4, 3)) a.parts.push(part('proc:bedroll', t.x, t.z, t.yaw, 1));
  addRubbing(a, p.rubbing, 2.5, -3.5, 0);
  addChest(a, id, -3, 1.5, 180);
  addFauna(a, 0, -11);
  if (p.ledge) addLedge(a, id, 0, 10);
  return finish(id, 'frozen-camp', 14, a, !!p.ledge);
}

function glassVein(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:glass`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  a.parts.push(part('proc:glass-vein', 0, 2, 0, 1.4), part('proc:glass-vein', -4.5, 3, 25, 0.9), part('proc:ember-glow', 1, 1.5, 0, 0.8));
  for (const t of ring(rng, 4, 5, 7)) a.parts.push(part('env/rock-cluster-a', t.x, t.z, t.yaw, rng.range(0.8, 1.2)));
  a.structures.push({ id: `poi-a3-${id}-seam`, kind: A3_COLLIDER_KIND, x: 0, z: 2, yawDeg: 0, footprint: [4.6, 2.2], mode: 'solid', height: 2 });
  addRubbing(a, p.rubbing, -3, -2, 0);
  if (p.ledge) addLedge(a, id, 5, 10);
  return finish(id, 'glass-vein', 14, a, !!p.ledge);
}

function vista(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:vista`);
  const a = acc();
  const h = 1.8;
  a.anchors.push(anchor('main', 0, 0, 0, ['poi', 'vista']), anchor('view', 0, 0, 0, ['vista'], h));
  a.structures.push({ id: `poi-a3-${id}-lookout`, kind: 'poi-lookout', x: 0, z: 0, yawDeg: 0, footprint: [5, 4], mode: 'solid', height: h });
  a.parts.push(part('env/cairn-a', 1.8, 1.2, 0, 1, h), part('hal/bench', -0.5, -0.5, 0, 1, h), part('env/signpost-a', -3.5, 2, 20, 1));
  for (const t of ring(rng, 3, 3.5, 5)) a.parts.push(part('env/rock-cluster-a', t.x, t.z, t.yaw, rng.range(0.8, 1.2)));
  addRubbing(a, p.rubbing, 3.5, -3.5, 0);
  return finish(id, 'vista', 7, a, false);
}

function leapCache(id: string, p: A3Params): A3Piece {
  const rng = makeRng(`${id}:cache`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  addLedge(a, id, 0, 0);
  a.parts.push(part('env/boulder-large-a', -6.5, 1, rng.range(0, 360), 0.7), part('env/milestone-a', 2.5, -6, 15, 1), part('env/stump-a', -3, -6, 0, 1));
  // The sixth rubbing sits on the ledge itself, beside the cache.
  if (p.rubbing) {
    if (!A3_RUBBING_ID.test(p.rubbing)) throw new Error(`poi a3: bad rubbing id "${p.rubbing}"`);
    a.anchors.push(anchor('rubbing', 1.6, 0.5, 0, ['poi', 'rubbing', 'leap-gated'], LEDGE_HEIGHT));
    a.parts.push(part('env/dragonspine-carving-stone', 1.6, 1.3, 0, 0.8, LEDGE_HEIGHT));
    a.interactables.push({ id: `use:poi-a3-rubbing-${p.rubbing}`, kind: 'rubbing', anchor: 'rubbing' });
  }
  return finish(id, 'leap-cache', 9, a, true);
}

export const A3_BUILDERS: Record<A3Template, (id: string, p: A3Params) => A3Piece> = {
  'drowned-church': drownedChurch,
  'stilt-camp': stiltCamp,
  'peat-cutting': peatCutting,
  'reed-island': reedIsland,
  'song-stone': songStone,
  'hawk-nest': hawkNest,
  'hunter-cairn': hunterCairn,
  'frozen-camp': frozenCamp,
  'glass-vein': glassVein,
  vista,
  'leap-cache': leapCache,
};

export function buildA3Piece(id: string, template: A3Template, params: A3Params = {}): A3Piece {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`poi a3: bad site id "${id}"`);
  const b = A3_BUILDERS[template];
  if (!b) throw new Error(`poi a3: unknown template "${String(template)}"`);
  return b(id, params);
}
