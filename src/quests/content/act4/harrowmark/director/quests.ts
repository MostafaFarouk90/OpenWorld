// Each Harrowmark quest's own rules that cannot live in a def or the dialogue: M35's entry, M36's roofs and the daggerman,
// R19's pair and Bran's bout, R20's way at each post, R21's lanes, R22's anvil runs, D07's door, valves and ledgers, M37's seats,
// war-song and toast. Choices themselves are dialogue effects (the Act 1 pattern).
import type { Kit, Off } from './shared';
import { distanceTo, offerScene, onFloorWithin, recheck, toast } from './shared';
import { createSongBar } from '../../../act3/greyfen/director/songBar';
import { ACT4_SPAWN_FLAGS } from '../../../../../harrowmark/act4/spawners';
import { CRUCIBLE_ID } from '../../../../../harrowmark/act4/sites';
import { Q } from '../anchors';
import { M35_ENTERED } from '../m35.quest';
import { M36_DAGGER_NPC, M36_DAGGER_SCENE, M36_SECTION } from '../m36.quest';
import { R19_CAPTAINS, R19_BOUT_WON, R19_CHOICE, R19_MUSTER, r19Pair } from '../r19.quest';
import { R20_AT, R20_CHOICE, R20_PASSED, R20_SECTION } from '../r20.quest';
import { R21_SECTION } from '../r21.quest';
import { R22_ANVIL, R22_FORGED } from '../r22.quest';
import { D07_ENTERED, D07_LEDGERS, D07_NOTES, D07_VALVE, D07_VALVE_ORDER, D07_VALVE_STEP, D07_VALVES } from '../d07.quest';
import { M37_BOND_NPC, M37_BOND_SCENE, M37_COMPANIONS, M37_END_NPC, M37_END_SCENE, M37_SEAT, M37_SUNG, M37_TABLE } from '../m37.quest';
import { R19_BOUT_SPAWNER } from '../spawners';
import { BeatRun } from './beat';
import { R19_BOUT_EVENT } from '../../../../../dialogue/content/act4/harrowmark/cast.dialogue';

/** Seconds of the "delegates go in" beat before M35's entry is written. */
const M35_ENTRY_TICKS = 120;

export function installM35(k: Kit): void {
  let pending = false;
  k.every(30, () => {
    if (pending || !k.active('m35') || k.flag(M35_ENTERED) || !k.objCurrent('m35', 'entered')) return;
    pending = true;
    toast(k, 'harrowmark.a4.q.m35.entering');
    k.after(M35_ENTRY_TICKS, () => {
      pending = false;
      if (!k.active('m35') || k.flag(M35_ENTERED)) return;
      k.set(M35_ENTERED);
      k.later(() => recheck(k));
    });
  });
  k.on('save.loaded', () => { pending = false; });
}

/** The three stealth crossings: a cleared section writes its quest's flag whatever step is current (the `doneWhen` reads it). */
export function installCrossings(k: Kit): void {
  k.on('stealth.section', (e) => {
    if (e.phase !== 'cleared') return;
    if (e.sectionId === M36_SECTION && k.active('m36')) k.set('story.m36.roofsCrossed');
    if (e.sectionId === R21_SECTION && k.active('r21')) k.set('story.r21.lanesCrossed');
    for (const n of [1, 2, 3]) if (e.sectionId === R20_SECTION(n) && k.active('r20') && k.str(R20_CHOICE) === 'stealth' && k.flag(R20_AT(n))) k.set(R20_PASSED(n));
    k.later(() => recheck(k));
  });
}

export function installM36(k: Kit): void {
  // the daggerman speaks when Cael reaches the drop
  offerScene(k, { quest: 'm36', objective: 'dagger', scene: M36_DAGGER_SCENE, npc: M36_DAGGER_NPC, ready: () => distanceTo(k, `${Q}.m36.drop`) <= 10 });
}

