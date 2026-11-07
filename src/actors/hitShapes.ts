// Projectile hit cylinders for actors much wider than a person (src/spells/Projectile.ts tests every other actor against
// ACTOR_HIT, 0.5 m by 1.8 m at its root). A bolt or a spell must strike such an actor where its body is, not only within half a
// metre of its centre: the Bellows-Engine stands on a 3 m turntable behind a static collider that would end a bolt long before
// it reached the centre (Act 4 L6, the "every class can finish" principle). Keyed by actor kind; a kind not listed keeps ACTOR_HIT.
export interface HitCylinder {
  readonly radius: number;
  readonly height: number;
}

export const PROJECTILE_HIT_SHAPES: ReadonlyMap<string, HitCylinder> = new Map([
  // The cradle hurtbox's rim (3.0 m, src/bosses/act4/bellowsEngine/BellowsModel.ts) and the stacks' height.
  ['bellows-engine', { radius: 3.0, height: 5.0 }],
  // L6 PR 2: the Last Gong's disc is 0.85 m round, hung 1.6 m up its frame; Eormen is a Rogue_Hooded at 1.4 hovering 0.25 m
  // (about 2.6 m to the crown), taller than the person-sized cylinder.
  ['eormen-gong', { radius: 1.0, height: 2.6 }],
  ['eormen', { radius: 0.6, height: 2.6 }],
]);

/** The projectile hit cylinder for `kind`, or null for the default person-sized one. */
export function projectileHitShape(kind: string): HitCylinder | null {
  return PROJECTILE_HIT_SHAPES.get(kind) ?? null;
}
