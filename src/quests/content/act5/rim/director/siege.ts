// M52 on N4's siege (plans/act5-N10.md section 3, M52; N4's answers in plans/act5-N4.md section 21): the favour snapshot on the
// quest's start, the stairs scene, `siege.start('m52')` once Cael reaches the start point, the wave flags and the recap rows from
// N4's events, the gate-holds scene, and the named allies' world bodies stepping out while their squads stand at the gate.
// Everything inside the siege (the waves, the orders, the ram, the dragons, the wounded beat, the load rule) is N4's.
import type { Kit, Off } from '../../../act4/harrowmark/director/shared';
import { recheck, toast } from '../../../act4/harrowmark/director/shared';
import { siegeRoster } from '../../../../../siege/roster';
import {
  M52_GATE_HELD, M52_HOLDS_SCENE, M52_SNAPSHOT, M52_SPARED_ANY, M52_SPAWN_TAG, M52_STAIRS_SCENE, M52_STOOD, M52_STOOD_ROWS, M52_WAVE,
  M52_WAVE4_HELD, M52_WAVES,
} from '../m52.quest';
import { LOG, playWhenCurrent } from './generic';

/** The named allies whose world bodies step out while the siege runs (N4's squads stand for them). */
export const M52_OUT_NPCS = ['rook', 'edric', 'wulfhild'] as const;
export const M52_OUT = (id: (typeof M52_OUT_NPCS)[number]): string => `story.m52.out.${id}`;
/** Polls to wait after a load before a missing run is restarted (N4 rebuilds a saved run first). */
const SETTLE_POLLS = 4;

/** Takes M52's snapshot once (the first call wins; WorldState refuses a second). */
export function takeM52Snapshot(k: Kit): void {
  const st = k.ctx.state as unknown as { snapshotFavour?(id: string): boolean };
  if (typeof st.snapshotFavour !== 'function') { k.warn(`${LOG} M52: the state has no favour snapshot`); return; }
  st.snapshotFavour(M52_SNAPSHOT);
}

/** What stood at the gate, from N4's roster on the snapshot (the same read the siege made), as flags Wystan's report reads. */
export function writeStood(k: Kit): void {
  const r = siegeRoster(k.ctx.state, 'm52');
  const rows: Record<(typeof M52_STOOD_ROWS)[number], boolean> = {
    halvard: r.squads.some((s) => s.look === 'halvard'), grisel: r.squads.some((s) => s.look === 'grisel'),
    ashwalker: r.squads.some((s) => s.look === 'ashwalker'), dragons: r.dragons.length > 0, supply: r.supply !== null,
  };
  for (const row of M52_STOOD_ROWS) k.set(M52_STOOD(row), rows[row]);
}

export function installM52(k: Kit): Off {
  const svc = () => k.ctx.services.get('siege');
  const running = (): boolean => k.active('m52') && k.objDone('m52', 'start') && !k.flag(M52_GATE_HELD);
  let settle = 0;
  let startWarned = false;

  k.on('quest.started', (e) => { if (e.questId === 'm52') takeM52Snapshot(k); });
  k.on('save.loaded', () => { settle = SETTLE_POLLS; if (k.active('m52')) takeM52Snapshot(k); });
  if (k.active('m52')) takeM52Snapshot(k);

  playWhenCurrent(k, { quest: 'm52', objective: 'stairs', scene: M52_STAIRS_SCENE });

  k.on('siege.wave.cleared', (e) => {
    if (e.siegeId !== 'm52' || !k.active('m52')) return;
    if (!k.flag(M52_WAVE(e.n))) k.set(M52_WAVE(e.n));
    // N4's per-wave breach (never `current.breached`, which stays true once the gate has fallen)
    if (e.n === 4 && !e.breached) k.set(M52_WAVE4_HELD);
    k.later(() => recheck(k));
  });
  k.on('siege.break', (e) => { if (e.siegeId === 'm52' && k.active('m52')) toast(k, 'rim.q.m52.orders'); });
  k.on('siege.completed', (e) => {
    if (e.siegeId !== 'm52' || !k.active('m52')) return;
    for (const n of M52_WAVES) if (!k.flag(M52_WAVE(n))) k.set(M52_WAVE(n));
    writeStood(k);
    k.later(() => recheck(k));
  });
  // any Warhost Soldier spared in the siege (Halvard's +1 per spare is N5's; this is only the recap row)
  k.on('mercy', (e) => {
    if (e.verb !== 'spare' || !e.actorId || !running() || k.flag(M52_SPARED_ANY)) return;
    if (k.ctx.actors.get(e.actorId)?.spawnTag === M52_SPAWN_TAG) k.set(M52_SPARED_ANY);
  });
  // the household guard's first appearance
  let guardToast = false;
  k.on('siege.wave.started', (e) => { if (e.siegeId === 'm52' && e.n === 4 && !guardToast) { guardToast = true; toast(k, 'rim.q.m52.guard'); } });

  k.every(15, () => {
    // the named allies' world bodies step out while their squads stand (Rook and Edric always; Wulfhild under F8 All)
    const on = running();
    const named = new Set(on ? siegeRoster(k.ctx.state, 'm52').squads.flatMap((s) => s.named ?? []) : []);
    for (const id of M52_OUT_NPCS) {
      const want = on && named.has(id);
      if (want !== k.flag(M52_OUT(id))) (want ? k.set(M52_OUT(id)) : k.clear(M52_OUT(id)));
    }
    if (!k.active('m52')) return;
    const s = svc();
    if (!s) return;
    // a run N4 already finished (a load between the last clear and the holds scene) still closes the waves
    if (s.completed('m52')) {
      if (M52_WAVES.some((n) => !k.flag(M52_WAVE(n)))) { for (const n of M52_WAVES) k.set(M52_WAVE(n)); writeStood(k); k.later(() => recheck(k)); }
      return;
    }
    if (settle > 0) { settle--; return; }
    if (k.objDone('m52', 'start') && !s.current && !k.flag(M52_WAVE(4))) {
      if (!s.start('m52') && !startWarned) { startWarned = true; k.warn(`${LOG} M52: the siege did not start`); }
    }
  });
  playWhenCurrent(k, { quest: 'm52', objective: 'holds', scene: M52_HOLDS_SCENE });
  return () => {};
}
