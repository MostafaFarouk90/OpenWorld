// The seven POI templates. Each is a pure builder: (site id, params) -> PoiPiece in site-local coordinates. Decoration is
// seeded from the site id. Forge-shrines stay hand-built (A9). New structure kinds are all `poi-` prefixed (kinds.ts).
import type { AnchorSpec, StructureSpec } from '../../../region/layoutTypes';
import { ledgeCluster } from '../../../region/corridor.layout';
import { makeRng, type Rng } from '../rng';
import type { PoiInteractable, PoiParams, PoiPart, PoiPiece, PoiTemplate } from '../types';

const clamp01 = (v: number | undefined, d: number): number => Math.min(1, Math.max(0, v ?? d));

function ring(rng: Rng, n: number, r0: number, r1: number, jitter = 0.35): Array<{ x: number; z: number; yaw: number }> {
  const out: Array<{ x: number; z: number; yaw: number }> = [];
  const phase = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + rng.range(-jitter, jitter) / 2;
    const r = rng.range(r0, r1);
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: (a * 180) / Math.PI + rng.range(-30, 30) });
  }
  return out;
}

const anchor = (id: string, x: number, z: number, yawDeg: number, tags: string[], dy?: number): AnchorSpec => ({ id, x, z, yawDeg, tags, ...(dy ? { dy } : {}) });

interface Acc {
  parts: PoiPart[];
  anchors: AnchorSpec[];
  structures: StructureSpec[];
  interactables: PoiInteractable[];
}

function acc(): Acc {
  return { parts: [], anchors: [], structures: [], interactables: [] };
}

const part = (asset: string, x: number, z: number, yawDeg: number, scale: number, dy?: number): PoiPart => ({ asset, x, z, yawDeg, scale, ...(dy ? { dy } : {}) });

/** A Leap ledge 14 m south of the centre (its top 1.8 m above the ground) with the launch point 3 m out, as on the Act 1 ledges. */
function addLedge(a: Acc, id: string, cx: number, cz: number, what: 'cache' | 'lore-stone'): void {
  const [ledge, ...walls] = ledgeCluster(`poi-a2-${id}`, cx, cz);
  a.structures.push(ledge, ...walls);
  a.anchors.push(
    anchor('ledge', cx, cz, 0, ['poi', 'leap-gated'], 1.8),
    anchor('ledge.launch', cx, cz - 2.5 - 3, 0, ['poi']),
  );
  a.interactables.push(
    what === 'cache'
      ? { id: `use:poi-a2-${id}-ledge`, kind: 'use', anchor: 'ledge', prop: 'cache' }
      : { id: `use:poi-a2-${id}-ledge`, kind: 'use', anchor: 'ledge', prop: 'lore-stone' },
  );
}

function finish(id: string, template: PoiTemplate, radius: number, a: Acc, leap = false): PoiPiece {
  return { id, template, radius, parts: a.parts, anchors: a.anchors, structures: a.structures, triggers: [], interactables: a.interactables, leap };
}

function addChest(a: Acc, id: string, anchorId: string, x: number, z: number, yawDeg: number): void {
  a.anchors.push(anchor(anchorId, x, z, yawDeg, ['poi']));
  a.parts.push(part('dun/chest', x, z, yawDeg, 1));
  a.interactables.push({ id: `chest:poi-a2-${id}`, kind: 'chest', anchor: anchorId });
}

