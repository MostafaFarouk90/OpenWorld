// PR 2's rules (plans/act4-L10.md section 3, M38 to M41): the director starts M39 and M41 (Gaut's stand and the camp follow
// without a brief), writes the witness band the case reads, plays the three sequencer scenes when their steps come up, spawns
// the manual groups, runs M39's waves and grants Gaut's Oathblade, walks M40's escort in two legs either side of the sluice
// and keeps the stairs and deep-run respawn checkpoints. Everything is re-derived from quest state and flags on a poll, so a
// load never strands a step.
import type { SceneDef } from '../../../../../scenes/types';
import type { EscortMemberDef } from '../../../../../escort/types';
import type { Act4EscortDef } from '../../../../../escort/EscortEngine';
import type { ClassId } from '../../../../../actors/classes';
import { CREATURE_MERCY_CAP } from '../../../../../state/favour';
import { grantOathblade, type OathbladePorts } from '../../../../../items/act4/oathblade';
import { CHAMBER_ID, DEEP_RUN_ID } from '../../../../../harrowmark/act4/sites';
import { DEEP_RUN_DEF } from '../../../../../interiors/deeprun/generate';
import { STAIRS_CHECKPOINT_ANCHOR } from '../../../../../interiors/harrowmark/act4/keepStairs';
import { M38_WITNESS_BAND } from '../../../../../dialogue/content/act4/harrowmark/council.dialogue';
import type { Kit, Off } from './shared';
import { distanceTo, offerScene, recheck, toast } from './shared';
import { HARROWMARK_A4_SCENES } from '../scenes';
import { M38_BETRAYAL, M38_CASE_NPC, M38_CHAMBER_DOWN, M38_CHAMBER_GROUP, M38_CASE_SCENE, M38_ENTERED, M38_TURNED, M38_WITNESS_BOSSES, M38_WITNESS_SOURCES } from '../m38.quest';
import { M39_BREATH_NPC, M39_BREATH_SCENE, M39_FALL, M39_FALLEN, M39_GUARD, M39_HELD, M39_RESPAWN_ID, M39_STAIRHEAD, M39_STAIRHEAD_DOWN, M39_WAVES } from '../m39.quest';
import { M40_ENTERED, M40_ESCORT, M40_JUNCTION_SCENE, M40_OUT, M40_RESPAWN_ID, M40_SLUICE_FLAG } from '../m40.quest';
import { M41_CAMP_SCENE, M41_GATHERED } from '../m41.quest';
import { ESCORT_PACE } from './escorts';

// ---- flags only the director writes -----------------------------------------------------------------------------------
/** Each manual group is spawned once per step (cleared on a load whose group did not come back, so it spawns again). */
export const M38_CHAMBER_SPAWNED = 'story.m38.chamberSpawned';
export const M39_STAIRHEAD_SPAWNED = 'story.m39.stairheadSpawned';
export const M39_GUARD_SPAWNED = 'story.m39.guardSpawned';
/** The fourth wave fell: the champion's guard comes down the last flight. */
export const M39_WAVES_DONE = 'story.m39.wavesDone';
export const M39_BREATH_DONE = 'story.m39.breath';
export const M39_MERCY = 'story.m39.mercy';
export const M39_OATHBLADE = 'story.m39.oathblade';
/** The furthest deep-run checkpoint passed (0 to 3). */
export const M40_CHECKPOINT = 'story.m40.checkpoint';
export const M40_LEG1_AT = 'story.m40.leg1.in';

/** Metres within which the player has passed a deep-run checkpoint, or has come to the camp for the gathering. */
const CHECKPOINT_RADIUS = 6;
const CAMP_RADIUS = 20;

// ---- the witness band (plan 3, M38: W = the three witness counts + Redmane spared + Skarl spared) ------------------------
export function witnessTotal(k: Pick<Kit, 'num' | 'str'>): number {
  const counts = M38_WITNESS_SOURCES.reduce((n, f) => n + Math.max(0, k.num(f) || 0), 0);
  return counts + M38_WITNESS_BOSSES.filter((f) => k.str(f) === 'spared').length;
}
export const witnessBand = (w: number): 'none' | 'few' | 'many' => (w <= 0 ? 'none' : w < 4 ? 'few' : 'many');

// ---- the deep run in two legs (the sluice gate is shut across the corridor until its wheel is turned) ---------------------
const P = 'harrowmark.a4.deeprun';
const local = new Map(DEEP_RUN_DEF.anchors.map((a) => [a.id, a]));
/** L2's route nodes in order. */
export const M40_ROUTE: readonly string[] = DEEP_RUN_DEF.anchors
  .filter((a) => /^harrowmark\.a4\.deeprun\.route\.\d+$/.test(a.id)).map((a) => a.id)
  .sort((a, b) => Number(a.split('.').pop()) - Number(b.split('.').pop()));
