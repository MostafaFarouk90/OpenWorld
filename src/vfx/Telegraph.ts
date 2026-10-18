import * as THREE from 'three';
import { ActorMaterials, getFx } from './ActorMaterials';

const COLORS = { block: 0xffd23a, dodge: 0xff2a1a } as const;
const DROP = 0.1;

interface Active {
  root: THREE.Object3D;
  start: number;
  lead: number;
  mats: THREE.MeshStandardMaterial[];
}

function inScene(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if ((p as THREE.Scene).isScene) return true;
  return false;
}

function matchesParts(mesh: THREE.Object3D, root: THREE.Object3D, parts: string[]): boolean {
  const needles = parts.map((s) => s.toLowerCase()).filter((s) => s.length > 0);
  for (let p: THREE.Object3D | null = mesh; p; p = p === root ? null : p.parent) {
    const hay = [p.name, typeof p.userData?.telegraph === 'string' ? (p.userData.telegraph as string) : '']
      .join('|')
      .toLowerCase();
    if (needles.some((n) => hay.includes(n))) return true;
  }
  return false;
}

export class TelegraphFx {
  private readonly active = new Map<THREE.Object3D, Active>();

  constructor(private readonly materials: ActorMaterials) {}

  flash(
    root: THREE.Object3D | null | undefined,
    kind: 'block' | 'dodge',
    leadSeconds: number,
    now: number,
    opts?: { parts?: string[] },
  ): boolean {
    if (!root || !Number.isFinite(leadSeconds) || leadSeconds <= 0 || !Number.isFinite(now)) return false;
    this.materials.ensure(root);
    let groups = this.materials.meshes(root);
    if (opts?.parts && opts.parts.length > 0) {
      const parts = opts.parts;
      groups = groups.filter((g) => matchesParts(g.mesh, root, parts));
    }
    const mats = groups.flatMap((g) => g.materials);
    if (mats.length === 0) return false;
    this.cancel(root);
    const color = COLORS[kind] ?? COLORS.block;
    for (const m of mats) {
      const fx = getFx(m);
      if (!fx) continue;
      fx.uTelegraphColor.value.setHex(color);
      fx.uTelegraph.value = 0;
    }
    this.active.set(root, { root, start: now, lead: Math.min(1.5, Math.max(0.1, leadSeconds)), mats });
    return true;
  }

  update(now: number): void {
    for (const [root, a] of this.active) {
      if (!inScene(root)) {
        this.set(a, 0);
        this.active.delete(root);
        continue;
      }
      const t = now - a.start;
      if (t < a.lead) this.set(a, Math.max(0, t / a.lead));
      else if (t < a.lead + DROP) this.set(a, 1 - (t - a.lead) / DROP);
      else {
        this.set(a, 0);
        this.active.delete(root);
      }
    }
  }

  cancel(root: THREE.Object3D | null | undefined): void {
    if (!root) return;
    const a = this.active.get(root);
    if (!a) return;
    this.set(a, 0);
    this.active.delete(root);
  }

  dispose(): void {
    for (const a of this.active.values()) this.set(a, 0);
    this.active.clear();
  }

  private set(a: Active, v: number): void {
    for (const m of a.mats) {
      const fx = getFx(m);
      if (fx) fx.uTelegraph.value = v;
    }
  }
}
