/**
 * The Ashen Prior's numbers (plans/slice-2-ashen-prior.md section 3 and its review section 10). The design gives the telegraph
 * (0.9 s censer lift), three breaks per phase and the Surge-only shield (design 10 row 17, 11.6); everything else is a reading
 * for the integration thread to tune.
 */

export const PRIOR_BOSS_ID = 'ashen-prior';
export const PRIOR_KIND = 'ashen-prior';
export const PRIOR_NAME_KEY = 'boss.ashen-prior.name';

/** Anchors and blocker from thread 3a's vault (world-layout-and-npcs.md section 6, plans/slice-2-interiors-nav.md). */
export const VAULT = {
  interiorId: 'chapel-vault',
  arenaTrigger: 'trg.vault.arena',
  arenaDoor: 'vault.arena.door',
  centre: 'vault.arena.centre',
  pillars: ['vault.pillar.1', 'vault.pillar.2', 'vault.pillar.3', 'vault.pillar.4'],
  gate: 'vault.arena.gate',
  /** The arena is 24 x 24 m; the Prior glides inside this half-extent around the centre. */
  arenaHalfExtent: 11,
} as const;

/** Thread 5's four one-member summon groups (one Ash Wraith each on `vault.summon.n`). */
export const SUMMON_GROUPS = [
  'brightwater.prior-summon.1',
  'brightwater.prior-summon.2',
  'brightwater.prior-summon.3',
  'brightwater.prior-summon.4',
] as const;

export const PRIOR = {
  level: 5,
  maxHealth: 600,
  maxPoise: 60,
  /** Poise refills after this long without damage (design 9.6). */
  poiseRegenDelay: 4,
  /** Health fractions where a new phase starts (two phases, ruling). */
  phases: [0.5] as readonly number[],
  breaksPerPhase: 3,
  releaseWindowSeconds: 6,
  shieldBreakers: ['heartshard-surge'] as readonly string[],
  /** Until the final-phase `last` break, health never drops below this fraction (accepted reading). */
  healthFloor: 0.08,
  /** Order 99: the end of the buffs band, after the registry's shield at -1 (review should-fix 2). */
  floorModifierOrder: 99,
  glideSpeed: 1.8,
  /** He stops gliding inside this distance and lets the censer do the work. */
  glideStopDistance: 3.2,
  /** Break stagger (design 9.6). */
  breakSeconds: 1.2,
  teleportOutSeconds: 0.4,
  hiddenSeconds: 0.3,
  teleportInSeconds: 0.4,
  summonCastSeconds: 2,
  /** Seconds of the player within censer range before he teleports away. */
  campSeconds: 10,
  /** Phase 2 multiplies every cooldown by this. */
  phase2Cooldown: 0.75,
} as const;

/** Summon waves: the two phase openings (shielded) plus one unshielded re-summon per phase (review B1, B2). */
export const SUMMONS = {
  openingCount: [2, 3] as readonly number[],
  resummonCount: 2,
  maxLive: 4,
  /** A re-summon waits this long after the previous wave, and for fewer than `resummonBelow` live summons. */
  resummonAfter: 25,
  resummonBelow: 2,
  resummonsPerPhase: 1,
} as const;

export interface PriorMoveDef {
  id: 'censer' | 'chain';
  /** The telegraph's and the hit's `attackId`. */
  attackId: string;
  telegraph: 'block' | 'dodge';
  windup: number;
  recover: number;
  cooldown: number;
  /** Distance band (m, feet to feet) in which the move may start. */
  range: readonly [number, number];
  damage: number;
  poise: number;
}

export const MOVES: Readonly<Record<PriorMoveDef['id'], PriorMoveDef>> = {
  /** Censer swing: 0.9 s lift, white flash, gong, 5 m ring (design 11.6); a red 360 degree sweep. */
  censer: {
    id: 'censer',
    attackId: 'prior.censer',
    telegraph: 'dodge',
    windup: 0.9,
    recover: 1.1,
    cooldown: 2.5,
    range: [0, 4.5],
    damage: 28,
    poise: 30,
  },
  /** Ash-chain: a blockable 14 m lash that slows (no pull; review should-fix 10). Not parryable: a script hit has no window. */
  chain: {
    id: 'chain',
    attackId: 'prior.chain',
    telegraph: 'block',
    windup: 0.6,
    recover: 0.7,
    cooldown: 5,
    range: [5, 14],
    damage: 14,
    poise: 10,
  },
};

export const CENSER_RADIUS = 5;
export const CHAIN = {
  length: 14,
  /** Distance from the chain's line that still hits. */
  radius: 0.7,
  /** The aim locks this long before the lash, so a late side-step dodges it. */
  aimLockBefore: 0.15,
  slow: { speedScale: 0.6, seconds: 2 },
} as const;

/** Presentation timings (sim seconds). */
export const PRESENTATION = {
  introSeconds: 4,
  introRiseSeconds: 1.5,
  introGongAt: 1.5,
  retrySeconds: 1.2,
  releaseDissolveSeconds: 1.2,
  releaseTint: 0xffe6a8,
  deathClipSeconds: 1,
  deathDissolveSeconds: 1.4,
  deathTint: 0x8a8a8a,
  teleportTint: 0xd8e4ff,
} as const;
