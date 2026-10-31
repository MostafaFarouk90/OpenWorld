// Hunt-Marshal Corvin Skarl's numbers (plans/act3-K8-pr2.md). The design gives the crossbow bolts (block them), the drake's dive
// with a 1.0 s circling shadow, the chain forced break, the Spare at the last break with a 6 s window, level 27 under the summit
// cap, about 2,000 health and 650 kill XP (design 10 row 22); everything else is a reading for K16's pacing pass.
import { BOSS_MERCY } from '../../enemies/tuning';

export const SKARL_BOSS_ID = 'corvin-skarl';
export const SKARL_KIND = 'corvin-skarl';
export const SKARL_NAME_KEY = 'boss.corvin-skarl.name';
/** The mercy verb comes from the one table, so the registry def and the hold cannot drift apart. */
export const SKARL_MERCY_VERB = BOSS_MERCY[SKARL_BOSS_ID]?.verb === 'spare' ? 'spare' : 'release';

/** K13's flag: D06 is accepted (the keep door opens; the fight arms). */
export const D06_STARTED_FLAG = 'story.d06.started';

/** K4 PR 2's Aerie courtyard (src/dragonspine/aerie.ts): outdoors, no gate. */
export const ARENA = {
  centre: 'dragonspine.aerie.arena.centre',
  skarl: 'dragonspine.aerie.arena.skarl',
  drake: 'dragonspine.aerie.arena.drake',
  post: 'dragonspine.aerie.chain-post',
  edges: [1, 2, 3, 4].map((n) => `dragonspine.aerie.arena.edge.${n}`) as readonly string[],
  /** The fight starts when the player comes this close to the centre. */
  startRadius: 20,
  /** Skarl stays within this of the centre. */
  leash: 20,
  /** Out of this ring for `outsideSeconds` (and not held by his kick's shove) the fight ends as a death does. */
  ring: 34,
  outsideSeconds: 3,
  /** A start needs the player at about the courtyard's height (the plateau, not a glide passing over). */
  startHeight: 8,
} as const;

/** The drake spawner K8 registers on `ARENA.drake` (manual, never respawns, never saved). */
export const DRAKE_SPAWNER = 'dragonspine.aerie.skarl-drake';

export const SKARL = {
  /** The summit band's top; capped at the player's level + 3 (Q9). */
  level: 27,
  capAbovePlayer: 3,
  /** Health and his damage scale this much per level away from 27 (a reading, as Murkjaw's). */
  perLevel: 0.05,
  maxHealth: 2000,
  maxPoise: 120,
  /** Seconds without a landed hit before his poise refills (design 9.6). */
  poiseRegenDelay: 4,
  phases: [0.66, 0.33] as readonly number[],
  breaksPerPhase: 1,
  releaseWindowSeconds: 6,
  healthFloor: 0.08,
  floorModifierOrder: 99,
  brokenModifierOrder: 97,
  /** Staggered and kneeling after a break: damage and poise on him x this. */
  brokenScale: 1.25,
  breakSeconds: 3,
  /** He strafes to keep this band from the player. */
  nearBand: 10,
  farBand: 18,
  strafeSpeed: 3,
  turnRate: 5,
  /** The player inside this for `closeKickSeconds` is kicked; entering it starts a backstep (once per `backstepCooldown`). */
  closeRange: 4,
  closeKickSeconds: 1.5,
  backstepMetres: 6,
  backstepSeconds: 0.6,
  backstepCooldown: 3,
  /** He never stands within this of the line from the player to the chain post for longer than one bolt cycle. */
  postLaneClear: 3,
} as const;

/** The bolt: aimed for `aimSeconds` (yellow, block it), loosed at the player's position, `speed` m/s. */
export const BOLT = {
  attackId: 'corvin-skarl.bolt',
  telegraph: 'block' as const,
  aimSeconds: 0.8,
  damage: 24,
  poise: 20,
  speed: 40,
  range: 45,
  /** Phase 2: two bolts this far apart; phase 3: three at once in a fan of +-`fanDegrees`. */
  burstGap: 0.5,
  fanDegrees: 8,
  reloadSeconds: 1.4,
  /** Hit test: the player's capsule radius plus this. */
  radius: 0.15,
  height: 1.3,
} as const;

export const KICK = {
  attackId: 'corvin-skarl.kick',
  telegraph: 'block' as const,
  windup: 0.5,
  damage: 14,
  poise: 30,
  reach: 2.2,
  /** The shove: this far over this long, through combat verbs' forced move, clamped inside the ring. */
  shoveMetres: 3,
  shoveSeconds: 0.35,
  recover: 0.5,
} as const;

/** The chain post's release lever (F): jerks the chain; a forced break; then waits. */
export const LEVER = {
  cooldown: 20,
  radius: 2.2,
} as const;

/** Striking the chain (F) at its low point while the drake is landed. */
export const CHAIN = {
  radius: 3,
  /** The drake stays down this long after it lands (K6a's landing). */
  landedSeconds: 2.5,
} as const;

export const PRESENTATION = {
  introSeconds: 3,
  introHornAt: 0.8,
  retrySeconds: 1.2,
  spareKneelSeconds: 3,
  spareFadeSeconds: 1.5,
  deathClipSeconds: 2,
  deathFadeSeconds: 1.5,
} as const;

/** Favour K8 pays on the fight's own outcome (the Oswin +3 of a Spare is the `BOSS_MERCY` row's). */
export const FAVOUR = { sparedDragons: -2, defeatedDragons: 2 } as const;

export const LOOK = {
  scale: 1.2,
  cloak: 0xa01e1e,
  flash: 0xff4a2a,
  bolt: 0x5a4632,
  fletch: 0xc02020,
} as const;

export const SFX = {
  horn: 'sfx.skarl.horn',
  loose: 'sfx.skarl.loose',
  kick: 'sfx.skarl.kick',
  lever: 'sfx.skarl.lever',
  chain: 'sfx.skarl.chain',
} as const;

export const SKARL_LEVER_ID = 'lever:skarl-chain';
export const SKARL_CHAIN_ID = 'chain:skarl-drake';

/** His level: the summit band's 27, capped at the player's level + 3. */
export function skarlLevel(playerLevel: number | undefined): number {
  const p = typeof playerLevel === 'number' && Number.isFinite(playerLevel) && playerLevel >= 1 ? Math.floor(playerLevel) : undefined;
  return p === undefined ? SKARL.level : Math.max(1, Math.min(SKARL.level, p + SKARL.capAbovePlayer));
}

/** Health and damage scale for a level: 1 at 27, 5 % a level either way, never below 0.5. */
export function skarlScale(level: number): number {
  const l = Number.isFinite(level) ? level : SKARL.level;
  return Math.max(0.5, 1 + SKARL.perLevel * (l - SKARL.level));
}
