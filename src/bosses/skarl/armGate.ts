// An optional second arming condition for Skarl's fight (K13 PR 2, an additive edit to K8's director). Default off: the fight arms on
// `story.d06.started` alone, as before. D06's director configures one flag (`story.d06.courtyardClear`) so that the eight hunters and
// four harpooners round the courtyard are down before Skarl steps out; it clears the setting when the quest block stops.
let armFlag: string | null = null;

/** Requires `flag` (a boolean story flag) as well as `story.d06.started` before the fight may begin; null removes the condition. Returns the undo. */
export function setSkarlArmFlag(flag: string | null): () => void {
  armFlag = flag;
  return () => { if (armFlag === flag) armFlag = null; };
}

export function skarlArmFlag(): string | null {
  return armFlag;
}
