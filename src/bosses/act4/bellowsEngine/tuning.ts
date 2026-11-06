// The Bellows-Engine's numbers (D07, Act 4 L6 PR 1; plans/act4-L6.md section 2). The design gives: steam-driven clockwork, a
// piston punch and a steam jet, a 1.0 s telegraph (piston draw-back, hiss, orange vent flash), three poise bars, no mercy. Plan
// 6.2 adds the four valves (one live per phase), the 8 s vent, coal-shot volleys between phases, level 31, about 2,200 health and
// 700 kill XP. Everything else is a reading for the pacing test and L13's census.
import { ACT4_BOSS_BASE_LEVEL, ACT4_BOSS_IDS, ACT4_BOSS_RULES } from '../../act4Bosses';
import { act4BossLevel } from '../../../enemies/level';
import { CRUCIBLE_ARENA, CRUCIBLE_ARENA_GATE, CRUCIBLE_ARENA_GATE_FLAG, CRUCIBLE_ID, CRUCIBLE_LOCK_FLAG, CRUCIBLE_VALVES } from '../../../interiors/harrowmark/act4/crucible';

export const BELLOWS_BOSS_ID = ACT4_BOSS_IDS.bellowsEngine;
export const BELLOWS_KIND = 'bellows-engine';
export const BELLOWS_NAME_KEY = 'boss.bellows-engine.name';
/** The struck valves' actor kind (neutral, immortal; pays nothing). */
export const BELLOWS_VALVE_KIND = 'bellows-valve';

/** L10 writes both: the D07 quest has started, and the vat-hall valves have opened the arena gate (L2's flag blocker). */
export const D07_STARTED_FLAG = CRUCIBLE_LOCK_FLAG;
export const ARENA_GATE_FLAG = CRUCIBLE_ARENA_GATE_FLAG;

const P = 'harrowmark.a4.crucible';

/** L2's Crucible (src/interiors/harrowmark/act4/crucible.ts), in its local metres. */
export const ARENA = {
  interiorId: CRUCIBLE_ID,
  trigger: 'trg.harrowmark.a4.crucible.arena',
  centre: `${P}.arena.engine`,
  /** L2's inside-the-gate anchor, used to place the mouth anchor (interiors are placed by translation only). */
  entry: `${P}.arena.entry`,
  entryLocal: { x: 0, z: 48 },
  /** This plugin's anchor at the arena mouth, outside the trigger: the reload rule and the gate's clearance measure from it. */
  mouth: `${P}.arena.mouth`,
  mouthLocal: { x: 0, z: 44 },
  gate: CRUCIBLE_ARENA_GATE,
  /** The gate rect's arena side (local z) and the margin the player must be past it before it closes. */
  gateLocalZ: 46,
  gateMargin: 1,
  /** Metres from the mouth before the gate may close. */
  gateClearance: 5,
  valves: CRUCIBLE_VALVES.map((v) => `${P}.valve.${v.n}`) as readonly string[],
  chutes: [1, 2, 3].map((n) => `${P}.arena.chute.${n}`) as readonly string[],
  /** The arena floor rectangle (local). */
  rect: CRUCIBLE_ARENA,
  /** The player out of the rectangle this long mid-fight ends it (the Murkjaw backstop). */
  abandonSeconds: 3,
  veilWidth: 4.6,
  veilHeight: 4.4,
} as const;

export const BELLOWS = {
  level: ACT4_BOSS_BASE_LEVEL[BELLOWS_BOSS_ID],
  maxHealth: 2200,
  /** Health and damage scale this much per level away from 31 (the Skarl scale), never below 0.5. */
  perLevel: 0.05,
  maxPoise: 100,
  phases: [0.66, 0.33] as readonly number[],
  breaksPerPhase: 1,
  releaseWindowSeconds: ACT4_BOSS_RULES[BELLOWS_BOSS_ID].releaseWindowSeconds ?? 0,
  healthFloor: 0.08,
  floorModifierOrder: 99,
  plateModifierOrder: 60,
  /** The head turns toward the player this fast (radians a second): flanking works. */
  turnRate: Math.PI / 3,
  /** Hurtbox and body radius: the engine never stands closer than this to the player (a script push is not needed: it is bolted down). */
  bodyRadius: 2.6,
  /**
   * The static body the player bumps into: a low cylinder at the turntable (the boiler turns, so not a box). Inside the cradle
   * hurtbox (radius 3.0) and only cradle high, so a camera-ray aim (the Pathfinder's bolts) lands on a hurtbox, never on a
   * collider in front of one.
   */
  colliderRadius: 2.9,
  colliderHeight: 1.2,
} as const;

