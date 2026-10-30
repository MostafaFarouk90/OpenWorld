// M23's plank bridges (revision 2 item 7): four interactables, one each side of each causeway gap. Using either side lowers
// that bridge; the prompt hides once its flag is set, so a second use cannot happen. Lowering before M23 starts is allowed
// (the gap can be waded anyway). The deck itself is a toggle on the same flag (toggles.ts), re-derived on `save.loaded`.
import type * as THREE from 'three';
import type { CoreContext } from '../region/coreTypes';
import { bridgeFlag } from './flags';
import { BRIDGE_WIDTH, BRIDGES } from './places';

export const BRIDGE_PROMPT = 'greyfen.bridge.lower';
export const BRIDGE_STRINGS_EN: Record<string, string> = { [BRIDGE_PROMPT]: '{key} Lower the plank bridge' };

/** The four interactable ids, near and far side of each bridge. */
export const BRIDGE_USES = ([1, 2] as const).flatMap((n) => [
  { id: `use:greyfen-bridge-${n}-near`, n, anchor: `greyfen.m23.bridge.${n}` },
  { id: `use:greyfen-bridge-${n}-far`, n, anchor: `greyfen.m23.bridge.${n}.far` },
]);

/** Whether (x, z) is over bridge `n`'s deck footprint (with half a metre round it). */
export function inBridgeSpan(n: 1 | 2, x: number, z: number): boolean {
  const b = BRIDGES[n - 1]!;
  const dx = x - b.centre.x;
  const dz = z - b.centre.z;
  const along = dx * b.centre.dirX + dz * b.centre.dirZ;
  const across = -dx * b.centre.dirZ + dz * b.centre.dirX;
  return Math.abs(along) <= b.length / 2 + 0.5 && Math.abs(across) <= BRIDGE_WIDTH / 2 + 0.5;
}

export function registerBridges(ctx: Pick<CoreContext, 'interaction' | 'anchors' | 'state' | 'player'>): () => void {
  const offs = BRIDGE_USES.map((u) => {
    const anchor = ctx.anchors.find(u.anchor);
    if (!anchor) throw new Error(`greyfen: bridge anchor "${u.anchor}" is missing`);
    const flag = bridgeFlag(u.n);
    return ctx.interaction.register({
      id: u.id,
      kind: 'use',
      position: (out: THREE.Vector3) => out.set(anchor.position.x, anchor.position.y + 1, anchor.position.z),
      radius: 2.5,
      coneDegrees: 360,
      promptKey: BRIDGE_PROMPT,
      // Not while the player wades in the gap: the deck's collider would appear round them.
      enabled: () => !ctx.state.getBool(flag) && !inBridgeSpan(u.n, ctx.player.feet.x, ctx.player.feet.z),
      onInteract: () => {
        if (!ctx.state.getBool(flag) && !inBridgeSpan(u.n, ctx.player.feet.x, ctx.player.feet.z)) ctx.state.setFlag(flag, true);
      },
    });
  });
  return () => offs.forEach((off) => off());
}
