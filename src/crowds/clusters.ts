// Idle groups: 3 to 5 townsfolk standing in a ring, placed as offsets from thread 17's existing anchors (no new anchors).
import type { Anchor } from '../region/coreTypes';
import { CROWD_TUNING } from './tuning';

export interface ClusterSpec {
  id: string;
  /** Anchor the group stands near. */
  near: string;
  /** Metres from the anchor (+X east, +Z north). */
  dx: number;
  dz: number;
  size: number;
  /** Density group: `gate-square` empties while the gate is guarded. */
  group: 'gate-square' | 'market' | 'fountain' | 'forge' | 'chapel';
}

export const CROWD_CLUSTERS: ClusterSpec[] = [
  { id: 'market.1', near: 'harrowmark.square.market', dx: 4.4, dz: 12.2, size: 5, group: 'market' },
  { id: 'market.2', near: 'harrowmark.square.market', dx: 12.8, dz: 2.3, size: 4, group: 'market' },
  { id: 'market.3', near: 'harrowmark.square.market', dx: -4.4, dz: -12.2, size: 4, group: 'market' },
  { id: 'market.4', near: 'harrowmark.square.market', dx: -12.3, dz: 4.5, size: 4, group: 'market' },
  { id: 'fountain.1', near: 'harrowmark.square.fountain', dx: 13, dz: -32, size: 5, group: 'fountain' },
  { id: 'fountain.2', near: 'harrowmark.square.fountain', dx: 6, dz: -62, size: 4, group: 'fountain' },
  { id: 'fountain.3', near: 'harrowmark.square.fountain', dx: -17, dz: -51, size: 4, group: 'fountain' },
  { id: 'gate-square.1', near: 'harrowmark.square.gate', dx: -22, dz: 3, size: 4, group: 'gate-square' },
  { id: 'gate-square.2', near: 'harrowmark.square.gate', dx: 20, dz: 15, size: 4, group: 'gate-square' },
  { id: 'forge.1', near: 'harrowmark.forge-row.centre', dx: 35, dz: 18, size: 4, group: 'forge' },
  { id: 'forge.2', near: 'harrowmark.forge-row.centre', dx: -45, dz: -18, size: 4, group: 'forge' },
  { id: 'chapel.1', near: 'harrowmark.chapel.court', dx: 40, dz: 15, size: 4, group: 'chapel' },
];

export interface IdleSpot {
  cluster: string;
  group: ClusterSpec['group'];
  x: number;
  y: number;
  z: number;
  /** Engine yaw facing the group centre (yaw 0 faces -Z). */
  yaw: number;
}

export interface ResolvedCluster {
  spec: ClusterSpec;
  cx: number;
  cz: number;
  spots: IdleSpot[];
}

export function resolveClusters(
  specs: readonly ClusterSpec[],
  findAnchor: (id: string) => Anchor | undefined,
  heightAt: (x: number, z: number) => number,
): ResolvedCluster[] {
  const r = CROWD_TUNING.idle.ringRadius;
  return specs.map((spec) => {
    const a = findAnchor(spec.near);
    if (!a) throw new Error(`crowds: cluster ${spec.id} needs anchor "${spec.near}"`);
    const cx = a.position.x + spec.dx;
    const cz = a.position.z + spec.dz;
    const spots: IdleSpot[] = [];
    for (let k = 0; k < spec.size; k++) {
      const t = (k / spec.size) * Math.PI * 2 + spec.id.length;
      const x = cx + r * Math.sin(t);
      const z = cz + r * Math.cos(t);
      // Face the centre: facing vector (-sin yaw, -cos yaw) points from the spot to (cx, cz).
      const yaw = Math.atan2(x - cx, z - cz);
      spots.push({ cluster: spec.id, group: spec.group, x, y: heightAt(x, z), z, yaw });
    }
    return { spec, cx, cz, spots };
  });
}