function camp(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:camp`);
  const a = acc();
  const size = clamp01(p.size, 0.5);
  a.parts.push(part('proc:fire-ring', 0, 0, 0, 1));
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  const tents = 2 + Math.round(size * 2);
  for (const t of ring(rng, tents, 5, 7.5)) a.parts.push(part('hex/tent', t.x, t.z, t.yaw + 90, rng.range(0.9, 1.1)));
  for (let i = 0; i < 3 + Math.round(size * 3); i++) {
    const t = ring(rng, 1, 3, 9)[0];
    a.parts.push(part(rng.pick(['hex/crate_long_A', 'hex/barrel', 'hex/sack']), t.x, t.z, t.yaw, 1));
  }
  for (const t of ring(rng, 2, 3.5, 4.5)) a.parts.push(part('proc:bedroll', t.x, t.z, t.yaw, 1));
  if (p.tint === 'hunter') a.parts.push(part('hex/flag_red', 0, -9, 0, 1.2), part('hex/weaponrack', 7, 2, 90, 1));
  if (p.tint === 'ash-cultist') a.parts.push(part('proc:brazier', -3, -3, 0, 1), part('dun/banner_thin_red', 0, -8.5, 0, 1.2));
  if (p.chest) addChest(a, id, 'chest', 2.5, 4.5, 200);
  a.anchors.push(anchor('spawn.1', 4, 6, 180, ['spawn']), anchor('spawn.2', -4, 6, 180, ['spawn']));
  return finish(id, 'camp', 11, a);
}

function cave(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:cave`);
  const a = acc();
  a.parts.push(part('proc:cave-mouth', 0, 0, 0, 1));
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']), anchor('entry', 0, 3, 180, ['poi']));
  const rocks = 4 + Math.round(clamp01(p.size, 0.5) * 2);
  for (let i = 0; i < rocks; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    a.parts.push(part(rng.pick(['hex/rock_single_A', 'hex/rock_single_B', 'hex/rock_single_C']), side * rng.range(2.2, 4), -rng.range(0, 2.5) - i * 0.4, rng.range(0, 360), rng.range(1.8, 2.8)));
  }
  a.parts.push(part('proc:brazier', 1.5, 3.6, 0, 1), part('dun/torch_lit', -1.6, 3.2, 0, 1));
  a.structures.push({ id: `poi-a2-${id}-mouth`, kind: 'poi-cave-mouth', x: 0, z: -1.5, yawDeg: 0, footprint: [9, 4], mode: 'solid', height: 4 });
  if (p.chest !== false) addChest(a, id, 'chest', 0, -0.5, 0);
  if (p.ledge) addLedge(a, id, 0, -14, 'cache');
  a.anchors.push(anchor('spawn.1', 0, 8, 180, ['spawn']));
  return finish(id, 'cave', 16, a, !!p.ledge);
}

function ruin(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:ruin`);
  const a = acc();
  const decay = clamp01(p.amount, 0.5);
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  const sides = [
    { x: 0, z: -6, yaw: 0 },
    { x: 6, z: 0, yaw: 90 },
    { x: 0, z: 6, yaw: 180 },
    { x: -6, z: 0, yaw: 270 },
  ];
  sides.forEach((s, i) => {
    if (rng.next() < 0.25 + decay * 0.35) return;
    a.parts.push(part(i % 2 ? 'hex/wall_straight' : 'dun/wall_broken', s.x, s.z, s.yaw, rng.range(0.7, 1) * (1.1 - decay * 0.4)));
  });
  for (let i = 0; i < 2; i++) a.parts.push(part(rng.pick(['dun/column', 'dun/pillar']), rng.range(-4, 4), rng.range(-4, 4), rng.range(0, 360), 1));
  for (let i = 0; i < 3 + Math.round(decay * 4); i++) a.parts.push(part(rng.pick(['dun/rubble_half', 'dun/rubble_large']), rng.range(-7, 7), rng.range(-7, 7), rng.range(0, 360), rng.range(0.8, 1.3)));
  a.structures.push({ id: `poi-a2-${id}-ruin`, kind: 'poi-ruin-wall', x: 0, z: -6, yawDeg: 0, footprint: [8, 1.2], mode: 'solid', height: 3 });
  addChest(a, id, 'chest', 0, 2, 180);
  if (p.ledge) addLedge(a, id, 0, -16, 'cache');
  return finish(id, 'ruin', 14, a, !!p.ledge);
}

function loreStone(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:lore`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  a.parts.push(part('proc:ember-glow', 0, 0, 0, 1));
  for (const t of ring(rng, 3, 2, 3)) a.parts.push(part(rng.pick(['hex/rock_single_A', 'hex/rock_single_B']), t.x, t.z, t.yaw, rng.range(0.8, 1.2)));
  if (p.ledge) {
    addLedge(a, id, 0, -10, 'lore-stone');
    return finish(id, 'lore-stone', 12, a, true);
  }
  a.interactables.push({ id: `use:poi-a2-${id}`, kind: 'use', anchor: 'main', prop: 'lore-stone' });
  return finish(id, 'lore-stone', 5, a);
}

