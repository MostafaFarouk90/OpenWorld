// R20's force reader (Act 4, L2; plans/act4-L2.md section 7): two of Vey's checkpoint huts in the farm-ring outside the River
// Gate. From `story.gate.a4` they stand (a hut and a barrier pole); once `story.r20.choice` is `force` they are burned shells
// (two low blackened walls, a soot ring and a smouldering patch). Derived through ctx.gates on both flags.
import * as THREE from 'three';
import type { CoreContext } from '../../region/coreTypes';
import type { StructureSpec } from '../../region/layoutTypes';
import { buildCity, type BuildDeps } from '../cityBuild';
import { A4_FLAG, R20_HUTS } from './sites';

export const R20_CHOICE_FLAG = 'story.r20.choice';
export type HutLook = 'none' | 'standing' | 'burned';

/** What the huts show for a state: nothing before Act 4, standing, or burned once R20 went by force. */
export function hutLook(gateA4: boolean, choice: unknown): HutLook {
  if (!gateA4) return 'none';
  return choice === 'force' ? 'burned' : 'standing';
}

const round = (n: number) => Math.round(n * 100) / 100;

export function hutStructures(look: HutLook): StructureSpec[] {
  if (look === 'none') return [];
  return R20_HUTS.flatMap((h, i): StructureSpec[] => {
    const x = round(h.x);
    const z = round(h.z);
    const id = `a4hut.${i + 1}`;
    if (look === 'standing') {
      return [
        { id: `${id}.hut`, kind: 'house', x, z, yawDeg: 0, footprint: [4, 4], mode: 'solid', height: 3 },
        { id: `${id}.barrier`, kind: 'pole', x: round(x + 4), z, yawDeg: 0, footprint: [0.3, 0.3], mode: 'open', height: 1.2 },
      ];
    }
    return [
      { id: `${id}.wall-n`, kind: 'wall', x, z: round(z + 1.8), yawDeg: 0, footprint: [4, 0.4], mode: 'solid', height: 1.4 },
      { id: `${id}.wall-w`, kind: 'wall', x: round(x - 1.8), z, yawDeg: 90, footprint: [3.2, 0.4], mode: 'solid', height: 0.9 },
    ];
  });
}

const SOOT = new THREE.MeshBasicMaterial({ color: 0x120e0c, transparent: true, opacity: 0.7, depthWrite: false });
const EMBER = new THREE.MeshBasicMaterial({ color: 0xc8401a });

export interface R20Huts {
  look(): HutLook;
  dispose(): void;
}

export function buildR20Huts(ctx: Pick<CoreContext, 'scene' | 'gates' | 'physics' | 'state'>, rapier: BuildDeps['rapier'] | null, heightAt: (x: number, z: number) => number): R20Huts {
  let current: HutLook = 'none';
  let city: ReturnType<typeof buildCity> | null = null;
  const root = new THREE.Group();
  root.name = 'harrowmark-r20-huts';
  const geos: THREE.BufferGeometry[] = [];
  const clear = () => {
    city?.dispose();
    city = null;
    root.removeFromParent();
    root.clear();
    for (const g of geos.splice(0)) g.dispose();
  };
  const apply = (look: HutLook) => {
    if (look === current) return;
    clear();
    current = look;
    if (look === 'none') return;
    if (rapier) city = buildCity({ scene: ctx.scene, physics: ctx.physics, rapier }, hutStructures(look), heightAt);
    if (look === 'burned') {
      const ringGeo = new THREE.CircleGeometry(3.4, 14);
      const patchGeo = new THREE.CircleGeometry(0.6, 8);
      geos.push(ringGeo, patchGeo);
      for (const h of R20_HUTS) {
        const y = heightAt(h.x, h.z);
        const ring = new THREE.Mesh(ringGeo, SOOT);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(h.x, y + 0.03, h.z);
        const patch = new THREE.Mesh(patchGeo, EMBER);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(h.x + 0.5, y + 0.05, h.z - 0.4);
        root.add(ring, patch);
      }
      ctx.scene.add(root);
    }
  };
  const off = ctx.gates.watch(
    (s) => s.getFlag(A4_FLAG) === true,
    () => apply(hutLook(ctx.state.getFlag(A4_FLAG) === true, ctx.state.getFlag(R20_CHOICE_FLAG))),
    { keys: [A4_FLAG, R20_CHOICE_FLAG] },
  );
  // The watch above only fires on its own result changing; the choice flipping while Act 4 holds needs its own.
  const off2 = ctx.gates.watch(
    (s) => s.getFlag(R20_CHOICE_FLAG) === 'force',
    () => apply(hutLook(ctx.state.getFlag(A4_FLAG) === true, ctx.state.getFlag(R20_CHOICE_FLAG))),
    { keys: [A4_FLAG, R20_CHOICE_FLAG] },
  );
  return {
    look: () => current,
    dispose() {
      off();
      off2();
      clear();
      current = 'none';
    },
  };
}
