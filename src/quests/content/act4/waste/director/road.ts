// The Glasslands, the cathedral and the Cinder Road:
// - M45: L1's Glasslands trigger writes the meeting (Wulfhild is posted there from then on); L1's chime puzzle sets the shrine
//   flag the chime step is done on; then Ulthred's voice plays once (a scene on L0's sequencer).
// - D08: entering the cathedral writes the entered flag (the narthex groups and the door lock read it); the Crown Shard is
//   given once when D08 completes with Eormen destroyed (and on a load that finds it owed).
// - M46: Hrolf walks as a guest while M46 runs; at each cairn the wave set starts once Cael is at the clearing, and the storm
//   is held clear only while a set runs (coordinator 18:01: the road between keeps real weather); the rim scene plays once
//   Cael reaches the Rimfoot fire.
import type { Kit } from '../../harrowmark/director/shared';
import { distanceTo, recheck, toast } from '../../harrowmark/director/shared';
import { companionGuestFlag } from '../../../../../companions/companions.plugin';
import { W } from '../ids';
import { M45_MET, M45_MET_TRIGGER, M45_VOICE, M45_VOICE_SCENE, CHIME_SOLVED_EVENT } from '../m45.quest';
import { CATHEDRAL_ID, D08_BOSS_FLAG, D08_ENTERED, D08_SHARD_GIVEN } from '../d08.quest';
import { M46_CAIRNS, M46_GUEST, M46_HELD, M46_RIM, M46_RIM_SCENE, M46_RIM_TRIGGER, M46_WAVE } from '../m46.quest';
import { WASTE_REWARD_IDS } from '../rewards';
import { LOG } from './generic';

/** Metres from a cairn's clearing at which its wave set starts. */
export const M46_WAVE_START_M = 35;

const player = (k: Kit, id: string): boolean => id === 'player' || id === k.ctx.player.actor?.id;

/** Plays `scene` once when `quest`'s `objective` is current and its end flag unset, and `ready()` holds. */
function playWhen(k: Kit, o: { quest: string; objective: string; scene: string; done: string; ready?: () => boolean }): void {
  let asked = false;
  k.every(30, () => {
    if (asked || !k.active(o.quest) || !k.objCurrent(o.quest, o.objective) || k.flag(o.done)) return;
    const s = k.ctx.services.get('scenes');
    if (!s || s.active !== null || k.ctx.services.get('dialogue')?.active) return;
    if (o.ready && !o.ready()) return;
    asked = true;
    void s.play(o.scene).then(() => { asked = false; k.later(() => recheck(k)); });
  });
  k.on('save.loaded', () => { asked = false; });
}

export function installM45(k: Kit): void {
  const meet = (): void => {
    if (!k.active('m45') || k.flag(M45_MET) || !k.objCurrent('m45', 'meet')) return;
    k.set(M45_MET);
    k.later(() => recheck(k));
  };
  k.on('trigger.enter', (e) => { if (e.triggerId === M45_MET_TRIGGER && player(k, e.actorId)) meet(); });
  k.onNamed(CHIME_SOLVED_EVENT, () => k.later(() => recheck(k)));
  playWhen(k, { quest: 'm45', objective: 'voice', scene: M45_VOICE_SCENE, done: M45_VOICE });
}

type WavesSavedView = { defId: string | null; phase: string; done?: string[] };
/** The sets the wave director has completed, read from its saved form (the service type does not list them; none if absent). */
export function completedSets(w: object): string[] {
  const s = (w as { serialize?: () => WavesSavedView }).serialize?.();
  if (!s) return [];
  return [...(s.done ?? []), ...(s.phase === 'done' && s.defId ? [s.defId] : [])];
}

