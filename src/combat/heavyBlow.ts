/** The player's heavy attack (attack 3, a chop); its `attackId` is the clip name (DamageBridge, `attackOf`). */
export const HEAVY_CHOP_CLIP = '1H_Melee_Attack_Chop';
const heavyClips = new Set<string>([HEAVY_CHOP_CLIP]);
/** Every registered heavy chop clip (attack 3 of a class); the Knight's is built in, a class registers its own. Live view. */
export const HEAVY_CHOP_CLIPS: ReadonlySet<string> = heavyClips;

/** A class registers the clip of its heavy attack so guards break and the heavy feedback plays. Returns the remover. */
export function registerHeavyClip(clip: string): () => void {
  if (typeof clip !== 'string' || clip.length === 0 || heavyClips.has(clip)) return () => undefined;
  heavyClips.add(clip);
  return () => void heavyClips.delete(clip);
}

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
