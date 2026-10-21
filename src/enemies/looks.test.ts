// Enemy looks (asset swap follow-up): every kind has its own body or tint and silhouette, wears only what its recipe shows, and
// the bodies share the bones the tracers and hurtboxes need.
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { diskSource } from '../assets/swap/testing/diskSource';
import { HELD_ITEM } from '../npcs/npcModels';
import { buildEnemyModel } from './EnemyModel';
import { LOOK } from '../bosses/grimtooth/tuning';
import { ENEMY_DEFS } from './defs';
import type { EnemyDef } from './types';

let src: Awaited<ReturnType<typeof diskSource>>;
const BODIES = ['knight', 'mage', 'barbarian', 'rogue', 'rogueHooded'];
beforeAll(async () => {
  src = await diskSource();
  for (const id of [...BODIES, 'hex/bucket_empty']) await src.load(id);
});

/** World length of the soldier's sword (hilt to tip) at modelScale 0.78, measured before the look changes. */
const SWORD_REACH = 1.0994;

/** The body a def uses (first preferred body, else the Knight): what enemies.plugin picks when everything is loaded. */
const bodyOf = (d: EnemyDef): string => d.model.prefer[0] ?? 'knight';
// (the procedural bodies, the hound's quadruped, the fox, the golem and the crawler, are not humanoids: they bring their own rig)
const HUMANOIDS = Object.values(ENEMY_DEFS).filter((d) => d.kind !== 'ember-hound' && (d.body === undefined || d.body === 'humanoid'));
const build = (d: EnemyDef, withProps = true) =>
  buildEnemyModel(
    { model: src.instantiate(bodyOf(d)), clips: src.animations(bodyOf(d)), prop: withProps ? (id) => (id === 'hex/bucket_empty' ? new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14)) : null) : undefined },
    d,
  );
const visibleHeld = (root: THREE.Object3D): string[] => {
  const out: string[] = [];
  root.traverse((o) => {
    if (!HELD_ITEM.test(o.name)) return;
    for (let n: THREE.Object3D | null = o; n && n !== root; n = n.parent) if (!n.visible) return;
    if (o.visible) out.push(o.name);
  });
  return out;
};

