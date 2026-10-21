import type * as THREE from 'three';

export type SettledKind = 'cinder-golem' | 'slag-crawler';

/** A calmed golem (a cairn) or crawler (curled up) left in the world; persisted so a reload keeps it. */
export interface SettledRow {
  kind: SettledKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface SettledBuilders {
  build(kind: SettledKind): THREE.Object3D;
  free(kind: SettledKind, obj: THREE.Object3D): void;
}

const KINDS: readonly SettledKind[] = ['cinder-golem', 'slag-crawler'];
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** The settled forms: static props at the spot a Calm happened. Capped so a long game cannot pile them up. */
export class SettledForms {
  static readonly MAX = 64;
  private readonly rows: SettledRow[] = [];
  private readonly objs: THREE.Object3D[] = [];

  constructor(
    private readonly scene: THREE.Object3D,
    private readonly b: SettledBuilders,
  ) {}

  get count(): number {
    return this.rows.length;
  }

  add(row: SettledRow): boolean {
    if (!KINDS.includes(row.kind) || ![row.x, row.y, row.z, row.yaw].every(finite)) return false;
    if (this.rows.length >= SettledForms.MAX) this.removeAt(0);
    const o = this.b.build(row.kind);
    o.position.set(row.x, row.y, row.z);
    o.rotation.y = row.yaw;
    this.scene.add(o);
    this.rows.push({ ...row });
    this.objs.push(o);
    return true;
  }

  private removeAt(i: number): void {
    const o = this.objs[i]!;
    o.removeFromParent();
    this.b.free(this.rows[i]!.kind, o);
    this.rows.splice(i, 1);
    this.objs.splice(i, 1);
  }

  clear(): void {
    while (this.rows.length) this.removeAt(this.rows.length - 1);
  }

  serialize(): SettledRow[] {
    return this.rows.map((r) => ({ ...r }));
  }

  /** Replaces everything with the saved rows; bad rows are skipped. */
  load(data: unknown): void {
    this.clear();
    if (!Array.isArray(data)) return;
    for (const r of data) if (r && typeof r === 'object') this.add(r as SettledRow);
  }
}
