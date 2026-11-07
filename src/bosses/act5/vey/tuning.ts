// Morcant Vey, the Regent Reforged: his numbers (D09, Act 5 N6 PR 1; plans/act5-N6.md section 2). The design gives a duellist in
// forge-iron with dragon-heart power, fire-sword combos with a 0.5 s white blade glow before each hit, a shockwave with a 1.0 s
// ground ring, four poise bars broken by heavy chops, and the Spare at the last break. Plan 6.2 adds: three-hit combos with a
// parry window on the third, a dragon-heart surge at each break (a 6 m fire ring, then 3 s of faster combos), heavy hits double
// poise and light hits half, F7 Public's four household guards at the second break, level 38, about 3,400 health, kill XP 900.
// Everything else is a reading for the pacing test and N12's census (taste calls under "Act 5 N6" in design/changes-applied.md).
import { ACT5_BOSS_BASE_LEVEL, ACT5_BOSS_IDS, ACT5_BOSS_RULES } from '../../act5Bosses';
import { act5BossLevel } from '../../../enemies/level';
import { BLOCKERS, CALDERA_INTERIOR_FLAGS, FOUNDRY_ARENA, FOUNDRY_DESCENT_ID, INT_ANCHOR, INT_TRIGGER } from '../../../caldera/interiors/sites';

export const VEY_BOSS_ID = ACT5_BOSS_IDS.vey;
/** The actor kind (not `vey`: that is his NPC's id in Harrowmark). */
export const VEY_KIND = 'vey-reforged';
export const VEY_NAME_KEY = 'boss.vey.name';

/** N11 writes it as D09 starts (N2's Foundry door lock reads the same flag). */
export const D09_STARTED_FLAG = CALDERA_INTERIOR_FLAGS.foundryStarted;
/** F7 (Act 4 R23): `public` brings his sworn guard into the duel. */
export const F7_FLAG = 'story.r23.choice';

const P = `${INT_ANCHOR}.foundry`;

/** N2's Foundry Descent floor 3 (src/caldera/interiors/foundryDescent.ts), local metres from the door; rooms run +Z. */
export const ARENA = {
  interiorId: FOUNDRY_DESCENT_ID,
  trigger: `${INT_TRIGGER}.foundry.arena`,
  centre: `${P}.arena.vey`,
  /** N2's inside-the-gate anchor (local 0, 136): places the frame (interiors are placed by translation). */
  entry: `${P}.arena.entry`,
  entryLocal: { x: 0, z: 136 },
  /** N2's checkpoint at the arena mouth, outside the trigger: the reload rule and the gate's clearance measure from it. */
  mouth: `${P}.checkpoint.3`,
  crowd: [1, 2, 3, 4].map((n) => `${P}.arena.crowd.${n}`) as readonly string[],
  caches: [1, 2, 3, 4, 5, 6].map((n) => `${P}.arena.cache.${n}`) as readonly string[],
  lights: [1, 2].map((n) => `${P}.arena.light.${n}`) as readonly string[],
  gate: BLOCKERS.foundryArenaGate,
  /** The gate's arena side (local z) and the margin the player must be past it before it closes. */
  gateLocalZ: 132.25,
  gateMargin: 1,
  gateClearance: 3,
  /** The ring floor (local), 30 by 30 m; he keeps 1 m inside it. */
  rect: FOUNDRY_ARENA,
  inset: 1,
  /** The arena floor's height below the entry anchor's (both on floor 3: 0). */
  abandonSeconds: 3,
  veilWidth: 6.4,
  veilHeight: 6,
} as const;

export const VEY = {
  level: ACT5_BOSS_BASE_LEVEL[VEY_BOSS_ID],
  maxHealth: 3400,
  /** Health and damage scale this much per level away from 38, never below 0.5. */
  perLevel: 0.05,
  /** Low, because a real swing's raw poise is about 10 (x 2 heavy, x 0.5 light): three or four heavies or a parry break a bar. */
  maxPoise: 60,
  /** Poise refills after this long without a landed hit (design 9.6), outside a break and the window. */
  poiseRegenDelay: 5,
  phases: ACT5_BOSS_RULES[VEY_BOSS_ID].phases ?? [],
  breaksPerPhase: ACT5_BOSS_RULES[VEY_BOSS_ID].breaksPerPhase ?? 4,
  mercyVerb: 'spare' as const,
  /** Coordinator ruling B: 6 s (the shipped default is 4), so the choice reads. */
  releaseWindowSeconds: 6,
  /** Bar floors (health fractions): bar k holds health here until break k + 1; the last is the Spare window's floor. */
  floors: [0.75, 0.5, 0.25, 0.04] as readonly number[],
  /** Hits in this long after the window opens are held at 1 HP, not a strike (a volley or a spell tick already in flight). */
  strikeGrace: 0.4,
  /** A break counts only with his health within this share of max above the bar's floor. */
  floorMargin: 0.01,
  floorModifierOrder: 99,
  /** Poise x 2 heavy / x 0.5 light, after the attacker's own scaling and before the floor. */
  poiseModifierOrder: 40,
  walkSpeed: 3.6,
  turnRate: 5,
  /** He closes to this distance between moves. */
  preferredDistance: 2.4,
  bodyRadius: 0.7,
  /** The boss model's scale (a Knight rig at 1.15). */
  modelScale: 1.15,
} as const;