export function installD08(k: Kit): void {
  k.on('interior.entered', (e) => {
    // only once Leofric has spoken: the flag sends him away, so an early entry must not strand his talk (review finding)
    if (e.interiorId !== CATHEDRAL_ID || !k.active('d08') || k.flag(D08_ENTERED) || !k.objDone('d08', 'dying')) return;
    k.set(D08_ENTERED);
    k.later(() => recheck(k));
  });
  k.on('boss.ended', (e) => { if (e.bossId === 'eormen' && k.active('d08')) k.later(() => toast(k, 'waste.q.d08.crypt')); });
  const owe = (): void => {
    if (k.qstate('d08') !== 'completed' || k.str(D08_BOSS_FLAG) !== 'defeated' || k.flag(D08_SHARD_GIVEN)) return;
    const inv = k.ctx.services.get('inventory');
    if (!inv) return;
    if (inv.add(WASTE_REWARD_IDS.d08, 1) > 0) k.set(D08_SHARD_GIVEN);
    else k.warn(`${LOG} D08: no room for the Crown Shard; it is given at the next load`);
  };
  k.on('quest.completed', (e) => { if (e.questId === 'd08') k.later(owe); });
  k.on('save.loaded', () => k.later(owe));
}

/** The wave set M46 wants started now (the cairn whose wave step is current and Cael at its clearing), or null. */
export function wantedWave(k: Kit): string | null {
  if (!k.active('m46')) return null;
  for (const n of M46_CAIRNS) {
    if (!k.objCurrent('m46', `wave${n}`) || k.flag(M46_HELD(n))) continue;
    if (distanceTo(k, `${W}.m46.wave.${n}.barricade`) <= M46_WAVE_START_M) return M46_WAVE(n);
  }
  return null;
}

/** The clear held while one of M46's sets runs (storms.ts takes it as an extra hold). */
export function m46Clears(k: Kit): string[] {
  const cur = k.ctx.services.get('waves')?.current?.defId;
  return cur && M46_CAIRNS.some((n) => M46_WAVE(n) === cur) ? ['quest:m46.wave'] : [];
}

export function installM46(k: Kit): void {
  // Hrolf as a guest for the length of the quest (L4's party, the guest flag)
  const guest = companionGuestFlag(M46_GUEST);
  k.every(30, () => {
    const want = k.active('m46');
    if (want && !k.flag(guest)) k.set(guest);
    if (!want && k.flag(guest)) k.clear(guest);
  });

  const refused = new Set<string>();
  k.every(30, () => {
    const id = wantedWave(k);
    const w = k.ctx.services.get('waves');
    if (!id || !w || w.current) return;
    if (w.start(id)) { toast(k, 'waste.q.m46.wave'); return; }
    // a set the director has already completed (a load between the last kill and the flag): the cairn was held. Any other
    // refusal (no enemies service, no barricade) is retried, never read as a fight won (review finding).
    if (!completedSets(w).includes(id)) {
      if (!refused.has(id)) { refused.add(id); k.warn(`${LOG} waves ${id} did not start; retrying`); }
      return;
    }
    const n = M46_CAIRNS.find((c) => M46_WAVE(c) === id)!;
    k.set(M46_HELD(n));
    k.later(() => recheck(k));
  });
  k.on('wave.cleared', (e) => {
    const n = M46_CAIRNS.find((c) => M46_WAVE(c) === e.defId);
    if (!n || !k.active('m46') || k.flag(M46_HELD(n))) return;
    k.set(M46_HELD(n));
    toast(k, 'waste.q.m46.held');
    k.later(() => recheck(k));
  });

  let atRim = false;
  k.on('trigger.enter', (e) => { if (e.triggerId === M46_RIM_TRIGGER && player(k, e.actorId)) atRim = true; });
  k.on('trigger.exit', (e) => { if (e.triggerId === M46_RIM_TRIGGER && player(k, e.actorId)) atRim = false; });
  playWhen(k, { quest: 'm46', objective: 'rim', scene: M46_RIM_SCENE, done: M46_RIM, ready: () => atRim || distanceTo(k, `${W}.m46.rim`) <= 25 });
}