const nearestNode = (anchorId: string): number => {
  const a = local.get(anchorId);
  if (!a) return 0;
  let best = 0;
  let d = Infinity;
  M40_ROUTE.forEach((id, i) => {
    const r = local.get(id)!;
    const h = Math.hypot(r.x - a.x, r.z - a.z);
    if (h < d) { d = h; best = i; }
  });
  return best;
};
/** The node the first leg stops on: the last one short of the wheel (the column waits there for the gate). */
export const M40_SPLIT = Math.max(1, nearestNode(`${P}.sluice-wheel`) - 1);
const JUNCTIONS = ([1, 2, 3] as const).map((n) => ({ id: `${P}.junction.${n}`, scene: M40_JUNCTION_SCENE(n), at: nearestNode(`${P}.junction.${n}`) }));

const member = (id: string): EscortMemberDef => ({ id, kind: 'npc' });
export const m40LegId = (leg: 1 | 2): string => (leg === 2 ? M40_ESCORT : `${M40_ESCORT}.leg1`);
/** Leg 1: the stair foot to the wheel; leg 2: on to the ladder. Rook leads (the junction talks are spoken with the lead). */
export function m40Escort(leg: 1 | 2, parked = false): Act4EscortDef {
  const from = leg === 1 ? (parked ? M40_SPLIT - 1 : 0) : M40_SPLIT;
  const to = leg === 1 ? M40_SPLIT : M40_ROUTE.length - 1;
  const js = JUNCTIONS.filter((j) => j.at > from && j.at < to && !parked);
  return {
    id: m40LegId(leg), members: [member('rook'), member('edric')], route: M40_ROUTE.slice(from, to + 1), pace: ESCORT_PACE, kneelOnHit: true,
    stopAt: js.map((j) => j.id), junctionDialogue: Object.fromEntries(js.map((j) => [j.id, j.scene])),
    threatGroups: ['deeprun.hounds-1', 'deeprun.hounds-2', 'deeprun.patrol'], nameKey: 'escort.a4.m40',
  };
}

// ---- the installers -----------------------------------------------------------------------------------------------------
export function installScenes(k: Kit): Off[] {
  const s = k.ctx.services.get('scenes');
  if (!s) { k.warn('[harrowmark-a4-quests] no scenes service: the set pieces will not play'); return []; }
  return HARROWMARK_A4_SCENES.map((d: SceneDef) => s.register(d));
}

/** Plays `scene` when `quest`'s `objective` is current and its end flag is unset (L0 replays a saved scene itself). */
function playWhen(k: Kit, o: { quest: string; objective: string; scene: string; done: string; ready?: () => boolean }): void {
  let asked = false;
  k.every(30, () => {
    if (!k.active(o.quest) || !k.objCurrent(o.quest, o.objective) || k.flag(o.done)) return;
    const s = k.ctx.services.get('scenes');
    if (!s || s.active !== null || k.ctx.services.get('dialogue')?.active) return;
    if (asked || (o.ready && !o.ready())) return;
    asked = true;
    void s.play(o.scene).then(() => { asked = false; k.later(() => recheck(k)); });
  });
  k.on('save.loaded', () => { asked = false; });
}

/** A manual group, spawned once when its step is current (and again after a load that did not bring it back). */
function spawnWhen(k: Kit, o: { quest: string; objective: string; group: string; spawned: string; down: string; ready?: () => boolean }): () => void {
  const enemies = () => k.ctx.services.get('enemies');
  const spawn = (): void => {
    if (!k.active(o.quest) || k.flag(o.down) || k.flag(o.spawned) || !enemies()) return;
    k.set(o.spawned);
    // a manual group that was spawned before (a load that did not bring it back) refills every slot
    enemies()!.reset?.(o.group);
    enemies()!.spawnGroup(o.group);
  };
  k.every(30, () => {
    if (!k.active(o.quest) || !k.objCurrent(o.quest, o.objective) || (o.ready && !o.ready())) return;
    spawn();
  });
  k.on('save.loaded', () => k.later(() => {
    if (k.flag(o.spawned) && !k.flag(o.down) && k.active(o.quest) && k.standing(o.group).length === 0) k.clear(o.spawned);
  }));
  return spawn;
}