export function installR19(k: Kit, offs: Off[]): void {
  // the pair is written as soon as two companies are mustered
  const pair = (): void => {
    if (!k.active('r19') || k.str(R19_CHOICE)) return;
    const m = R19_CAPTAINS.filter((c) => k.flag(R19_MUSTER(c.id))).map((c) => c.id);
    if (m.length >= 2) k.set(R19_CHOICE, r19Pair(m[0]!, m[1]!));
  };
  k.every(30, pair);

  // Bran's bout: his challenge asks for it; it starts once no dialogue is open; a win (or a yield spared) writes the flag
  let pending = false;
  let bout: { trialId: string; opponentId: string } | null = null;
  const TRIAL = 'r19.bout';
  const begin = (): void => {
    const en = k.ctx.services.get('enemies');
    const trials = k.ctx.services.get('trials');
    if (!en || !trials || trials.state()) return k.warn('[harrowmark-a4-quests] R19: no trial can start now');
    en.despawnGroup(R19_BOUT_SPAWNER);
    const [opponentId] = en.spawnGroup(R19_BOUT_SPAWNER, { aggro: true });
    if (!opponentId) return k.warn('[harrowmark-a4-quests] R19: the second did not spawn');
    bout = { trialId: TRIAL, opponentId };
    if (!trials.start({ id: TRIAL, opponentId, breaksToWin: 3, onLoss: 'end' })) { bout = null; en.despawnGroup(R19_BOUT_SPAWNER); }
  };
  const win = (): void => {
    if (k.flag(R19_BOUT_WON)) return;
    k.set(R19_BOUT_WON);
    k.later(() => recheck(k));
  };
  const clear = (): void => {
    bout = null;
    k.later(() => k.ctx.services.get('enemies')?.despawnGroup(R19_BOUT_SPAWNER));
  };
  offs.push(k.onNamed(R19_BOUT_EVENT, () => { if (k.objCurrent('r19', 'bout') && !bout) pending = true; }));
  k.on('trial.won', (e) => { if (bout?.trialId === e.trialId) win(); });
  k.on('trial.ended', (e) => { if (bout?.trialId === e.trialId) clear(); });
  k.on('mercy', (e) => {
    if (!bout || e.actorId !== bout.opponentId || e.verb !== 'spare') return;
    win();
    k.ctx.services.get('trials')?.stop(bout.trialId);
    clear();
  });
  k.on('save.loaded', () => { pending = false; if (bout) { k.ctx.services.get('trials')?.stop(bout.trialId); clear(); } });
  k.every(6, () => {
    if (!pending || k.ctx.services.get('dialogue')?.active) return;
    pending = false;
    if (k.objCurrent('r19', 'bout') && !k.flag(R19_BOUT_WON)) begin();
  });
}

/** R20: the post's fight (force) or its watch (stealth) comes up when the cart is parked short of it, never before. */
export function installR20(k: Kit): void {
  k.every(20, () => {
    if (!k.active('r20')) return;
    const way = k.str(R20_CHOICE);
    for (const n of [1, 2, 3]) {
      if (!k.objCurrent('r20', `cp${n}`) || !k.flag(R20_AT(n))) continue;
      if (way === 'force' && !k.flag(ACT4_SPAWN_FLAGS.r20Force(n))) k.set(ACT4_SPAWN_FLAGS.r20Force(n));
      if (way === 'stealth' && !k.flag(ACT4_SPAWN_FLAGS.r20Stealth(n))) k.set(ACT4_SPAWN_FLAGS.r20Stealth(n));
    }
  });
}

/** A beat bar on screen (the tempering strip) for a run; a reduced boot without a document or HUD draws nothing. */
function mountBar(k: Kit, run: BeatRun, prefix: string): Off {
  const hud = (k.ctx as unknown as { hud?: { mount(slot: string, w: unknown): () => void } }).hud;
  const bar = createSongBar(typeof document === 'undefined' ? null : (document as never), () => run.view(), (key) => k.ctx.strings.t(key.replace('greyfen.q.r13.bar.', `${prefix}.bar.`)));
  return bar && hud ? hud.mount('bottom-center', { ...bar, id: `${prefix}.bar` }) : () => {};
}

export const R22_BEAT = 'harrowmark.a4.q.r22.beat';
export const M37_BEAT = 'harrowmark.a4.q.m37.beat';

