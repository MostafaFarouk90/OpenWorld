import type { AnchorSpec, LayoutData, TriggerSpec } from './layoutTypes';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Same shape as the core `Anchor` (world-layout-and-npcs.md section 2). `position.y` is absolute. */
export interface ResolvedAnchor {
  id: string;
  position: Vec3;
  yaw: number;
  tags: string[];
  onStructure?: string;
}

export type ResolvedTrigger = {
  id: string;
  who: 'player' | 'any-actor';
  once: boolean;
} & (
  | { shape: { type: 'sphere'; center: Vec3; radius: number } }
  | { shape: { type: 'box'; center: Vec3; half: Vec3; yaw: number } }
);

export type HeightFn = (x: number, z: number) => number;

const DEG = Math.PI / 180;

export function resolveAnchor(spec: AnchorSpec, heightAt: HeightFn): ResolvedAnchor {
  return {
    id: spec.id,
    position: { x: spec.x, y: heightAt(spec.x, spec.z) + (spec.dy ?? 0), z: spec.z },
    yaw: spec.yawDeg * DEG,
    tags: [...(spec.tags ?? [])],
    onStructure: spec.onStructure,
  };
}

export function resolveTrigger(spec: TriggerSpec, heightAt: HeightFn): ResolvedTrigger {
  const center = { x: spec.x, y: heightAt(spec.x, spec.z) + (spec.dy ?? 0), z: spec.z };
  const base = { id: spec.id, who: spec.who ?? 'player', once: spec.once ?? false } as const;
  if (spec.shape === 'sphere') return { ...base, shape: { type: 'sphere', center, radius: spec.radius } };
  const [hx, hy, hz] = spec.half;
  return { ...base, shape: { type: 'box', center, half: { x: hx, y: hy, z: hz }, yaw: (spec.yawDeg ?? 0) * DEG } };
}

export interface ResolvedLayout {
  anchors: ResolvedAnchor[];
  triggers: ResolvedTrigger[];
}

/** Heights are never stored in the layout: they are computed here from the terrain. */
export function resolveLayout(layout: LayoutData, heightAt: HeightFn): ResolvedLayout {
  return {
    anchors: layout.anchors.map((a) => resolveAnchor(a, heightAt)),
    triggers: layout.triggers.map((t) => resolveTrigger(t, heightAt)),
  };
}
