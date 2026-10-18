/** The player's heavy attack (attack 3, a chop); its `attackId` is the clip name (DamageBridge, `attackOf`). */
export const HEAVY_CHOP_CLIP = '1H_Melee_Attack_Chop';
/** Every class's heavy chop (attack 3): the Knight's one-handed chop and the Warden's two-handed one. */
export const HEAVY_CHOP_CLIPS: ReadonlySet<string> = new Set([HEAVY_CHOP_CLIP, '2H_Melee_Attack_Chop']);

/** Poise at which a request counts as heavy even without the chop's attack id (rim bash, scripted hits). */
export const HEAVY_POISE = 30;

/**
 * Is this a heavy blow? Player melee poise is the hit damage (at most 20 with bone multipliers), so the poise
 * alone never reaches `HEAVY_POISE` from a real swing; the chop is recognised by its attack id. Pass the
 * request's poise from before any scaling.
 */
export function isHeavyBlow(req: { attackId?: string; poise?: number }): boolean {
  return (req.attackId !== undefined && HEAVY_CHOP_CLIPS.has(req.attackId)) || (req.poise ?? 0) >= HEAVY_POISE;
}
