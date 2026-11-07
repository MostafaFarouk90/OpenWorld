// Heavy and light poise for the Act 5 bosses (plan 6.2: "heavy hits (heavy chops, a Warden's slam, a charged bolt, a Pyre spell) do
// double poise; light hits half, so every class has a way in"). One table, so a class's route is retuned in one line. A heavy is
// any shipped heavy blow (`isHeavyBlow`: every class's registered heavy clip, or poise of 30 and up) or one of the named ability
// ids below. Only hits from Cael are scaled; a companion's chop is left as it is.
import { ASHBLADE_ATTACK_SET } from '../../../classes/ashblade/attackSet';
import { WARDEN_ATTACK_SET } from '../../../classes/warden/attackSet';
import { isHeavyBlow } from '../../../combat/heavyBlow';
import { KNIGHT_ATTACK_SET } from '../../../player/attackSets';

/** Ability and spell ids that count as heavy (the plan's per-class routes). */
export const HEAVY_ATTACK_IDS: ReadonlySet<string> = new Set([
  // The melee classes' heavy clips (attack 3), so the rule holds even before a class plugin has registered its clip.
  ...[KNIGHT_ATTACK_SET, WARDEN_ATTACK_SET, ASHBLADE_ATTACK_SET].map((s) => s.attacks[s.heavyIndex]!.clip),
  // Pathfinder: the rapid volley (its heavy, attack 3), the aimed shot and the area shot.
  'pathfinder.bolt.3',
  'pathfinder.bolt.2',
  'pathfinder.bolt.4',
  'pathfinder.bolt.4.blast',
  'pathfinder.dragonbane',
  // Warden: the slams.
  'warden.skullsplitter',
  'warden.wyrmbreaker',
  'warden.earthroot',
  // Emberwright: the flame ball (its heavy, attack 3) and the Pyre spells.
  'emberwright.flameBall',
  'emberwright.updraft',
  'emberwright.sunfireNova',
  'emberwright.colossus',
  'emberwright.cinderRain',
  // Anyone: the Heartshard's Surge.
  'heartshard-surge',
]);

export const HEAVY_POISE_SCALE = 2;
export const LIGHT_POISE_SCALE = 0.5;

/** The request is a heavy hit (pass the poise from before any scaling). */
export function isBossHeavy(req: { attackId?: string; poise?: number }): boolean {
  return isHeavyBlow(req) || (req.attackId !== undefined && HEAVY_ATTACK_IDS.has(req.attackId));
}

/** The poise multiplier for a hit: x 2 heavy, x 0.5 light. */
export function bossPoiseScale(req: { attackId?: string; poise?: number }): number {
  return isBossHeavy(req) ? HEAVY_POISE_SCALE : LIGHT_POISE_SCALE;
}
