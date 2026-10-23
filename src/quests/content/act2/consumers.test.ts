// Every id the Cinderreach quests name resolves to something that exists: triggers, props and notes, anchors, NPCs, spawn
// tags, enemy kinds and carry destinations. (A missing one would leave an objective that nothing can finish.)
import { describe, expect, it } from 'vitest';
import { CINDERREACH_LAYOUT } from '../../../cinderreach/cinderreach.layout';
import { CINDERREACH_NPC_DEFS } from '../../../cinderreach/npcDefs';
import { SCORCHHOLD_KEEP_DEF } from '../../../cinderreach/scorchholdKeep';
import { HARROWMARK_LAYOUT } from '../../../harrowmark/harrowmark.layout';
import { HARROWMARK_NPC_DEFS } from '../../../harrowmark/npcDefs';
import { ENEMY_DEFS } from '../../../enemies/defs';
import { SLICE_SPAWNERS } from '../../../enemies/spawnerDefs';
import { BRIGHTWATER_SPAWNERS } from '../../../enemies/brightwaterSpawners';
import { DENSITY_SPAWNERS_A } from '../../../enemies/densitySpawners';
import { HARROWMARK_SPAWNERS } from '../../../enemies/harrowmarkSpawners';
import { ACT2_SPAWNERS } from '../../../enemies/act2Spawners';
import { WYRM_SPAWNERS } from '../../../enemies/wyrm/spawners';
import { WAVE_SPAWNERS } from '../../../waves/spawners';
import { MINE_DEFS } from '../../../oldsmoke/mines';
import { OLDSMOKE_LAYOUT } from '../../../oldsmoke/oldsmoke.layout';
import { OLDSMOKE_NPC_DEFS } from '../../../oldsmoke/npcDefs';
import { OLDSMOKE_SPAWNERS, OLDSMOKE_TRIGGERS } from './index';
import { M17R08_NPC_DEFS } from './oldsmoke/mines/m17r08.npcs';
import { M18M19_NPC_DEFS } from './oldsmoke/mines/m18m19.npcs';
import { M20D04_NPC_DEFS } from './oldsmoke/mines/m20d04.npcs';
import { GRISEL_HALL_DEF } from '../../../oldsmoke/griselHall';
import { KEEP_HALL_DEF } from '../../../interiors/harrowmark/keepHall';
import { SECTIONS } from '../../../stealth/sections';
import { ACT2_QUEST_DEFS, ACT2_PROPS, ACT2_CARRY, ACT2_QUEST_NOTES, ACT2_SPAWNERS_A12, ACT2_TRIGGERS, ACT2_NOTE_LIST } from './index';
import type { ObjectiveDef } from '../../types';


const anchors = new Set<string>([
  ...CINDERREACH_LAYOUT.anchors.map((a) => a.id),
  ...HARROWMARK_LAYOUT.anchors.map((a) => a.id),
  ...SCORCHHOLD_KEEP_DEF.anchors.map((a) => a.id),
  ...OLDSMOKE_LAYOUT.anchors.map((a) => a.id),
  ...GRISEL_HALL_DEF.anchors.map((a) => a.id),
  ...KEEP_HALL_DEF.anchors.map((a) => a.id),
  ...MINE_DEFS.flatMap((d) => d.anchors.map((a) => a.id)),
]);
const triggers = new Set<string>([
  ...CINDERREACH_LAYOUT.triggers.map((t) => t.id),
  ...HARROWMARK_LAYOUT.triggers.map((t) => t.id),
  ...ACT2_TRIGGERS.map((t) => t.id),
  ...OLDSMOKE_LAYOUT.triggers.map((t) => t.id),
  'trg.harrowmark.keep-hall', // 3a's hall box, registered by the interior
  ...OLDSMOKE_TRIGGERS.map((t) => t.id),
]);
/** A9's Hushed Anvil murals (the M14 reads), registered by the shrine plugin. */
const A9_INTERACTABLES = [1, 2, 3].map((n) => `use:hushed-anvil-mural-${n}`);
const interactables = new Set<string>([
  ...ACT2_PROPS.map((p) => p.interactableId), ...ACT2_QUEST_NOTES.map((n) => n.interactableId), ...A9_INTERACTABLES,
]);
const npcs = new Set<string>([
  ...CINDERREACH_NPC_DEFS.map((n) => n.id), ...HARROWMARK_NPC_DEFS.map((n) => n.id), ...OLDSMOKE_NPC_DEFS.map((n) => n.id),
  ...[...M17R08_NPC_DEFS, ...M18M19_NPC_DEFS, ...M20D04_NPC_DEFS].map((n) => n.id), 'gaut', 'aelfreda', 'pennard',
]);
const allSpawners = [...SLICE_SPAWNERS, ...BRIGHTWATER_SPAWNERS, ...DENSITY_SPAWNERS_A, ...HARROWMARK_SPAWNERS, ...ACT2_SPAWNERS, ...WYRM_SPAWNERS, ...WAVE_SPAWNERS, ...ACT2_SPAWNERS_A12, ...OLDSMOKE_SPAWNERS];
const tags = new Set(allSpawners.flatMap((s) => (s.tag ? [s.tag] : [])));
const patrolOf = (s: { patrol?: unknown }): string[] => (Array.isArray(s.patrol) ? (s.patrol as string[]) : []);
const spawnerAnchors = allSpawners.flatMap((s) => [s.anchor, ...(s.memberAnchors ?? []), ...patrolOf(s)]);