export function installM38(k: Kit): void {
  const band = (): void => {
    if (!k.active('m38') || k.str(M38_WITNESS_BAND)) return;
    k.set(M38_WITNESS_BAND, witnessBand(witnessTotal(k)));
  };
  k.on('interior.entered', (e) => {
    if (e.interiorId !== CHAMBER_ID || !k.active('m38')) return;
    band();
    if (!k.flag(M38_ENTERED)) k.set(M38_ENTERED);
  });
  k.on('quest.started', (e) => { if (e.questId === 'm38') band(); });
  k.on('save.loaded', () => k.later(band));
  // the case from the podium once the evidence is out, then the betrayal (its `spawn` step brings in the six)
  offerScene(k, { quest: 'm38', objective: 'case', scene: M38_CASE_SCENE, npc: M38_CASE_NPC, ready: () => { band(); return true; } });
  playWhen(k, { quest: 'm38', objective: 'turn', scene: M38_BETRAYAL, done: M38_TURNED });
  // the six come through the side doors on Vey's signal (the scene's checkpoint), or once the turn is written (skipped, or
  // a load past it), and again after a load that did not bring them back
  const six = spawnWhen(k, { quest: 'm38', objective: 'fight', group: M38_CHAMBER_GROUP, spawned: M38_CHAMBER_SPAWNED, down: M38_CHAMBER_DOWN });
  k.on('scene.checkpoint', (e) => { if (e.id === M38_BETRAYAL && e.checkpoint === 'signal') k.later(six); });
  // the stair door opens with the quest (L2's lock reads `story.m38.complete`)
  k.on('quest.completed', (e) => { if (e.questId === 'm38') toast(k, 'harrowmark.a4.q.m38.stairsOpen'); });
}

/** OathbladePorts on the inventory and the class service (L7's plugin builds the same for its reconcile). */
function oathbladePorts(k: Kit): OathbladePorts | null {
  const inventory = k.ctx.services.get('inventory');
  if (!inventory) return null;
  const classes = (k.ctx.services as unknown as { get(n: string): unknown }).get('classes') as { chosen?(): boolean; current?(): ClassId } | undefined;
  return {
    classId: () => (classes?.chosen?.() ? (classes.current?.() ?? null) : null),
    has: (id) => inventory.has(id),
    add: (id, n) => inventory.add(id, n),
    remove: (id, n) => inventory.remove(id, n),
    setTemper: (id, level, affix) => inventory.setTemper(id, level, affix),
    equipped: (slot) => inventory.equipped(slot),
    equip: (id) => inventory.equip(id),
    gemRoomFor: inventory.gemRoomFor ? (id) => inventory.gemRoomFor!(id) : undefined,
  };
}

export function installM39(k: Kit): void {
  const quests = () => k.ctx.services.get('quests');
  const waystones = () => k.ctx.services.get('waystones');
  // Gaut's stand follows the Council at once: no brief, he is on the top landing when the stair door opens
  const start = (): void => {
    if (k.qstate('m38') === 'completed' && k.qstate('m39') === 'inactive') quests()?.start('m39');
  };
  k.on('quest.completed', (e) => { if (e.questId === 'm38') k.later(start); });
  k.on('save.loaded', () => k.later(start));
  k.later(start);

  // the respawn checkpoint on the stairs while M39 runs (L2 hand-off; L0's waystones persist it)
  k.on('quest.started', (e) => { if (e.questId === 'm39') waystones()?.setCheckpoint(M39_RESPAWN_ID, STAIRS_CHECKPOINT_ANCHOR); });
  k.on('quest.completed', (e) => { if (e.questId === 'm39') waystones()?.clearCheckpoint(M39_RESPAWN_ID); });

  spawnWhen(k, { quest: 'm39', objective: 'stairhead', group: M39_STAIRHEAD, spawned: M39_STAIRHEAD_SPAWNED, down: M39_STAIRHEAD_DOWN });

  // the waves once the barricade is shut; the wave director saves its own run, so a start is only asked when none runs
  k.every(30, () => {
    if (!k.active('m39') || !k.objCurrent('m39', 'hold') || k.flag(M39_WAVES_DONE)) return;
    const w = k.ctx.services.get('waves');
    if (!w || w.current) return;
    if (!w.start(M39_WAVES)) k.warn(`[harrowmark-a4-quests] waves ${M39_WAVES} did not start`);
  });
  k.on('wave.cleared', (e) => {
    if (e.defId !== M39_WAVES || !k.active('m39')) return;
    // Gaut between the second and third waves (a talk, not a step: missing it costs nothing)
    if (e.index === 1 && !k.flag(M39_BREATH_DONE)) {
      k.set(M39_BREATH_DONE);
      k.later(() => void k.ctx.services.get('dialogue')?.start(M39_BREATH_SCENE, M39_BREATH_NPC));
    }
    if (e.index === 3) { k.set(M39_WAVES_DONE); toast(k, 'harrowmark.a4.q.m39.guard'); }
  });
  // the guard only comes once the waves are done; cleared, the stair is held
  spawnWhen(k, { quest: 'm39', objective: 'hold', group: M39_GUARD, spawned: M39_GUARD_SPAWNED, down: M39_HELD, ready: () => k.flag(M39_WAVES_DONE) });

  playWhen(k, { quest: 'm39', objective: 'fall', scene: M39_FALL, done: M39_FALLEN });

  // a spared Footman on the stairs is Halvard's +1 (the city watch remembers), inside the creature mercy cap
  const credited = new Set<string>();
  k.on('mercy', (e) => {
    if (e.verb !== 'spare' || !e.actorId || e.track !== null || credited.has(e.actorId) || !k.active('m39')) return;
    const tag = k.ctx.actors.get(e.actorId)?.spawnTag ?? '';
    if (!tag.startsWith('m39.')) return;
    credited.add(e.actorId);
    if (k.ctx.state.creatureMercyFavour('halvard') + k.num(M39_MERCY) >= CREATURE_MERCY_CAP) return;
    k.set(M39_MERCY, k.num(M39_MERCY) + 1);
    k.favour('halvard', 1);
  });

  // Gaut's Oathblade, in the form the class carries (Q3); a full bag holds it until there is room
  const grant = (): void => {
    if (k.qstate('m39') !== 'completed' || k.flag(M39_OATHBLADE)) return;
    const p = oathbladePorts(k);
    if (!p) return;
    const r = grantOathblade(p);
    if (!r.ok) { toast(k, 'harrowmark.a4.q.m39.bagFull'); return; }
    k.set(M39_OATHBLADE);
    if (r.granted) toast(k, 'harrowmark.a4.q.m39.oathblade');
  };
  k.on('quest.completed', (e) => { if (e.questId === 'm39') k.later(grant); });
  k.every(300, grant);
}