/** The design's 1.0 s telegraph, shared by the punch and the jet. */
export const TELEGRAPH_SECONDS = 1.0;

export const PUNCH = {
  attackId: 'bellows.punch',
  telegraph: 'block' as const,
  /** Reach from the engine's centre, and the half-angle of the arc in front of the head. */
  reach: 6,
  halfArc: (37.5 * Math.PI) / 180,
  damage: 38,
  poise: 30,
  recover: 0.8,
};

export const STEAM = {
  attackId: 'bellows.steam',
  telegraph: 'dodge' as const,
  range: 12,
  halfArc: (25 * Math.PI) / 180,
  seconds: 1.6,
  tickSeconds: 0.4,
  damage: 14,
  poise: 8,
  recover: 0.6,
  /** Every Nth attack in reach is a jet even close in. */
  everyNth: 3,
};

/** Coal shots: one lobbed shot at a far player (past the jet), and the volleys between phases. */
export const COAL = {
  attackId: 'bellows.volley',
  telegraph: 'dodge' as const,
  /** Seconds from the ring appearing to the shot landing. */
  flightSeconds: 1.0,
  radius: 3,
  damage: 30,
  poise: 24,
  /** A single lobbed shot's recover. */
  recover: 0.6,
  /** Between phases: volley start times inside the sealed state, shots per volley, the side offset of the flanking shots. */
  volleyAt: [0.6, 2.6, 4.6] as readonly number[],
  perVolley: 3,
  flank: 3.5,
  /** The seal lasts until the last shot has landed and this long after. */
  sealTail: 0.8,
};

export const RHYTHM = {
  /** Seconds between attacks by phase. */
  gap: [2.4, 2.0, 1.7] as readonly number[],
  /** First attack after the fight starts. */
  first: 1.5,
} as const;

export const VENT = {
  seconds: 8,
  /** Damage taken while vented (the plating hangs open). */
  damageScale: 1.5,
} as const;

export const VALVES = {
  interactRadius: 2.2,
  /** A dark (not live) valve springs back after this. */
  dudSeconds: 2,
  /** The struck wheel's hurtbox: a capsule round the wheel, at this height. */
  hurtRadius: 0.7,
  hurtHeight: 1.15,
} as const;

export const PRESENTATION = {
  introSeconds: 3.5,
  introCueAt: 0.6,
  retrySeconds: 1.2,
  deathSeconds: 3,
} as const;

/** Look: KayKit-palette colours (plans/act4-L6.md section 5). */
export const LOOK = {
  iron: 0x3a3634,
  ironDark: 0x24201e,
  copper: 0x9a5a34,
  brass: 0xb08a3c,
  glow: 0xff7a22,
  glowHot: 0xffb04a,
  valveLive: 0xff8a2a,
  valveDark: 0x4a4440,
  veil: 0x2a1408,
  ring: 0xff5a1a,
  steam: 0xe8e2da,
  coal: 0x1a1412,
} as const;

/** His level: 31, capped at the player's level + 3 (Q1). */
export function bellowsLevel(playerLevel: number | undefined): number {
  return act4BossLevel(BELLOWS.level, playerLevel);
}

/** Health and damage scale for a level: 1 at 31, 5 % a level either way, never below 0.5. */
export function bellowsScale(level: number): number {
  const l = Number.isFinite(level) ? level : BELLOWS.level;
  return Math.max(0.5, 1 + BELLOWS.perLevel * (l - BELLOWS.level));
}

/** The structure-break part id of valve `n` (1-based). */
export const valvePartId = (n: number): string => `${BELLOWS_BOSS_ID}.valve.${n}`;