function wyrmNest(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:nest`);
  const a = acc();
  const r = 4 + clamp01(p.amount, 0.5) * 4;
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  for (const t of ring(rng, 8, r, r + 1.2)) a.parts.push(part(rng.pick(['hex/rock_single_A', 'hex/rock_single_C']), t.x, t.z, t.yaw, rng.range(1.2, 2)));
  for (let i = 0; i < 3 + rng.int(0, 2); i++) a.parts.push(part('proc:eggs', rng.range(-1.5, 1.5), rng.range(-1.5, 1.5), rng.range(0, 360), rng.range(0.9, 1.2)));
  for (let i = 0; i < 5; i++) a.parts.push(part('proc:bones', rng.range(-r, r) * 0.8, rng.range(-r, r) * 0.8, rng.range(0, 360), rng.range(0.7, 1.2)));
  a.anchors.push(anchor('spawn.1', r * 0.6, r * 0.6, 225, ['spawn']), anchor('spawn.2', -r * 0.6, r * 0.6, 135, ['spawn']));
  addChest(a, id, 'chest', 0, 0.5, 0);
  if (p.ledge) addLedge(a, id, 0, -(r + 10), 'cache');
  return finish(id, 'wyrm-nest', r + 12, a, !!p.ledge);
}

function hunterPen(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:pen`);
  const a = acc();
  a.anchors.push(anchor('main', 0, 0, 0, ['poi']));
  const cages = 1 + Math.round(clamp01(p.amount, 0.5) * 2);
  for (let i = 0; i < 12; i++) {
    const t = (i / 12) * Math.PI * 2;
    a.parts.push(part('hex/fence_wood_straight', Math.cos(t) * 7, Math.sin(t) * 7, (t * 180) / Math.PI + 90, 1));
  }
  for (let i = 0; i < cages; i++) a.parts.push(part('proc:cage', -3 + i * 3, 0, 0, 1));
  for (const t of ring(rng, 3, 3, 5)) a.parts.push(part('proc:net', t.x, t.z, t.yaw, 1));
  a.parts.push(part('hex/tent', 0, 10, 180, 1), part('hex/flag_red', -8, 9, 0, 1), part('hex/weaponrack', 8, 9, 90, 1));
  a.anchors.push(anchor('spawn.1', 4, 9, 180, ['spawn']), anchor('spawn.2', -4, 9, 180, ['spawn']), anchor('pen.gate', 0, 7, 0, ['poi']));
  addChest(a, id, 'chest', 3, 11, 180);
  return finish(id, 'hunter-pen', 15, a);
}

function vista(id: string, p: PoiParams): PoiPiece {
  const rng = makeRng(`${id}:vista`);
  const a = acc();
  const h = 1.7 + clamp01(p.amount, 0.5) * 0.2;
  a.anchors.push(anchor('main', 0, 0, 0, ['poi', 'vista']), anchor('view', 0, 0, 0, ['vista'], h));
  a.structures.push({ id: `poi-a2-${id}-lookout`, kind: 'poi-lookout', x: 0, z: 0, yawDeg: 0, footprint: [5, 4], mode: 'solid', height: h });
  a.parts.push(part('hal/bench', 0.5, -0.5, 0, 1, h), part('hex/flag_red', 2, 1, 0, 1, h), part('hex/rock_single_B', -2.5, 1.5, rng.range(0, 360), 1.3));
  for (const t of ring(rng, 3, 3, 5)) a.parts.push(part('hex/rock_single_A', t.x, t.z, t.yaw, rng.range(0.9, 1.4)));
  return finish(id, 'vista', 7, a);
}

export const TEMPLATE_BUILDERS: Record<PoiTemplate, (id: string, p: PoiParams) => PoiPiece> = {
  camp,
  cave,
  ruin,
  'lore-stone': loreStone,
  'wyrm-nest': wyrmNest,
  'hunter-pen': hunterPen,
  vista,
};

/** Every structure kind the templates use that is not a built-in (registered by registerPoiKinds). */
export const POI_STRUCTURE_KINDS = ['poi-cave-mouth', 'poi-ruin-wall', 'poi-lookout'] as const;

export function buildPiece(id: string, template: PoiTemplate, params: PoiParams = {}): PoiPiece {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`poi: bad site id "${id}"`);
  const b = TEMPLATE_BUILDERS[template];
  if (!b) throw new Error(`poi: unknown template "${String(template)}"`);
  return b(id, params);
}