export function installR22(k: Kit, now: () => number = () => performance.now()): Off {
  const run = new BeatRun({
    now, prefix: R22_BEAT, toast: (key) => toast(k, key),
    fails: () => k.num('story.r22.beatFails'), failed: () => k.set('story.r22.beatFails', k.num('story.r22.beatFails') + 1),
    done: () => {
      const n = k.objCurrent('r22', 'forge1') ? 1 : k.objCurrent('r22', 'forge2') ? 2 : 0;
      if (!n) return;
      k.set(R22_FORGED(n as 1 | 2));
      k.set('story.r22.beatFails', 0);
      k.later(() => recheck(k));
    },
  });
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('r22')) return;
    if (e.interactableId === R22_ANVIL(1) && k.objCurrent('r22', 'forge1')) run.press(1);
    if (e.interactableId === R22_ANVIL(2) && k.objCurrent('r22', 'forge2')) run.press(2);
  });
  k.every(6, () => run.update());
  k.on('save.loaded', () => run.reset());
  return mountBar(k, run, R22_BEAT);
}

export function installD07(k: Kit): void {
  k.on('interior.entered', (e) => {
    if (e.interiorId === CRUCIBLE_ID && k.active('d07') && !k.flag(D07_ENTERED)) { k.set(D07_ENTERED); k.later(() => recheck(k)); }
  });
  // the ledgers are the quest's to write (coordinator, 2026-11-06): reading them sets the flag M38 reads
  k.on('dialogue.ended', (e) => {
    if (e.dialogueId === D07_NOTES.ledgers && e.reason === 'completed' && k.active('d07') && !k.flag(D07_LEDGERS)) k.set(D07_LEDGERS);
  });
  // the valves, in the furnace log's order; a wrong wheel puts the count back to nothing
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('d07') || k.flag(D07_VALVES)) return;
    const n = [1, 2, 3].find((i) => e.interactableId === D07_VALVE(i));
    if (!n) return;
    const step = k.num(D07_VALVE_STEP);
    if (n !== D07_VALVE_ORDER[step]) {
      k.set(D07_VALVE_STEP, n === D07_VALVE_ORDER[0] ? 1 : 0);
      toast(k, 'harrowmark.a4.q.d07.valveWrong');
      return;
    }
    if (step + 1 < D07_VALVE_ORDER.length) {
      k.set(D07_VALVE_STEP, step + 1);
      toast(k, 'harrowmark.a4.q.d07.valveRight');
      return;
    }
    k.set(D07_VALVE_STEP, D07_VALVE_ORDER.length);
    k.set(D07_VALVES);
    toast(k, 'harrowmark.a4.q.d07.valves');
    k.later(() => recheck(k));
  });
}

export function installM37(k: Kit, now: () => number = () => performance.now()): Off {
  // each seat at the table starts its companion's scene (the talk objective is credited at its end)
  k.on('interact', (e) => {
    if (e.action !== 'interact' || !k.active('m37')) return;
    for (const c of M37_COMPANIONS) {
      if (e.interactableId !== M37_SEAT(c) || !k.objCurrent('m37', c)) continue;
      if (!k.ctx.services.get('dialogue')?.start(M37_BOND_SCENE(c), M37_BOND_NPC(c))) k.warn(`[harrowmark-a4-quests] M37: the ${c} scene could not start`);
    }
  });
  // the war-song on the table top
  const run = new BeatRun({
    now, prefix: M37_BEAT, toast: (key) => toast(k, key),
    fails: () => k.num('story.m37.beatFails'), failed: () => k.set('story.m37.beatFails', k.num('story.m37.beatFails') + 1),
    done: () => {
      if (!k.objCurrent('m37', 'song')) return;
      k.set(M37_SUNG);
      k.later(() => recheck(k));
    },
  });
  k.on('interact', (e) => {
    if (e.action === 'interact' && e.interactableId === M37_TABLE && k.objCurrent('m37', 'song')) run.press(2);
  });
  k.every(6, () => run.update());
  k.on('save.loaded', () => run.reset());
  // the last toast, at the table
  offerScene(k, { quest: 'm37', objective: 'toast', scene: M37_END_SCENE, npc: M37_END_NPC, ready: () => onFloorWithin(k, `${Q}.m37.feast`, 12) });
  return mountBar(k, run, M37_BEAT);
}
