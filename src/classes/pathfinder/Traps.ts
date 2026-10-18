import * as THREE from 'three';
import type { StatusService } from '../../actors/status';
import { actorsInRadius } from '../../spells/areas';
import type { ActorsLike, DamageLike, Vec3 } from '../../vfx/ports';
import { PF } from './tuning';

export type TrapKind = 'wire' | 'cinder';

export interface TrapPorts {
  actors: ActorsLike;
  damage: DamageLike;
  status(): StatusService | undefined;
  now(): number;
  playerId(): string;
  added(id: number, kind: TrapKind, at: Vec3): void;
  removed(id: number, kind: TrapKind, triggered: boolean): void;
  /** The burst of a Cinder Trap. */
  burst(at: Vec3, radius: number): void;
}

interface Trap {
  id: number;
  kind: TrapKind;
  at: Vec3;
  until: number;
}

/**
 * Tripwire (tier 1 passive: a dodge leaves a wire where it began) and Cinder Trap (tier 2 active). A trap triggers on the
 * first living hostile within its radius and is spent; one that nobody walks into expires.
 */
export class Traps {
  private readonly traps = new Map<number, Trap>();
  private nextId = 1;
  private wireReadyAt = 0;

  constructor(private readonly ports: TrapPorts) {}

  count(kind?: TrapKind): number {
    let n = 0;
    for (const t of this.traps.values()) if (!kind || t.kind === kind) n++;
    return n;
  }

  wireCooldown(): number {
    return Math.max(0, this.wireReadyAt - this.ports.now());
  }

  /** A dodge began at `at`. False while the wire is cooling down or two are already live. */
  dodgeStarted(at: Vec3): boolean {
    const now = this.ports.now();
    if (now < this.wireReadyAt || this.count('wire') >= PF.tripwire.cap) return false;
    this.wireReadyAt = now + PF.tripwire.cooldown;
    this.add('wire', at, PF.tripwire.lifetime);
    return true;
  }

  /** Places a Cinder Trap. False at the cap of three live. */
  placeCinder(at: Vec3): boolean {
    if (this.count('cinder') >= PF.cinderTrap.cap) return false;
    this.add('cinder', at, PF.cinderTrap.lifetime);
    return true;
  }

  update(): void {
    const now = this.ports.now();
    for (const t of [...this.traps.values()]) {
      if (!this.traps.has(t.id)) continue;
      if (t.until <= now) {
        this.remove(t, false);
        continue;
      }
      const hit = actorsInRadius(this.ports.actors, t.at, (t.kind === 'wire' ? PF.tripwire.radius : PF.cinderTrap.radius), { team: 'hostile', alive: true })[0];
      if (hit) this.trigger(t, hit.actor.id);
    }
  }

  clear(): void {
    for (const t of [...this.traps.values()]) this.remove(t, false);
    this.wireReadyAt = 0;
  }

  private add(kind: TrapKind, at: Vec3, lifetime: number): void {
    const t: Trap = { id: this.nextId++, kind, at: { x: at.x, y: at.y, z: at.z }, until: this.ports.now() + lifetime };
    this.traps.set(t.id, t);
    this.ports.added(t.id, kind, t.at);
  }

  private remove(t: Trap, triggered: boolean): void {
    if (!this.traps.delete(t.id)) return;
    this.ports.removed(t.id, t.kind, triggered);
  }

  private trigger(t: Trap, firstId: string): void {
    this.remove(t, true);
    const attackerId = this.ports.playerId();
    if (t.kind === 'wire') {
      // Poise only (amount 0 is legal): the wire staggers and does not hurt.
      this.ports.damage.apply({ attackerId, targetId: firstId, amount: 0, poise: PF.tripwire.poise, kind: 'script', attackId: 'pathfinder.tripwire' });
      return;
    }
    const c = PF.cinderTrap;
    this.ports.burst(t.at, c.blast);
    for (const h of actorsInRadius(this.ports.actors, t.at, c.blast, { team: 'hostile', alive: true })) {
      const dx = h.position.x - t.at.x;
      const dz = h.position.z - t.at.z;
      const len = Math.hypot(dx, dz) || 1;
      this.ports.damage.apply({
        attackerId,
        targetId: h.actor.id,
        amount: c.damage,
        poise: c.poise,
        kind: 'spell',
        attackId: 'pathfinder.cinderTrap',
        point: new THREE.Vector3(h.position.x, h.position.y, h.position.z),
        direction: new THREE.Vector3(dx / len, 0, dz / len),
      });
      this.ports.status()?.apply(h.actor.id, { id: 'pathfinder.cinderTrap', kind: 'ignite', dps: c.igniteDps, seconds: c.igniteSeconds, sourceId: attackerId });
    }
  }
}
