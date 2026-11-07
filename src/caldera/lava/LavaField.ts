// N3 lava runtime (plans/act5-N3.md 1.1 and 1.2): which volume the player's feet are in, the burn (v0.9's floor rule plus
// the exposure-style floor guard), the throw to a safe lip, the last safe lip, the `lava-stair` save push and the crusts
// the vents cool. No three and no rapier here: the plugin wires the ports.
import type { Vec3 } from '../../physics/PhysicsWorld';
import { LAVA_HEALTH_FLOOR, lavaDamage, nearestSafeLip, onLavaShape, type LavaShape } from '../lava';
import type { LavaFieldDef, VolumeInfo } from './types';
import { LAVA } from './tuning';
import { yawToward } from './crossings';

export interface LavaFieldPorts {
  vitals(): { health: number; max: number; dead: boolean };
  damage(amount: number): void;
  heal(amount: number): void;
  /** Safe teleport to a lip; resolves true when Cael stands there. */
  throwTo(to: Vec3, yaw: number): Promise<boolean>;
  entered?(volumeId: string): void;
  thrown?(volumeId: string, to: Vec3): void;
  /** Pushes the `lava-stair` movement mode with a safe point getter; returns the release. */
  pushMode?(safePoint: () => { position: Vec3; yaw: number } | null): () => void;
  /** Damage multiplier from worn heat gear (N7's `heatWard().lava`); 1 when absent. */
  ward?(): number;
  warn?(message: string): void;
}

interface Volume {
  def: LavaFieldDef;
  surfaceY: number;
  lips: Vec3[];
}

/** Surface height of a volume at (x, z): its profile for a profiled ribbon, else its surface. */
export function surfaceAt(v: { def: LavaFieldDef; surfaceY: number }, x: number, z: number): number {
  const { def } = v;
  const shape = def.shape;
  if (shape.kind !== 'ribbon' || !def.profile || def.profile.length !== shape.points.length) return v.surfaceY;
  const offset = v.surfaceY - def.surfaceY; // a rising level moves the whole profile
  const p = shape.points;
  let best = Infinity;
  let y = def.profile[0]!;
  for (let i = 1; i < p.length; i++) {
    const [ax, az] = p[i - 1]!;
    const [bx, bz] = p[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) {
      best = d;
      y = def.profile[i - 1]! + (def.profile[i]! - def.profile[i - 1]!) * t;
    }
  }
  return y + offset;
}

/** The (x, z) nearest to a point on a shape, and its distance (0 inside). */
export function nearestOnShape(shape: LavaShape, x: number, z: number): { x: number; z: number; distance: number } {
  if (shape.kind === 'box') {
    const nx = Math.min(shape.x1, Math.max(shape.x0, x));
    const nz = Math.min(shape.z1, Math.max(shape.z0, z));
    return { x: nx, z: nz, distance: Math.hypot(x - nx, z - nz) };
  }
  if (shape.kind === 'circle') {
    const d = Math.hypot(x - shape.x, z - shape.z);
    if (d <= shape.r) return { x, z, distance: 0 };
    return { x: shape.x + ((x - shape.x) / d) * shape.r, z: shape.z + ((z - shape.z) / d) * shape.r, distance: d - shape.r };
  }
  let best = { x, z, distance: Infinity };
  const p = shape.points;
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[Math.max(0, i - 1)]!;
    const [bx, bz] = p[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
    const cx = ax + dx * t;
    const cz = az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    const out = Math.max(0, d - shape.halfWidth);
    if (out < best.distance) {
      best = out === 0 ? { x, z, distance: 0 } : { x: cx + ((x - cx) / d) * shape.halfWidth, z: cz + ((z - cz) / d) * shape.halfWidth, distance: out };
    }
  }
  return best;
}

export function validateVolume(def: LavaFieldDef): string | null {
  if (!def || typeof def.id !== 'string' || !def.id) return 'a lava volume needs an id';
  if (!Number.isFinite(def.surfaceY)) return `lava volume "${def.id}" needs a finite surfaceY`;
  if (!(def.damagePctPerS > 0) || !Number.isFinite(def.damagePctPerS)) return `lava volume "${def.id}" needs damagePctPerS > 0`;
  if (!Array.isArray(def.safeLips) || def.safeLips.length === 0) return `lava volume "${def.id}" needs at least one safe lip`;
  for (const l of def.safeLips) if (![l.x, l.y, l.z].every(Number.isFinite)) return `lava volume "${def.id}" has a non-finite lip`;
  const s = def.shape;
  if (s.kind === 'box' && !(s.x1 > s.x0 && s.z1 > s.z0)) return `lava volume "${def.id}" has an empty box`;
  if (s.kind === 'circle' && !(s.r > 0)) return `lava volume "${def.id}" needs r > 0`;
  if (s.kind === 'ribbon') {
    if (s.points.length < 2 || !(s.halfWidth > 0)) return `lava volume "${def.id}" needs two points and halfWidth > 0`;
    if (def.profile && def.profile.length !== s.points.length) return `lava volume "${def.id}": profile and points differ in length`;
  }
  return null;
}

