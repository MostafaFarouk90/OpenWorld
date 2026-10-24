// D04's two coolant pools, built from A9's puzzle parts (PuzzleController, ValveWheel, the `puzzles` service). Each is a ring
// of valves beside a pool anchor with a pressure clock: route every valve to the wall marks inside the clock and the pool's
// vents open on their own (the Weeping Bellows' Surge-lit braziers are left out: these are the shorter, valve-only rooms).
// The slag from the pool then settles and `puzzle.solved` `{ id }` credits D04. Nothing is saved except the solved flag.
import type * as THREE from 'three';
import type { Kit, Off } from '../../director/kit';
import { PuzzleController, type PuzzleDef, type PuzzlePhase } from '../../../../../puzzles/PuzzleController';
import { valveInteractable } from '../../../../../puzzles/ValveWheel';
import { showToast } from '../../../../../waystones/toast';
import { D04_POOL_FLAGS, D04_POOL_IDS } from './d04.quest';

export interface PoolSpec {
  n: 1 | 2;
  puzzleId: string;
  /** set on the solve; the pool then loads solved */
  flag: string;
  /** the room's anchor (A4's `oldsmoke.deepdelve.pool.N`); the valves ring it */
  anchor: string;
  /** the D04 objective that must be current for the valves to turn */
  objective: string;
  valvePrefix: string;
  plaque: readonly number[];
  startShort: readonly number[];
  positions: number;
  order: readonly number[];
  seconds: number;
}

export const D04_POOLS: readonly PoolSpec[] = [
  { n: 1, puzzleId: D04_POOL_IDS[0], flag: D04_POOL_FLAGS[0], anchor: 'oldsmoke.deepdelve.pool.1', objective: 'pool1', valvePrefix: 'd04pool1', plaque: [1, 2, 0], startShort: [1, 2, 1], positions: 3, order: [0, 1, 2], seconds: 40 },
  { n: 2, puzzleId: D04_POOL_IDS[1], flag: D04_POOL_FLAGS[1], anchor: 'oldsmoke.deepdelve.pool.2', objective: 'pool2', valvePrefix: 'd04pool2', plaque: [2, 0, 1, 2], startShort: [2, 1, 2, 1], positions: 3, order: [2, 0, 3, 1], seconds: 45 },
];

/** Where valve i of a pool stands: an even ring about the pool anchor. */
export const POOL_RING_RADIUS = 3.2;
export const ringPoint = (centre: { x: number; y: number; z: number }, i: number, of: number): { x: number; y: number; z: number } => {
  const a = (i / of) * Math.PI * 2;
  return { x: centre.x + Math.cos(a) * POOL_RING_RADIUS, y: centre.y, z: centre.z + Math.sin(a) * POOL_RING_RADIUS };
};

/** The controller's definition: each valve starts `startShort[i]` turns short of its mark (the turns needed in all are their sum). */
export function poolDef(p: PoolSpec): PuzzleDef {
  return {
    id: p.puzzleId, plaque: p.plaque, positions: p.positions, order: p.order, seconds: p.seconds, valvePrefix: p.valvePrefix,
    initial: p.plaque.map((m, i) => (m - p.startShort[i] + p.positions * 4) % p.positions),
  };
}

/** Ticks between the routing holding and the vents opening (the pool needs a moment to drain). */
export const POOL_VENT_TICKS = 90;

export function installPool(k: Kit, p: PoolSpec): Off[] {
  const { ctx } = k;
  const offs: Off[] = [];
  const solved = (): boolean => k.flag(p.flag);
  const toast = (key: string): void => {
    try { showToast(ctx.hud, ctx.strings.t(key)); } catch { /* headless or a stub context: no toast */ }
  };
  const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
  const announce = (phase: PuzzlePhase): void => {
    if (phase === 'pressure') toast('d04.pool.pressure');
    else if (phase === 'lighting') toast('d04.pool.routed');
    else if (phase === 'failed') toast('d04.pool.failed');
  };
  const controller = new PuzzleController(poolDef(p), {
    emitState: (id, phase) => {
      emit('puzzle.state', { id, phase });
      announce(phase);
      if (phase === 'lighting') {
        k.after(POOL_VENT_TICKS, () => {
          if (controller.phase() !== 'lighting') return;
          for (const i of p.order) controller.light(i);
        });
      }
    },
    emitFailed: (id) => emit('puzzle.failed', { id }),
    emitSolved: (id) => {
      k.set(p.flag);
      emit('puzzle.solved', { id });
      toast('d04.pool.solved');
    },
  });

  // A9's room abort (death, fast travel, a load) resets the pool quietly. A duplicate registration only costs the abort.
  try {
    const off = ctx.services.get('puzzles')?.register(p.puzzleId, { timer: controller.timer, onAbort: () => controller.abort() });
    if (off) offs.push(off);
  } catch (e) {
    k.warn(`D04: puzzle ${p.puzzleId} could not register with the puzzles service: ${String(e)}`);
  }

  const rederive = (): void => {
    if (solved()) controller.restoreSolved();
    else controller.clearSolved();
  };
  k.on('save.loaded', rederive);
  rederive();

  // The valves stand once the room's anchor exists (A4's mine may load after the director); only the current pool turns.
  let placed = false;
  const stopPlacing = k.every(30, () => {
    if (placed || !ctx.interaction) return;
    const at = ctx.anchors.find(p.anchor)?.position;
    if (!at) return;
    placed = true;
    stopPlacing();
    controller.wheels.forEach((w, i) => {
      const v = ringPoint(at, i, controller.wheels.length);
      offs.push(
        ctx.interaction.register(valveInteractable(w, (out: THREE.Vector3) => out.set(v.x, v.y + 1, v.z), {
          radius: 2, enabled: () => !solved() && k.active('d04') && k.objCurrent('d04', p.objective),
        })),
      );
    });
  });

  k.every(1, () => controller.update(1 / 60));
  // one remover that reads the live list: the valves above register later, when the anchor appears
  return [() => {
    controller.abort();
    for (const off of offs.splice(0)) off();
  }];
}

export function installPools(k: Kit): Off[] {
  return D04_POOLS.flatMap((p) => installPool(k, p));
}
