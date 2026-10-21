import { ENEMY_ATTACKS } from './clips';
import { ALLEY_CUTPURSE } from './cutpurse/def';
import { GUILDHALL_THUG } from './guildhall/def';
import { SLAG_CRAWLER } from './crawler/def';
import { KINDLING_FOX } from './fox/def';
import { CINDER_GOLEM } from './golem/def';
import { HUNTER_HARPOONER, HUNTER_SPEARMAN } from './hunters/def';
import { EMBER_HOUND } from './hound/def';
import { EMBER_WYRM_DEF, WYRMLING_DEF } from './wyrm/defs';
import type { EnemyDef, EnemyKind, MoveDef } from './types';

/**
 * Ash Wraith, design section 10 row 1: shambles, groups of 3 to 5, claw swipe and ash-grab, a 0.5 s
 * arm-raise telegraph, poise 20, Release mercy for the Ashwalkers. The wide red sweep is the T10
 * dodge drill (weight 0: chosen only through a spawn's move filter).
 */
export const ASH_WRAITH: EnemyDef = {
  kind: 'ash-wraith',
  nameKey: 'enemies.name.ash-wraith',
  // The Mage body (robed, pointed hat), ash-pale with a sickly green glow: nothing like the player's Knight.
  model: { prefer: ['mage'], tint: 0xbcc8c0, emissive: 0x1f4d2c, weapons: 'none' },
  maxHealth: 30,
  maxPoise: 20,
  walkSpeed: 1.0,
  chaseSpeed: 1.6,
  moves: [
    move('wraith.claw', ENEMY_ATTACKS.wraithClaw, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 12, poise: 10,
      range: [0, 1.0], cooldown: 1.2, recover: 0.9, weight: 3,
    }),
    move('wraith.grab', ENEMY_ATTACKS.wraithGrab, {
      windup: 0.5, telegraph: 'block', weapon: 'right', damage: 8, poise: 5,
      range: [0, 0.9], cooldown: 4, recover: 0.9, weight: 1, onHit: 'slow',
    }),
    move('wraith.sweep', ENEMY_ATTACKS.wraithSweep, {
      windup: 0.7, telegraph: 'dodge', weapon: 'right', damage: 18, poise: 20,
      range: [0, 1.1], cooldown: 2, recover: 1.0, weight: 0,
    }),
  ],
  mercy: { verb: 'release', tier: 'normal', track: 'ashwalkers', when: 'staggered' },
  material: 'ash',
  rises: true,
};

/**
 * The Charred Footman (design 10 row 2), kept under the slice 1 kind id `blighted-soldier` so saves, XP and
 * quest filters keep working. Overhead chop with a 0.6 s raise, a short shield bash, poise 40, Spare mercy
 * for Halvard; since slice 2 it also raises its shield about half the time (a heavy chop breaks the guard,
 * back attacks ignore it) and advances beside its partner.
 */