export class LavaField {
  private readonly volumes = new Map<string, Volume>();
  private readonly crusts = new Map<string, { volumeId: string; shape: LavaShape; solid: boolean }>();
  /** The volume the feet were in on the last step, the entry point, and seconds in it. */
  private inside: { volumeId: string; entry: Vec3; seconds: number } | null = null;
  private throwing = false;
  private lastLip: Vec3 | null = null;
  private releaseMode: (() => void) | null = null;
  private floorWarned = false;
  private lastFeet: Vec3 | null = null;

  constructor(private readonly ports: LavaFieldPorts) {}

  add(def: LavaFieldDef): () => void {
    const p = validateVolume(def);
    if (p) throw new Error(`lava: ${p}`);
    if (this.volumes.has(def.id)) throw new Error(`lava: volume "${def.id}" is already registered`);
    const v: Volume = { def, surfaceY: def.surfaceY, lips: def.safeLips.map((l) => ({ ...l })) };
    this.volumes.set(def.id, v);
    return () => {
      if (this.volumes.get(def.id) !== v) return;
      this.volumes.delete(def.id);
      if (this.inside?.volumeId === def.id) this.inside = null;
    };
  }

  /** A crust (a vent's) inside a volume: while solid it reads as ground, not lava. */
  addCrust(ventId: string, volumeId: string, shape: LavaShape): () => void {
    if (this.crusts.has(ventId)) throw new Error(`lava: crust "${ventId}" is already registered`);
    const c = { volumeId, shape, solid: false };
    this.crusts.set(ventId, c);
    return () => {
      if (this.crusts.get(ventId) === c) this.crusts.delete(ventId);
    };
  }

  setCrustSolid(ventId: string, solid: boolean): void {
    const c = this.crusts.get(ventId);
    if (c) c.solid = solid;
  }

  has(id: string): boolean {
    return this.volumes.has(id);
  }

  /** The arena kit's rising lava: moves a volume's surface (a profiled ribbon moves as a whole). */
  setSurface(id: string, y: number): boolean {
    const v = this.volumes.get(id);
    if (!v || !Number.isFinite(y)) return false;
    v.surfaceY = y;
    return true;
  }

  surface(id: string): number | undefined {
    return this.volumes.get(id)?.surfaceY;
  }

  /** The arena kit's rising lava: replaces a volume's safe lips (at least one). */
  setLips(id: string, lips: readonly Vec3[]): boolean {
    const v = this.volumes.get(id);
    if (!v || lips.length === 0) return false;
    v.lips = lips.map((l) => ({ ...l }));
    return true;
  }

  lips(id: string): readonly Vec3[] {
    return this.volumes.get(id)?.lips ?? [];
  }

  list(): VolumeInfo[] {
    return [...this.volumes.values()].map((v) => ({ id: v.def.id, shape: v.def.shape, surfaceY: v.surfaceY }));
  }

  def(id: string): LavaFieldDef | undefined {
    return this.volumes.get(id)?.def;
  }

  /** The volume whose lava is at this point (on its shape, under its surface, not on a solid crust), or null. */
  at(x: number, y: number, z: number): string | null {
    if (![x, y, z].every(Number.isFinite)) return null;
    for (const v of this.volumes.values()) {
      if (!onLavaShape(v.def.shape, x, z)) continue;
      if (!(y < surfaceAt(v, x, z))) continue;
      if (this.onSolidCrust(v.def.id, x, z)) continue;
      return v.def.id;
    }
    return null;
  }

  /** Over any lava shape in (x, z), whatever the height (a Leap or a jump across). */
  over(x: number, z: number): boolean {
    for (const v of this.volumes.values()) if (onLavaShape(v.def.shape, x, z) && !this.onSolidCrust(v.def.id, x, z)) return true;
    return false;
  }

  /** The nearest lava surface point in (x, z) (N8's positional loop). */
  nearest(x: number, z: number): { volumeId: string; distance: number; point: Vec3 } | null {
    let best: { volumeId: string; distance: number; point: Vec3 } | null = null;
    for (const v of this.volumes.values()) {
      const n = nearestOnShape(v.def.shape, x, z);
      if (!best || n.distance < best.distance) best = { volumeId: v.def.id, distance: n.distance, point: { x: n.x, y: surfaceAt(v, n.x, n.z), z: n.z } };
    }
    return best;
  }

  get lastSafeLip(): Vec3 | null {
    return this.lastLip ? { ...this.lastLip } : null;
  }

  get inLava(): string | null {
    return this.inside?.volumeId ?? null;
  }

  get isThrowing(): boolean {
    return this.throwing;
  }

  /** Where a save made now should put Cael: the last safe lip, else the nearest lip of the nearest volume. */
  safePoint(feet: Vec3 | null = this.lastFeet): { position: Vec3; yaw: number } | null {
    const lip = this.lastLip ?? (feet ? this.nearestLipAnywhere(feet) : null);
    return lip ? { position: { ...lip }, yaw: 0 } : null;
  }

