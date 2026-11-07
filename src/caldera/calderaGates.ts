// Act 5 thread N1 PR 1 (plans/act5-N1.md section 3): the Rim Gate's leaf and the Inner Gate's portcullis, drawn from
// flags. Both are visual: the fog faces (`fog.caldera-rim.s`, `fog.caldera.inner`) and the floor hole do the holding, so a
// leaf can never disagree with containment. State is derived through `ctx.gates`, so a load re-derives it: a flag that
// lands live swings the leaf (or lifts the portcullis) over GATE_MOVE_SECONDS; a load or the first frame just sets it.
import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import { flagConditionHolds, conditionKeys, type FlagCondition } from '../core/flagCondition';
import { RIM_GATE_OPEN_WHEN } from '../region/act5Fog';
import { INNER_GATE_OPEN_WHEN } from '../region/act5Containment';
import { INNER_GATE, RIM_GATE_SITE, type XZ } from './calderaSites';
import type { GateCause } from '../state/FlagGates';

export const GATE_MOVE_SECONDS = 0.8;
export const CALDERA_GATES_SYSTEM_ID = 'caldera.gates';

/** Open fraction 0 (shut) to 1 (open), moving toward `target` at 1 / GATE_MOVE_SECONDS a second. Pure. */
export function stepGate(open: number, target: 0 | 1, dt: number): number {
  const step = dt / GATE_MOVE_SECONDS;
  if (!(step > 0)) return open;
  return target > open ? Math.min(1, open + step) : Math.max(0, open - step);
}

/** A gate's moving part: its open fraction, its target and how a flag change moves it (a load snaps). */
export class GateState {
  open = 0;
  target: 0 | 1 = 0;
  set(isOpen: boolean, cause: GateCause): void {
    this.target = isOpen ? 1 : 0;
    if (cause !== 'flag') this.open = this.target;
  }
  tick(dt: number): number {
    this.open = stepGate(this.open, this.target, dt);
    return this.open;
  }
}

export interface CalderaGateDef {
  id: 'rim-gate' | 'inner-gate';
  when: FlagCondition;
  at: XZ;
  halfWidth: number;
  height: number;
  /** 'swing': two leaves turn inward (north) about the towers; 'lift': a portcullis rises. */
  motion: 'swing' | 'lift';
}

export const CALDERA_GATES: readonly CalderaGateDef[] = [
  { id: 'rim-gate', when: RIM_GATE_OPEN_WHEN, at: RIM_GATE_SITE.leaf, halfWidth: RIM_GATE_SITE.leafHalfWidth, height: 9, motion: 'swing' },
  { id: 'inner-gate', when: INNER_GATE_OPEN_WHEN, at: INNER_GATE.face, halfWidth: 7, height: 7, motion: 'lift' },
];

const BRONZE = 0x6b4a2a;

export function installCalderaGates(
  ctx: Pick<GameContext, 'scene' | 'state' | 'gates' | 'systems'>,
  heightAt: (x: number, z: number) => number,
  defs: readonly CalderaGateDef[] = CALDERA_GATES,
): { dispose(): void; state(id: CalderaGateDef['id']): GateState | undefined } {
  const material = new THREE.MeshStandardMaterial({ color: BRONZE, roughness: 0.7, metalness: 0.4 });
  const states = new Map<CalderaGateDef['id'], GateState>();
  const offs: Array<() => void> = [];
  const parts: { def: CalderaGateDef; gate: GateState; pivots: THREE.Object3D[]; lift: THREE.Object3D | null; baseY: number }[] = [];
  for (const def of defs) {
    const y = heightAt(def.at[0], def.at[1]);
    const gate = new GateState();
    states.set(def.id, gate);
    const pivots: THREE.Object3D[] = [];
    let lift: THREE.Object3D | null = null;
    if (def.motion === 'swing') {
      for (const side of [-1, 1] as const) {
        const pivot = new THREE.Object3D();
        pivot.position.set(def.at[0] + side * def.halfWidth, y, def.at[1]);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(def.halfWidth, def.height, 0.5), material);
        leaf.position.set(-side * (def.halfWidth / 2), def.height / 2, 0);
        pivot.add(leaf);
        pivot.userData.side = side;
        ctx.scene.add(pivot);
        pivots.push(pivot);
      }
    } else {
      lift = new THREE.Mesh(new THREE.BoxGeometry(def.halfWidth * 2, def.height, 0.4), material);
      lift.position.set(def.at[0], y + def.height / 2, def.at[1]);
      ctx.scene.add(lift);
    }
    parts.push({ def, gate, pivots, lift, baseY: y + def.height / 2 });
    offs.push(ctx.gates.watch((s) => flagConditionHolds(def.when, s), (open, cause) => gate.set(open, cause), { keys: conditionKeys(def.when) }));
  }
  const pose = (): void => {
    for (const p of parts) {
      const o = p.gate.open;
      // The leaves turn inward (toward +z, into the Caldera) by up to 100 degrees each: rotation.y = +a turns +x toward -z,
      // so the west leaf (side -1, reaching +x) takes -a and the east leaf (side +1, reaching -x) takes +a.
      for (const pivot of p.pivots) pivot.rotation.y = (pivot.userData.side as number) * o * ((100 * Math.PI) / 180);
      if (p.lift) p.lift.position.y = p.baseY + o * (p.def.height - 0.6);
    }
  };
  pose();
  offs.push(
    ctx.systems.add({
      id: CALDERA_GATES_SYSTEM_ID,
      renderPhase: 'world',
      order: 913,
      render: (_alpha: number, frameTime: number) => {
        for (const p of parts) p.gate.tick(frameTime);
        pose();
      },
    }),
  );
  return {
    state: (id) => states.get(id),
    dispose: () => {
      for (const off of offs.splice(0).reverse()) off();
      for (const p of parts) {
        for (const pivot of p.pivots) {
          ctx.scene.remove(pivot);
          pivot.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        }
        if (p.lift) {
          ctx.scene.remove(p.lift);
          (p.lift as THREE.Mesh).geometry.dispose();
        }
      }
      material.dispose();
    },
  };
}