const objectives = ACT2_QUEST_DEFS.flatMap((q) => q.objectives.map((o) => [`${q.id}.${o.id}`, o] as const));
const asArray = (t: ObjectiveDef['target']): string[] => (Array.isArray(t) ? t : t === undefined ? [] : [t]);

describe('Cinderreach quest consumers', () => {
  it('has the ten quests of the plan', () => {
    expect(ACT2_QUEST_DEFS.map((q) => q.id).slice(0, 10)).toEqual(['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03']);
  });

  it.each(objectives.filter(([, o]) => o.type === 'goTo'))('%s: its trigger exists', (_id, o) => {
    for (const t of asArray(o.target)) expect(triggers.has(t), t).toBe(true);
  });

  it.each(objectives.filter(([, o]) => o.type === 'interact'))('%s: its interactables are registered', (_id, o) => {
    for (const t of asArray(o.target)) expect(interactables.has(t), t).toBe(true);
  });

  it.each(objectives.filter(([, o]) => o.type === 'talk'))('%s: its NPC exists', (_id, o) => {
    for (const t of asArray(o.target)) expect(npcs.has(t), t).toBe(true);
  });

  it.each(objectives.filter(([, o]) => o.type === 'kill'))('%s: the enemy kind and the spawn tag exist', (_id, o) => {
    for (const t of asArray(o.target)) expect(ENEMY_DEFS[t as keyof typeof ENEMY_DEFS], t).toBeDefined();
    if (o.spawnTag) expect(tags.has(o.spawnTag), o.spawnTag).toBe(true);
  });

  it('every prop and note stands on an anchor that exists', () => {
    for (const p of ACT2_PROPS) expect(anchors.has(p.anchorId), `${p.interactableId} -> ${p.anchorId}`).toBe(true);
    for (const n of ACT2_NOTE_LIST) expect(anchors.has(n.anchorId), `${n.id} -> ${n.anchorId}`).toBe(true);
  });

  it('every carry starts on an anchor and ends in a trigger that exist', () => {
    for (const c of ACT2_CARRY) {
      expect(anchors.has(c.homeAnchor), c.id).toBe(true);
      expect(triggers.has(c.destination), c.destination).toBe(true);
    }
  });

  it('every spawner anchor of A12 exists', () => {
    for (const s of ACT2_SPAWNERS_A12) {
      for (const a of [s.anchor, ...(s.memberAnchors ?? []), ...patrolOf(s)]) expect(anchors.has(a), `${s.id} -> ${a}`).toBe(true);
    }
    expect(spawnerAnchors.length).toBeGreaterThan(0);
  });

  it('every A12 trigger stands on an anchor that exists', () => {
    for (const t of ACT2_TRIGGERS) expect(anchors.has(t.anchorId), t.id).toBe(true);
  });

  it('the M15 stealth section is registered with anchors, a guard group and four hide spots that exist', () => {
    const s = SECTIONS.find((x) => x.id === 'm15.camp')!;
    expect(s).toBeDefined();
    const a = (v: { anchor: string }) => v.anchor;
    for (const id of [a('bounds' in s && !('interior' in s.bounds) ? s.bounds : { anchor: '' }), ...s.checkpoints.map((c) => c.anchor), s.exit.anchor, ...s.hideSpots.map((h) => h.anchor)]) {
      expect(anchors.has(id), id).toBe(true);
    }
    expect(s.hideSpots).toHaveLength(4);
    const guards = allSpawners.find((g) => g.id === s.guardGroups[0])!;
    expect(guards.enemy).toBe('watch-guard');
    for (const x of [guards.anchor, ...(guards.memberAnchors ?? []), ...patrolOf(guards)]) expect(anchors.has(x), x).toBe(true);
  });

  it('every NPC the quests name has a post (A3 layout or Harrowmark) so it stands somewhere', () => {
    const specs = new Set(CINDERREACH_LAYOUT.npcs.map((n) => n.id));
    for (const id of ['osgar', 'ketta', 'maud', 'beornwyn', 'hrolf', 'lantern-keeper', 'household-1', 'carter-bound', 'pell', 'osric', 'ealdred', 'wynne', 'corwin', 'brand', 'redmane']) {
      expect(specs.has(id), id).toBe(true);
    }
  });

  it('the surface anchors the Oldsmoke quests use resolve from the real layouts, not from the mine interiors', () => {
    const real = new Set<string>([...OLDSMOKE_LAYOUT.anchors, ...GRISEL_HALL_DEF.anchors].map((a) => a.id));
    const mine = new Set(MINE_DEFS.flatMap((d) => d.anchors.map((a) => a.id)));
    const surface = OLDSMOKE_TRIGGERS.map((t) => t.anchorId).filter((a) => !mine.has(a));
    expect(surface.length).toBeGreaterThan(0);
    for (const a of surface) expect(anchors.has(a), a).toBe(true);
    for (const a of ['oldsmoke.shaft.door', 'oldsmoke.shaft.lift.top']) expect(real.has(a), a).toBe(true);
  });

  it('every mine anchor the Oldsmoke quests use resolves against A4\'s mine layout', () => {
    const mine = new Set(MINE_DEFS.flatMap((d) => d.anchors.map((a) => a.id)));
    const used = [...OLDSMOKE_TRIGGERS.map((t) => t.anchorId), ...OLDSMOKE_SPAWNERS.flatMap((x) => [x.anchor, ...(x.memberAnchors ?? []), ...patrolOf(x)])];
    expect(used.filter((a) => mine.has(a)).length).toBeGreaterThan(10);
    for (const a of used.filter((x) => x.startsWith('oldsmoke.') || x.startsWith('npc-post.'))) expect(anchors.has(a), a).toBe(true);
  });
});
