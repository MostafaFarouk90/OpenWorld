// N3 cooling vents (plan 2.7, M48; plans/act5-N3.md 1.2). "Open" is the vented, cooled state: the crust over the lava is
// walkable for `openS`. A vent with a wheel opens when the wheel is turned, then the wheel recharges for `closedS`; a vent
// without one cycles by itself (open first) on v0.9's `ventStateAt`. Pure: sim time in, transitions out.
import { ventStateAt } from '../lava';
import type { CrustVentDef } from './types';
import { VENT } from './tuning';

export type VentTransition = { ventId: string; kind: 'opened' | 'closing' | 'closed' };
export type WheelResult = 'opened' | 'already-open' | 'hot' | 'unknown' | 'no-wheel';

interface VentEntry {
  def: CrustVentDef;
  open: boolean;
  /** Wheel vents: when the current opening ends, and when the wheel may turn again. */
  openUntil: number;
  readyAt: number;
  warned: boolean;
  /** Wheel-less vents: the sim time their cycle started. */
  t0: number;
}

export class VentClock {
  private readonly vents = new Map<string, VentEntry>();
  private now = 0;

  add(def: CrustVentDef): () => void {
    if (this.vents.has(def.id)) throw new Error(`lava: vent "${def.id}" is already registered`);
    if (!(def.openS > 0) || !(def.closedS >= 0) || !Number.isFinite(def.openS) || !Number.isFinite(def.closedS)) {
      throw new Error(`lava: vent "${def.id}" needs openS > 0 and closedS >= 0`);
    }
    const e: VentEntry = { def, open: false, openUntil: -Infinity, readyAt: -Infinity, warned: false, t0: this.now };
    this.vents.set(def.id, e);
    return () => {
      if (this.vents.get(def.id) === e) this.vents.delete(def.id);
    };
  }

  get time(): number {
    return this.now;
  }

  has(id: string): boolean {
    return this.vents.has(id);
  }

  isOpen(id: string): boolean {
    return this.vents.get(id)?.open === true;
  }

  defs(): CrustVentDef[] {
    return [...this.vents.values()].map((e) => e.def);
  }

  /** Seconds until an open vent closes (undefined when closed or unknown). */
  closesIn(id: string): number | undefined {
    const e = this.vents.get(id);
    if (!e || !e.open) return undefined;
    if (e.def.wheel !== undefined) return Math.max(0, e.openUntil - this.now);
    const cycle = e.def.openS + e.def.closedS;
    const u = (((this.now - e.t0) % cycle) + cycle) % cycle;
    return Math.max(0, e.def.openS - u);
  }

  /** The vent's wheel was turned. A wheel-less vent answers 'no-wheel'. */
  turnWheel(id: string): WheelResult {
    const e = this.vents.get(id);
    if (!e) return 'unknown';
    if (e.def.wheel === undefined) return 'no-wheel';
    if (e.open) return 'already-open';
    if (this.now < e.readyAt) return 'hot';
    e.openUntil = this.now + e.def.openS;
    e.readyAt = e.openUntil + e.def.closedS;
    return 'opened';
  }

  /** Advances sim time; returns the transitions this step, in registration order. */
  step(dt: number): VentTransition[] {
    if (dt > 0 && Number.isFinite(dt)) this.now += dt;
    const out: VentTransition[] = [];
    for (const e of this.vents.values()) {
      const shouldOpen = e.def.wheel !== undefined ? this.now < e.openUntil : ventStateAt(e.def, this.now - e.t0) === 'open';
      if (shouldOpen && !e.open) {
        e.open = true;
        e.warned = false;
        out.push({ ventId: e.def.id, kind: 'opened' });
      }
      if (e.open && shouldOpen && !e.warned) {
        const left = this.closesIn(e.def.id) ?? 0;
        if (left <= VENT.closingWarnS + 1e-9) {
          e.warned = true;
          out.push({ ventId: e.def.id, kind: 'closing' });
        }
      }
      if (!shouldOpen && e.open) {
        e.open = false;
        out.push({ ventId: e.def.id, kind: 'closed' });
      }
    }
    return out;
  }

  /** `save.loaded`: every vent closed, wheels ready, cycles restarted. Returns the vents that were open (now closed). */
  reset(): string[] {
    const closed: string[] = [];
    for (const e of this.vents.values()) {
      if (e.open) closed.push(e.def.id);
      e.open = false;
      e.openUntil = -Infinity;
      e.readyAt = -Infinity;
      e.warned = false;
      // a wheel-less vent restarts its cycle closed: it opens after its closed time
      e.t0 = this.now + e.def.closedS;
    }
    return closed;
  }
}