export const BLIGHTED_SOLDIER: EnemyDef = {
  kind: 'blighted-soldier',
  nameKey: 'enemies.name.charred-footman',
  // Still the Knight rig (the embedded sword and shield drive the tracers), but charred red, broader, and bare-headed.
  model: { prefer: [], tint: 0x8a3c30, emissive: 0x2a0c04, weapons: 'sword-shield', hide: ['Knight_Helmet'] },
  maxHealth: 60,
  maxPoise: 40,
  walkSpeed: 1.4,
  chaseSpeed: 2.6,
  moves: [
    move('soldier.chop', ENEMY_ATTACKS.soldierChop, {
      windup: 0.6, telegraph: 'block', weapon: 'right', damage: 20, poise: 25,
      range: [0, 1.6], cooldown: 1.6, recover: 0.7, weight: 3,
    }),
    move('soldier.bash', ENEMY_ATTACKS.soldierBash, {
      windup: 0.6, telegraph: 'block', weapon: 'left', damage: 10, poise: 25,
      range: [0, 1.0], cooldown: 3, recover: 0.7, weight: 1,
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: 'halvard', when: 'yielding' },
  material: 'metal',
  rises: false,
  guard: true,
  pairAdvance: true,
};

/**
 * The Toll Sergeant (Act 1 density pass, quests thread; additive here): the Charred Footman's officer who holds the
 * Hollin Ford bridge in M04 once his four men are beaten. Same moves and the same rig, harder and heavier; bigger and
 * darker so he reads apart from his men; an elite Spare (Halvard +2 by the favour rules). He stands alone, so there is no pack to share it.
 */
export const TOLL_SERGEANT: EnemyDef = {
  kind: 'toll-sergeant',
  nameKey: 'enemies.name.toll-sergeant',
  model: { prefer: [], tint: 0x5a2420, emissive: 0x2a0c04, weapons: 'sword-shield', hide: ['Knight_Helmet'], scale: 1.12 },
  maxHealth: 110,
  maxPoise: 55,
  walkSpeed: 1.4,
  chaseSpeed: 2.6,
  moves: [
    move('soldier.chop', ENEMY_ATTACKS.soldierChop, {
      windup: 0.6, telegraph: 'block', weapon: 'right', damage: 24, poise: 30,
      range: [0, 1.6], cooldown: 1.4, recover: 0.7, weight: 3,
    }),
    move('soldier.bash', ENEMY_ATTACKS.soldierBash, {
      windup: 0.55, telegraph: 'block', weapon: 'left', damage: 12, poise: 30,
      range: [0, 1.0], cooldown: 2.6, recover: 0.7, weight: 1,
    }),
  ],
  mercy: { verb: 'spare', tier: 'elite', track: 'halvard', when: 'yielding' },
  material: 'metal',
  rises: false,
  guard: true,
};

/**
 * A Halvard yard veteran (Act 1 density pass, quests thread; additive here): Marshal Stane's sparring partner in R02.
 * The Footman's moves at sparring weight on a living man in Halvard blue: light blows, yields when beaten (Spare), and
 * a sparring yield pays no favour (codex only). He fights in the Practice Yard or the Bastion yard, never on the road.
 */
export const YARD_VETERAN: EnemyDef = {
  kind: 'yard-veteran',
  nameKey: 'enemies.name.yard-veteran',
  model: { prefer: [], tint: 0x4a5f86, weapons: 'sword-shield', hide: ['Knight_Helmet'] },
  maxHealth: 70,
  maxPoise: 40,
  walkSpeed: 1.4,
  chaseSpeed: 2.6,
  moves: [
    move('soldier.chop', ENEMY_ATTACKS.soldierChop, {
      windup: 0.65, telegraph: 'block', weapon: 'right', damage: 8, poise: 20,
      range: [0, 1.6], cooldown: 1.8, recover: 0.8, weight: 3,
    }),
    move('soldier.bash', ENEMY_ATTACKS.soldierBash, {
      windup: 0.6, telegraph: 'block', weapon: 'left', damage: 4, poise: 20,
      range: [0, 1.0], cooldown: 3, recover: 0.8, weight: 1,
    }),
  ],
  mercy: { verb: 'spare', tier: 'normal', track: null, when: 'yielding' },
  material: 'metal',
  rises: false,
  guard: true,
};

/**
 * Hrolf Ironbrow in his trial of strength (Act 2, thread A5; additive here, plans/act2-A5.md section 8): the Barbarian
 * with Hrolf's axe and look on the yard veteran's sparring weight, a little heavier. The trial service holds both sides
 * at 1 HP; no mercy and no XP row (a sparring bout pays nothing). M13 (A12) spawns him in the Stonefold ring.
 */
export const HROLF_TRIAL: EnemyDef = {
  kind: 'hrolf-trial',
  nameKey: 'enemies.name.hrolf-trial',
  model: { prefer: ['barbarian'], tint: 0x8a4b2a, weapons: 'none', show: ['1H_Axe'], hide: ['Barbarian_Round_Shield'], scale: 1.05 },
  maxHealth: 120,
  maxPoise: 45,
  walkSpeed: 1.4,
  chaseSpeed: 2.6,
  moves: [
    move('hrolf.chop', ENEMY_ATTACKS.soldierChop, {
      windup: 0.7, telegraph: 'block', weapon: 'right', damage: 9, poise: 24,
      range: [0, 1.7], cooldown: 1.9, recover: 0.8, weight: 3,
    }),
    move('hrolf.shove', ENEMY_ATTACKS.soldierBash, {
      windup: 0.6, telegraph: 'block', weapon: 'right', damage: 5, poise: 22,
      range: [0, 1.1], cooldown: 3, recover: 0.8, weight: 1,
    }),
  ],
  material: 'metal',
  rises: false,
  // No guard: his shield is hidden for the duel, so nothing may block Cael's blows with it.
};

/**
 * Watch Guard: an observer-only humanoid (Knight fallback model, tinted) for stealth sections. It sees the
 * player and raises `ai.spotted`; it has no moves, no mercy, never emits `ai.aggro`, never chases and is never
 * routed through the PathFollower. It is `neutral` and immortal: a hit takes its awareness to 1 (one `ai.spotted`)
 * and nothing else, so a caught reset never has a dead slot to save. It pays no XP.
 */
export const WATCH_GUARD: EnemyDef = {
  kind: 'watch-guard',
  nameKey: 'enemies.name.watch-guard',
  // City law: steel-blue Knight rig, a pot helm instead of the Knight's helmet, a tower shield and a long sword on show.
  model: {
    prefer: [],
    tint: 0x5f86c8,
    weapons: 'none',
    hide: ['Knight_Helmet'],
    show: ['Rectangle_Shield', '2H_Sword'],
    props: [{ id: 'hex/bucket_empty', bone: 'head', position: [0, 0.2, 0], rotation: [Math.PI, 0, 0], scale: 2.4 }],
  },
  maxHealth: 40,
  maxPoise: 30,
  walkSpeed: 1.4,
  chaseSpeed: 2.6,
  moves: [],
  material: 'metal',
  rises: false,
  observerOnly: true,
};

export const ENEMY_DEFS: Readonly<Record<EnemyKind, EnemyDef>> = {
  'ash-wraith': ASH_WRAITH,
  'blighted-soldier': BLIGHTED_SOLDIER,
  'alley-cutpurse': ALLEY_CUTPURSE,
  'ember-hound': EMBER_HOUND,
  'watch-guard': WATCH_GUARD,
  'guildhall-thug': GUILDHALL_THUG,
  'toll-sergeant': TOLL_SERGEANT,
  'yard-veteran': YARD_VETERAN,
  'hrolf-trial': HROLF_TRIAL,
  'ember-wyrm': EMBER_WYRM_DEF,
  wyrmling: WYRMLING_DEF,
  'slag-crawler': SLAG_CRAWLER,
  'cinder-golem': CINDER_GOLEM,
  'kindling-fox': KINDLING_FOX,
  'hunter-spearman': HUNTER_SPEARMAN,
  'hunter-harpooner': HUNTER_HARPOONER,
};

/**
 * Telegraph look per kind, for thread 7 (design 11.6): which part flashes and in what colour.
 * The `telegraph` event names only the actor; thread 7 maps `actor.kind` through this table.
 */
export const TELEGRAPH_STYLE: Readonly<Record<EnemyKind, { part: 'hand' | 'weapon' | 'tail' | 'mouth' | 'wing' | 'core' | 'maw'; color: number }>> = {
  'ash-wraith': { part: 'hand', color: 0x9fbf8f },
  'blighted-soldier': { part: 'weapon', color: 0xd04030 },
  'alley-cutpurse': { part: 'hand', color: 0xc8b070 },
  // Tail flare (design 11.6): the pounce is red, the bite's flash is the same tail.
  'ember-hound': { part: 'tail', color: 0xff5a1f },
  'watch-guard': { part: 'weapon', color: 0xd04030 },
  'guildhall-thug': { part: 'hand', color: 0xd04030 },
  'toll-sergeant': { part: 'weapon', color: 0xd04030 },
  'yard-veteran': { part: 'weapon', color: 0xd04030 },
  'hrolf-trial': { part: 'weapon', color: 0xd04030 },
  // The wyrms light their mouths (design 11.6: the spit's inhale glow; the dive's wing flash is drawn by the body).
  'ember-wyrm': { part: 'mouth', color: 0xff7a2a },
  wyrmling: { part: 'mouth', color: 0xffb040 },
  // A6b, design 11.6: core glow (golem), rear-up and drip (crawler), visor/weapon flash and the red net and harpoon lines (hunters).
  'cinder-golem': { part: 'core', color: 0xff6a20 },
  'slag-crawler': { part: 'maw', color: 0xff7a2a },
  'kindling-fox': { part: 'tail', color: 0xe8863a },
  'hunter-spearman': { part: 'weapon', color: 0xd04030 },
  'hunter-harpooner': { part: 'weapon', color: 0xd04030 },
};

function move(
  id: string,
  clip: { clip: string; activeStart: number; activeEnd: number },
  rest: Omit<MoveDef, 'id' | 'clip' | 'activeStart' | 'activeEnd'>,
): MoveDef {
  return { id, clip: clip.clip, activeStart: clip.activeStart, activeEnd: clip.activeEnd, ...rest };
}
