// The K12 staging rule, shared (v0.8 item 9): a scene can be staged (camera shots, animation) only with a camera rig and a
// player that takes move modifiers. False in a reduced boot, where shots and anims are no-ops.
export function canStage(ctx: { cameraRig?: unknown; player?: { addMoveModifier?: unknown } | null }): boolean {
  return !!ctx.cameraRig && typeof ctx.player?.addMoveModifier === 'function';
}
