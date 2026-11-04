import type { TrialStart } from '../../../companions/trials';
import type { EnemyDef, MoveDef, SpawnerDef } from '../../types';
import { WYRM_ATTACKS } from '../WyrmBody';

/** Ids Ysmeryth's trial and scenes read (K4 PR 2's anchors, K13's flags, K14's trial id). */
/** The trial id (K13's `trials.start`, K14's boss mix key, K15's Yield prompt). */
export const YSMERYTH_TRIAL_ID = 'ysmeryth-trial';

export const YSMERYTH_IDS = {
  /** The trial id (K14's `YSMERYTH_TRIAL_ID`, the boss mix key). */
  trialId: YSMERYTH_TRIAL_ID,
  spawnerId: 'wyrm.ysmeryth.trial',
  arenaCentre: 'dragonspine.roost.arena.centre',
  landMark: 'dragonspine.roost.ysmeryth.land',
  /** The Wyrm's Hearth scene marks (M32, M34; K13 drives them). */
  hearth: {
    perch: 'dragonspine.hearth.ysmeryth.perch',
    land: 'dragonspine.hearth.ysmeryth.land',
    reveal: 'dragonspine.hearth.ysmeryth.reveal',
    oath: 'dragonspine.hearth.ysmeryth.oath',
  },
  /** K13 writes it when M31 completes: from then she perches on the Hearth by default. */
  m31Complete: 'story.m31.complete',
  codexId: 'ysmeryth',
} as const;

/** Tuning for the trial (plans/act3-K6a-pr2.md 3; the real-game round decides the numbers). */
export const YSMERYTH = {
  scale: 6,
  /** A round (one break) takes a level 23 to 25 player about 75 to 100 s of fighting. */
  maxHealth: 3000,
  maxPoise: 260,
  /** On the ground she steps, never runs (the mover's cap is the flight speed). */
  groundSpeed: 3.5,
  /** Her ground goal stays within this of her landing mark. */
  groundLeash: 10,
  /** Flight: the mover's cap, the round-break loop round the arena centre, and its altitude. */
  flySpeed: 22,
  loopRadius: 30,
  loopAltitude: 16,
  loopSeconds: 9,
  /** The player further than this from her landing mark (but inside the 80 m rule) sends her up. */
  kiteRange: 60,
  /** After the player comes back within `kiteRange`, she is down within this. */
  landWithin: 6,
  /** The keeper's call: the stun, at most once per round, never in a round's first `callAfter` seconds. */
  callStun: 1.2,
  callAfter: 12,
  /** After a won or yielded trial she leaves this many seconds later (unless K13 calls `endTrial` first). */
  endDelay: 3,
  /** Breath jet reach (metres from the mouth). */
  breathJet: 16,
  /** The 80 m arena rule (K0 trial v2). */
  leaveDistance: 80,
  breaksToWin: 3,
  yieldAfterBreaks: 2,
} as const;

function move(id: string, clip: { clip: string; activeStart: number; activeEnd: number }, rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}

/** The two new clips' windows (WyrmBody `Sweep`, `Call`). */
export const YSMERYTH_ATTACKS = {
  sweep: { clip: 'Sweep', activeStart: 0.55, activeEnd: 0.8 },
  slam: WYRM_ATTACKS.tailWhip,
  breath: WYRM_ATTACKS.spit,
  call: { clip: 'Call', activeStart: 0.5, activeEnd: 0.8 },
} as const;

/**
 * Ysmeryth the Coal-Mother in M31's trial (design 7.6, 10 row 27; plans/act3-K6a-pr2.md): the procedural wyrm at 6x in
 * the cooled-slag palette with a lit crest. Non-lethal (the trial floors both sides at 1 HP): no mercy, no XP, no loot,
 * never `dragonkin`. The `ysmeryth-trial` overlay (overlay.ts) gates the call and flies her between rounds.
 */
export const YSMERYTH_DEF: EnemyDef = {
  kind: 'ysmeryth',
  nameKey: 'enemies.name.ysmeryth',
  model: { prefer: [], tint: 0xffffff, weapons: 'none' },
  maxHealth: YSMERYTH.maxHealth,
  maxPoise: YSMERYTH.maxPoise,
  walkSpeed: YSMERYTH.groundSpeed,
  // The mover's cap: her flight between rounds (the overlay keeps her to `groundSpeed` on the ground).
  chaseSpeed: YSMERYTH.flySpeed,
  moves: [
    move('ysmeryth.sweep', YSMERYTH_ATTACKS.sweep, {
      windup: 1.0, telegraph: 'dodge', weapon: 'right', damage: 30, poise: 45,
      range: [0, 14], cooldown: 7, recover: 1.4, weight: 3, area: { radius: 9, centre: 'front', offset: 8 },
    }),
    move('ysmeryth.slam', YSMERYTH_ATTACKS.slam, {
      windup: 0.9, telegraph: 'block', weapon: 'left', damage: 34, poise: 55,
      range: [0, 12], cooldown: 8, recover: 1.4, weight: 2, area: { radius: 10, centre: 'self' },
    }),
    move('ysmeryth.breath', YSMERYTH_ATTACKS.breath, {
      windup: 1.2, telegraph: 'dodge', weapon: 'right', damage: 26, poise: 30,
      range: [6, 24], cooldown: 10, recover: 1.6, weight: 2, onHit: 'ignite', element: 'fire',
    }),
    // No damage: the call's effect is the trial's shared stun when its window opens (overlay.ts).
    move('ysmeryth.call', YSMERYTH_ATTACKS.call, {
      windup: 1.0, telegraph: 'dodge', weapon: 'right', damage: 0, poise: 0,
      range: [0, 40], cooldown: 20, recover: 1.0, weight: 2,
    }),
  ],
  material: 'ash',
  rises: false,
  body: 'wyrm',
  behaviour: 'ysmeryth-trial',
  breakStaggerSeconds: 3,
};

/** Her trial group: manual, never saved (K13 restarts the trial; she is re-spawned by `beginTrial`). */
export const YSMERYTH_SPAWNERS: readonly SpawnerDef[] = [
  {
    id: YSMERYTH_IDS.spawnerId,
    tag: YSMERYTH_IDS.spawnerId,
    enemy: 'ysmeryth',
    count: 1,
    anchor: YSMERYTH_IDS.landMark,
    band: 'dragonspine',
    area: 'dragonspine-summit',
    activation: 'manual',
    respawn: 'never',
    leash: false,
    ephemeral: true,
  },
];

/** The trial start K13 (through `ysmeryth.beginTrial`) uses: three breaks, Yield after two, the 80 m rule at the roost. */
export function trialOpts(opponentId: string, arenaCentre: { x: number; z: number }): TrialStart {
  return {
    id: YSMERYTH_IDS.trialId,
    opponentId: opponentId as TrialStart['opponentId'],
    breaksToWin: YSMERYTH.breaksToWin,
    onLoss: 'restart',
    allowYield: { afterBreaks: YSMERYTH.yieldAfterBreaks },
    leaveDistance: YSMERYTH.leaveDistance,
    arenaCentre: { x: arenaCentre.x, z: arenaCentre.z },
  };
}
