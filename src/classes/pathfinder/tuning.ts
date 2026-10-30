import type { AttackClipDef } from '../../characters/knightClips';

/** Pathfinder numbers (design 9.5, 9.6, 9.7). The design gives no trap, mark or hawk numbers: those are this thread's picks. */
export const PF = {
  classId: 'pathfinder',
  ammoItem: 'crossbow-bolts',
  /** Act 3: a master bolt is spent before a plain one and the shot it leaves hits 10% harder. */
  masterAmmoItem: 'master-bolts',
  masterBoltScale: 1.1,
  /** Design 9 stat row: ranged 14 against the Knight's melee 10 (`COMBAT.baseDamage`). */
  baseDamage: 14,
  bolt: { speed: 55, radius: 0.12, range: 38, tracerSeconds: 0.12 },
  /** A dry shot (no bolts) is a stock-butt strike by the crossbow itself, at this share of the damage the swing would do. */
  dryScale: 0.4,
  pierce: { extra: 1, secondScale: 0.7 },
  /** Steady Shot: hold attack 1 until the release for +25% damage (design 9.5 and the node rule 9.6). */
  steadyShotScale: 1.25,
  blast: { radius: 3, scale: 0.6 },
  rapidSpreadDegrees: 3,
  tripwire: { lifetime: 12, cooldown: 8, cap: 2, radius: 1.2, poise: 40 },
  cinderTrap: { lifetime: 20, cap: 3, radius: 1.2, blast: 3, damage: 20, poise: 30, igniteDps: 4, igniteSeconds: 3, placeDistance: 2, cooldown: 20, ember: 15 },
  falconEye: { radius: 25, seconds: 12, weakPoise: 10, cooldown: 30, ember: 15 },
  /** Tier 3 (Act 2): Ember Quarrel ignite, Net Launcher root and aim, Light Step air jump (picks of this thread). */
  emberQuarrel: { statusId: 'pathfinder.emberQuarrel.ignite', dps: 3, seconds: 3 },
  netLauncher: { statusId: 'pathfinder.netLauncher.root', seconds: 4, range: 18, aimRadius: 1.5, chestHeight: 1.1, cooldown: 16, ember: 15 },
  /** The air jump reaches 70% of a ground jump; height scales with the launch speed squared, so the speed is its square root. */
  lightStep: { airJumps: 1, heightScale: 0.7 },
  /** Tier 4 (Act 3, K11 PR 2): Triple Shot, Caltrop Field, Sure Foot (picks of this thread; the design gives the shapes only). */
  tripleShot: { yawDeg: 7.5, sideScale: 0.6, effectId: 'triple-shot' },
  caltropField: {
    cooldown: 18,
    ember: 15,
    radius: 4,
    ahead: 3,
    seconds: 10,
    tickSeconds: 0.5,
    /** Slow strength and how long each application lasts, so the slow lapses a second after a foe leaves. Bosses take the lesser one. */
    slow: 0.5,
    bossSlow: 0.25,
    slowSeconds: 1,
    halfHeight: 3,
    statusId: 'pathfinder.caltropField.slow',
    effectId: 'caltrop-field',
  },
  sureFoot: { filterId: 'pathfinder.sureFoot', effectId: 'sure-foot' },
  surge: { range: 30, speed: 45, chainRadius: 8, chainArcs: 3, chainScale: 0.7, pierce: 2, radius: 0.2 },
  skillIds: {
    steadyShot: 'pathfinder.steadyShot',
    piercingBolt: 'pathfinder.piercingBolt',
    tripwire: 'pathfinder.tripwire',
    cinderTrap: 'pathfinder.cinderTrap',
    trailblaze: 'pathfinder.trailblaze',
    falconEye: 'pathfinder.falconEye',
    emberQuarrel: 'pathfinder.emberQuarrel',
    netLauncher: 'pathfinder.netLauncher',
    lightStep: 'pathfinder.lightStep',
    tripleShot: 'pathfinder.tripleShot',
    caltropField: 'pathfinder.caltropField',
    sureFoot: 'pathfinder.sureFoot',
  },
  trailblazeScale: 1.1,
} as const;

/** One shot type: the release phases (normalised clip time), how many bolts each spends and what each does. */
export interface ShotSpec {
  /** Normalised times at which a bolt leaves (measured on the 60 Hz clips, see plans/slice-2-class-pathfinder.md section 1). */
  releases: readonly number[];
  /** Multiplies `PF.baseDamage`. */
  damage: number;
  /** Poise per bolt (design 9.6: 10, 10, 30 and 15 per attack; the rapid shot splits its 30 over three bolts). */
  poise: number;
  /** Area shot: bolts burst on impact (terrain too) in `PF.blast.radius`. */
  blast?: true;
  /** Aimed shot: no spread and the steady aim bonus is built in. */
  aimed?: true;
}

export const SHOTS: readonly ShotSpec[] = [
  { releases: [0.65], damage: 1, poise: 10 },
  { releases: [0.5], damage: 1.5, poise: 10, aimed: true },
  { releases: [0.12, 0.37, 0.62], damage: 0.6, poise: 10 },
  { releases: [0.78], damage: 0.8, poise: 15, blast: true },
];

/**
 * The four crossbow shots, on clips that exist in Rogue_Hooded.glb (a test reads them from the file). The window spans the
 * releases; the weapon tracer still runs through it, and `Crossbow` cancels its melee hits unless the shot is dry.
 */
export const PATHFINDER_ATTACKS: readonly AttackClipDef[] = [
  { clip: '2H_Ranged_Shoot', activeStart: 0.62, activeEnd: 0.72, noTrace: true },
  { clip: '2H_Ranged_Aiming', activeStart: 0.46, activeEnd: 0.56, noTrace: true },
  { clip: '2H_Ranged_Shooting', activeStart: 0.1, activeEnd: 0.66, noTrace: true },
  { clip: '1H_Ranged_Shoot', activeStart: 0.74, activeEnd: 0.84, noTrace: true },
];
/** The rapid shot is the heavy one (it spends the heavy-attack stamina; its poise is 30 in all). */
export const PATHFINDER_HEAVY_INDEX = 2;