describe('enemy looks', () => {
  it('no two humanoid kinds share a body and tint', () => {
    const sigs = HUMANOIDS.map((d) => `${bodyOf(d)}/${d.model.tint.toString(16)}`);
    expect(new Set(sigs).size).toBe(HUMANOIDS.length);
    // And at most two of them share a body (the soldier and the guard are the Knight rig: helmet and tint tell them apart).
    const perBody = new Map<string, number>();
    // (the toll sergeant is a bigger, darker soldier on purpose: he leads them, so he is left out of the count; the yard
    // veteran is a living Halvard soldier in Halvard blue on the same rig, seen only in the training yards; the steward guard is Grisel's green soldier on the same rig)
    for (const d of HUMANOIDS.filter((x) => x.kind !== 'toll-sergeant' && x.kind !== 'yard-veteran' && x.kind !== 'steward-guard')) perBody.set(bodyOf(d), (perBody.get(bodyOf(d)) ?? 0) + 1);
    expect([...perBody.values()].every((n) => n <= 2)).toBe(true);
    // None of them wears the player's Knight look unchanged (Knight body, no helmet change, no scale): the Knight-rig kinds hide the helmet.
    for (const d of HUMANOIDS.filter((x) => bodyOf(x) === 'knight')) expect(d.model.hide, d.kind).toContain('Knight_Helmet');
  });

  it('every body has the hand-slot, hand and head bones the tracers, claws and hurtboxes use', () => {
    for (const id of BODIES) {
      const bones = new Set<string>();
      src.instantiate(id).traverse((o) => (o as THREE.Bone).isBone && bones.add(o.name));
      for (const b of ['handslotr', 'handslotl', 'handr', 'handl', 'head', 'hips', 'spine'])
        expect([...bones].some((n) => n === b || n === b.replace(/(slot)?([rl])$/, (_m, s, x) => `${s ?? ''}.${x}`)), `${id} ${b}`).toBe(true);
    }
  });

  it('every kind builds on its body with all hurtboxes, one tracer per channel, and a body of its own scale', () => {
    for (const d of HUMANOIDS) {
      const m = build(d);
      expect(m.hurtboxes.missing, d.kind).toEqual([]);
      expect(m.tracers.right, d.kind).toBeDefined();
      expect(!!m.tracers.left, d.kind).toBe(d.model.weapons === 'sword-shield');
      expect(m.owner.scale.x).toBeCloseTo(0.78 * (d.model.scale ?? 1), 6);
      m.dispose();
    }
  });

  it('shows only the held items a recipe asks for', () => {
    const held = (kind: keyof typeof ENEMY_DEFS) => {
      const m = build(ENEMY_DEFS[kind]);
      const h = visibleHeld(m.owner).sort();
      m.dispose();
      return h;
    };
    expect(held('ash-wraith')).toEqual([]);
    expect(held('blighted-soldier')).toEqual(['1H_Sword', 'Round_Shield']);
    expect(held('watch-guard')).toEqual(['2H_Sword', 'Rectangle_Shield']);
    expect(held('alley-cutpurse')).toEqual(['Knife']);
    expect(held('guildhall-thug')).toEqual(['1H_Axe']);
  });

  it('the Knight-rig kinds lose the helmet, and the guard wears a pot helm on the head bone when the pack is loaded', () => {
    const helmet = (m: ReturnType<typeof build>) => m.owner.getObjectByName('Knight_Helmet')!;
    for (const kind of ['blighted-soldier', 'watch-guard'] as const) {
      const m = build(ENEMY_DEFS[kind]);
      expect(helmet(m).visible, kind).toBe(false);
      m.dispose();
    }
    const guard = build(ENEMY_DEFS['watch-guard']);
    const pot = guard.owner.getObjectByName('enemy-prop:hex/bucket_empty')!;
    expect(pot).toBeTruthy();
    expect(pot.parent!.name).toBe('head');
    guard.dispose();
    const bare = build(ENEMY_DEFS['watch-guard'], false);
    expect(bare.owner.getObjectByName('enemy-prop:hex/bucket_empty')).toBeUndefined();
    bare.dispose();
  });

  it('the pot helm is head-sized in metres whatever the body scale', () => {
    const m = build(ENEMY_DEFS['watch-guard']);
    m.root.updateMatrixWorld(true);
    const pot = m.owner.getObjectByName('enemy-prop:hex/bucket_empty')!;
    const size = new THREE.Box3().setFromObject(pot).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(0.25);
    expect(size.y).toBeLessThan(0.45);
    const head = m.owner.getObjectByName('head')!.getWorldPosition(new THREE.Vector3());
    expect(pot.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThan(head.y);
    m.dispose();
  });

  it('keeps the attack reach of the thug, soldier and Grimtooth at their original values (look never changes hitboxes)', () => {
    const thug = ENEMY_DEFS['guildhall-thug'];
    const soldier = ENEMY_DEFS['blighted-soldier'];
    expect(thug.model.scale).toBeUndefined();
    expect(soldier.model.scale).toBeUndefined();
    const t = build(thug);
    const so = build(soldier);
    expect(t.owner.scale.x).toBeCloseTo(0.78, 6);
    expect(so.owner.scale.x).toBeCloseTo(0.78, 6);
    for (const m of [t, so]) m.root.updateMatrixWorld(true);
    const len = (m: typeof t) => m.weapons.right.hilt.getWorldPosition(new THREE.Vector3()).distanceTo(m.weapons.right.tip.getWorldPosition(new THREE.Vector3()));
    expect(len(t)).toBeCloseTo(0.6, 3);
    expect(len(so)).toBeCloseTo(SWORD_REACH, 3);
    // Grimtooth's reach-defining proportions are the original hound's (neck, head, legs); only tint and scale differ.
    expect(LOOK.build).toEqual({ bodyHeight: 0.42, legLength: 0.55, neckLength: 0.3, headSize: 0.27, tailLength: 0.6 });
  });
});