  /** Once per fixed tick, after the player moved. */
  step(dt: number, feet: Vec3, grounded: boolean): void {
    this.lastFeet = { x: feet.x, y: feet.y, z: feet.z };
    if (this.volumes.size === 0) {
      this.inside = null;
      this.setPush(false);
      return;
    }
    const vitals = this.ports.vitals();
    if (this.throwing) return;
    const id = vitals.dead ? null : this.at(feet.x, feet.y, feet.z);
    if (!id) {
      this.inside = null;
      if (grounded) this.notePassedLip(feet);
      this.setPush(!grounded && this.over(feet.x, feet.z));
      return;
    }
    this.setPush(true);
    if (!this.inside || this.inside.volumeId !== id) {
      this.inside = { volumeId: id, entry: { ...(this.lastSafeFeet ?? feet) }, seconds: 0 };
      this.ports.entered?.(id);
    }
    this.burn(id, dt);
    this.inside.seconds += dt;
    if (this.inside.seconds >= LAVA.throwAfterS - 1e-9) void this.throwOut(id, this.inside.entry);
  }

  /** `save.loaded`: forget the run's state; feet loaded inside lava go to the nearest lip, with no damage. */
  async onLoaded(feet: Vec3): Promise<void> {
    this.inside = null;
    this.throwing = false;
    this.lastLip = null;
    this.setPush(false);
    const id = this.at(feet.x, feet.y, feet.z);
    if (id) await this.throwOut(id, feet, false);
  }

  dispose(): void {
    this.setPush(false);
    this.volumes.clear();
    this.crusts.clear();
  }

  // ---------------------------------------------------------------------------------------------------------------------

  /** The last feet outside lava (the entry point a throw measures from). */
  private lastSafeFeet: Vec3 | null = null;

  private onSolidCrust(volumeId: string, x: number, z: number): boolean {
    for (const c of this.crusts.values()) if (c.solid && c.volumeId === volumeId && onLavaShape(c.shape, x, z)) return true;
    return false;
  }

  private notePassedLip(feet: Vec3): void {
    this.lastSafeFeet = { ...feet };
    let best: Vec3 | null = null;
    let bestD: number = LAVA.lipPassRadius;
    for (const v of this.volumes.values()) {
      for (const l of v.lips) {
        const d = Math.hypot(l.x - feet.x, l.z - feet.z);
        if (d <= bestD) {
          bestD = d;
          best = l;
        }
      }
    }
    if (best) this.lastLip = { ...best };
  }

  private nearestLipAnywhere(feet: Vec3): Vec3 | null {
    const n = this.nearest(feet.x, feet.z);
    if (!n) return null;
    const v = this.volumes.get(n.volumeId)!;
    const lip = nearestSafeLip(feet, v.lips);
    return lip ? { ...lip } : null;
  }

  private burn(id: string, dt: number): void {
    const v = this.volumes.get(id)!;
    const before = this.ports.vitals();
    if (before.dead || !(before.max > 0)) return;
    const wardRaw = this.ports.ward?.() ?? 1;
    const ward = Number.isFinite(wardRaw) && wardRaw >= 0 ? wardRaw : 1;
    if (ward === 0) return;
    const next = lavaDamage(before.health, before.max, dt, v.def.damagePctPerS * ward);
    const amount = before.health - next;
    if (amount > 0) this.ports.damage(amount);
    // The floor guard (the exposure pattern): a damage modifier that pushed the hit past 10% is healed back to it.
    const after = this.ports.vitals();
    const floor = LAVA_HEALTH_FLOOR * after.max;
    if (before.health >= floor && (after.dead || after.health < floor)) {
      if (!after.dead) this.ports.heal(floor - after.health);
      if (!this.floorWarned) {
        this.floorWarned = true;
        this.ports.warn?.('lava: a burn tick crossed the 10% floor; healed back to it');
      }
    }
  }

  private async throwOut(id: string, from: Vec3, announce = true): Promise<void> {
    const v = this.volumes.get(id);
    if (!v || this.throwing) return;
    const lip = nearestSafeLip(from, v.lips);
    if (!lip) return;
    this.throwing = true;
    // face away from the lava: from where he came in, toward the lip (straight ahead when they coincide)
    const dx = lip.x - from.x;
    const dz = lip.z - from.z;
    const yaw = Math.hypot(dx, dz) > 0.05 ? yawToward(from.x, from.z, lip.x, lip.z) : 0;
    const to = { ...lip };
    let ok = false;
    try {
      ok = await this.ports.throwTo(to, yaw);
    } catch (e) {
      this.ports.warn?.(`lava: the throw to a safe lip failed (${String(e)})`);
    }
    this.throwing = false;
    this.inside = null;
    if (ok) {
      this.lastLip = { ...to };
      this.lastSafeFeet = { ...to };
      if (announce) this.ports.thrown?.(id, to);
    }
  }

  private setPush(on: boolean): void {
    if (on && !this.releaseMode && this.ports.pushMode) this.releaseMode = this.ports.pushMode(() => this.safePoint());
    else if (!on && this.releaseMode) {
      const r = this.releaseMode;
      this.releaseMode = null;
      r();
    }
  }
}