export function installM40(k: Kit): void {
  const svc = () => k.ctx.services.get('escortsAct4');
  const waystones = () => k.ctx.services.get('waystones');
  k.on('interior.entered', (e) => {
    if (e.interiorId === DEEP_RUN_ID && k.active('m40') && !k.flag(M40_ENTERED)) k.set(M40_ENTERED);
  });

  const held = new Set<string>();
  const wanted = (): Act4EscortDef | null => {
    if (!k.active('m40') || !k.flag(M40_ENTERED) || k.flag(M40_OUT)) return null;
    if (!k.flag(M40_SLUICE_FLAG)) {
      if (!k.flag(M40_LEG1_AT)) return m40Escort(1);
      return held.has(m40LegId(1)) ? null : m40Escort(1, true);
    }
    return m40Escort(2);
  };
  const sync = (): void => {
    const s = svc();
    if (!s) return;
    const cur = s.active();
    const w = wanted();
    const mine = (id: string): boolean => id.startsWith(M40_ESCORT);
    if (cur && mine(cur) && cur !== w?.id && !held.has(cur)) s.stop(cur);
    if (cur && mine(cur) && held.has(cur) && k.flag(M40_SLUICE_FLAG)) { held.delete(cur); s.stop(cur); return; }
    if (w && !s.active() && !s.start(w)) k.warn(`[harrowmark-a4-quests] escort ${w.id} did not start`);
  };
  k.on('escort.arrived', (e) => {
    if (e.escortId === m40LegId(1)) {
      k.set(M40_LEG1_AT);
      held.add(e.escortId);
      toast(k, 'harrowmark.a4.q.m40.gate');
    } else if (e.escortId === M40_ESCORT) {
      k.set(M40_OUT);
      k.after(90, () => { if (svc()?.active() === M40_ESCORT) svc()?.stop(M40_ESCORT); });
      k.later(() => recheck(k));
    }
  });
  k.on('save.loaded', () => held.clear());
  k.every(20, sync);

  // the deep run's three respawn checkpoints, each set as the player passes it, cleared at the exit
  k.every(30, () => {
    if (!k.active('m40') || !k.flag(M40_ENTERED)) return;
    const at = k.num(M40_CHECKPOINT);
    for (let n = 3; n > at; n--) {
      const id = `${P}.checkpoint.${n}`;
      if (distanceTo(k, id) > CHECKPOINT_RADIUS) continue;
      k.set(M40_CHECKPOINT, n);
      waystones()?.setCheckpoint(M40_RESPAWN_ID, id);
      break;
    }
  });
  k.on('quest.completed', (e) => { if (e.questId === 'm40') waystones()?.clearCheckpoint(M40_RESPAWN_ID); });
}

export function installM41(k: Kit): void {
  const start = (): void => {
    if (k.qstate('m40') === 'completed' && k.qstate('m41') === 'inactive') k.ctx.services.get('quests')?.start('m41');
  };
  k.on('quest.completed', (e) => { if (e.questId === 'm40') k.later(start); });
  k.on('save.loaded', () => k.later(start));
  k.later(start);
  playWhen(k, { quest: 'm41', objective: 'gather', scene: M41_CAMP_SCENE, done: M41_GATHERED, ready: () => distanceTo(k, 'harrowmark.a4.m41.camp') <= CAMP_RADIUS });
}