export interface VeyMoveDef {
  attackId: string;
  telegraph: 'block' | 'dodge';
  windup: number;
  damage: number;
  poise: number;
}

/** The fire-sword combo: three hits, each after the 0.5 s white glow; hits 1 and 2 cannot be parried, hit 3 can (the parry window). */
export const COMBO = {
  hits: [
    { attackId: 'vey.combo.1', telegraph: 'block', windup: 0.5, damage: 34, poise: 24 },
    { attackId: 'vey.combo.2', telegraph: 'block', windup: 0.5, damage: 34, poise: 24 },
    { attackId: 'vey.combo.3', telegraph: 'block', windup: 0.5, damage: 46, poise: 36 },
  ] as readonly VeyMoveDef[],
  /** Index of the parryable hit. */
  parryIndex: 2,
  reach: 3.2,
  halfArc: (60 * Math.PI) / 180,
  /** A combo starts inside this distance. */
  startRange: 3.4,
  /** Short pause after hits 1 and 2 (the glow of the next starts after it). */
  between: 0.15,
  recover: 1.1,
  /** A parried third hit leaves him open this long (the riposte). */
  parriedSeconds: 1.2,
} as const;

/** The shockwave: a 1.0 s ground ring under him, then a ring that grows to `radius` in `growSeconds`. Dodge through or stand clear. */
export const SHOCKWAVE = {
  attackId: 'vey.shockwave',
  telegraph: 'dodge' as const,
  windup: 1.0,
  radius: 9,
  growSeconds: 0.6,
  /** The ring's band (m) that hits. */
  band: 1.2,
  damage: 40,
  poise: 30,
  recover: 0.9,
  /** Every Nth attack is a shockwave; and when Cael stands off past `standOff` metres for `standOffSeconds`. */
  everyNth: 3,
  standOff: 6,
  standOffSeconds: 3,
} as const;

/** The dragon-heart surge at each break: a roar (invulnerable), a 1.0 s tell, a 6 m fire ring, then 3 s of faster combos. */
export const SURGE = {
  attackId: 'vey.surge',
  telegraph: 'dodge' as const,
  roarSeconds: 0.8,
  windup: 1.0,
  radius: 6,
  damage: 40,
  poise: 30,
  /** Seconds of faster combos after the burst; gaps and recovers scale by `fastScale`. */
  fastSeconds: 3,
  fastScale: 0.5,
} as const;

export const RHYTHM = {
  first: 1.2,
  /** Seconds between attacks. */
  gap: 1.0,
  /** A break staggers him this long before the surge. */
  breakSeconds: 1.2,
} as const;

/** F7 Public: four household guards from N2's crowd posts at the second break (two shields, two pikes: one breakable line). */
export const CROWD = {
  atBreak: 2,
  groups: ['caldera.vey.crowd.shield', 'caldera.vey.crowd.pike'] as readonly string[],
  line: 'caldera.vey.crowd',
} as const;

/** Bolt caches on N2's six crate props: a Pathfinder's pouch tops up to its cap; all restock at every break. */
export const BOLT_CACHES = {
  interactRadius: 2,
  /** The bolts' stackMax (src/inventory/items.ts). */
  fillTo: 40,
  /** The crate's top (N2's prop height). */
  top: 0.9,
  /** N2's cache anchor stands this far in front of its crate (yaw 0 faces -Z). */
  reach: 1.3,
} as const;

export const PRESENTATION = {
  introSeconds: 3.5,
  introCueAt: 1.2,
  retrySeconds: 1.2,
  spareKneelSeconds: 2.5,
  spareFadeSeconds: 1.5,
  deathClipSeconds: 1.4,
  deathFadeSeconds: 1.6,
} as const;

/** Look (procedural parts on the Knight rig; taste call). */
export const LOOK = {
  iron: 0x2a2624,
  gold: 0xc8a040,
  heart: 0xff5a1a,
  bladeHot: 0xff6a20,
  bladeWhite: 0xfff4e0,
  ring: 0xff4a10,
  shock: 0xffb060,
  soot: 0x1a1210,
} as const;

/** His level: 38, capped at the player's level + 3 (Q3). */
export function veyLevel(playerLevel: number | undefined): number {
  return act5BossLevel(VEY.level, playerLevel);
}

/** Health and damage scale for a level: 1 at 38, 5 % a level either way, never below 0.5. */
export function veyScale(level: number): number {
  const l = Number.isFinite(level) ? level : VEY.level;
  return Math.max(0.5, 1 + VEY.perLevel * (l - VEY.level));
}
