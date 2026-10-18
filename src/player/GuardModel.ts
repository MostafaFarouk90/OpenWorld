import { GUARD, STAMINA } from './tuning';
import type { AttackWindowEvent, DamageRequestLike, TelegraphEvent } from './types';

export interface GuardContext {
  tick: number;
  /** 0 faces -Z; the forward vector is (-sin yaw, -cos yaw). */
  facingYaw: number;
  stamina: { canAfford(n: number): boolean; readonly current?: number };
  /** The Knight is exhausted: no block. */
  exhausted?: boolean;
  /** Half-angle of the covered arc; default `GUARD.arcHalfAngle` (Iron Stance widens it). */
  arcHalfAngle?: number;
}

export interface GuardResolution {
  outcome: 'hit' | 'blocked' | 'parried';
  scale: number;
  poiseScale: number;
  /** Stamina the caller takes; on a guard break, everything that is left. */
  staminaCost: number;
  guardBreak: boolean;
}

const HIT: GuardResolution = { outcome: 'hit', scale: 1, poiseScale: 1, staminaCost: 0, guardBreak: false };
const swingKey = (actorId: string, swingId: number): string => `${actorId}#${swingId}`;
const attackKey = (actorId: string, attackId: string): string => `${actorId}|${attackId}`;

/** Block, parry and guard-break state; holds no actor references. */
export class GuardModel {
  private isHeld = false;
  private press = Number.NEGATIVE_INFINITY;
  private lockedUntil = Number.NEGATIVE_INFINITY;
  private readonly windows = new Map<string, { open: number; attackId: string }>();
  private readonly unblockableSwings = new Set<string>();
  private readonly unblockableAttacks = new Set<string>();

  get held(): boolean {
    return this.isHeld;
  }

  get pressTick(): number {
    return this.press;
  }

  setBlockHeld(held: boolean, tick: number): void {
    if (held && !this.isHeld) this.press = tick;
    if (!held) this.press = Number.NEGATIVE_INFINITY;
    this.isHeld = held;
  }

  onWindow(ev: AttackWindowEvent, tick: number): void {
    const key = swingKey(ev.actorId, ev.swingId);
    const mark = attackKey(ev.actorId, ev.attackId);
    if (ev.phase === 'open') {
      this.windows.set(key, { open: tick, attackId: ev.attackId });
      if (this.unblockableAttacks.has(mark)) this.unblockableSwings.add(key);
      return;
    }
    this.windows.delete(key);
    this.unblockableSwings.delete(key);
    this.unblockableAttacks.delete(mark);
  }

  onTelegraph(ev: TelegraphEvent): void {
    if (ev.kind === 'dodge') this.unblockableAttacks.add(attackKey(ev.actorId, ev.attackId));
  }

  /** Forget everything tracked for an attacker (despawn). */
  clearActor(actorId: string): void {
    const prefix = `${actorId}#`;
    for (const key of [...this.windows.keys()]) if (key.startsWith(prefix)) this.windows.delete(key);
    for (const key of [...this.unblockableSwings]) if (key.startsWith(prefix)) this.unblockableSwings.delete(key);
    const attackPrefix = `${actorId}|`;
    for (const key of [...this.unblockableAttacks]) if (key.startsWith(attackPrefix)) this.unblockableAttacks.delete(key);
  }

  swingOpenTick(attackerId: string, swingId: number): number | undefined {
    return this.windows.get(swingKey(attackerId, swingId))?.open;
  }

  lockout(tick: number): void {
    this.lockedUntil = tick + GUARD.guardBreakLockoutTicks;
  }

  lockedOut(tick: number): boolean {
    return tick < this.lockedUntil;
  }

  resolve(req: DamageRequestLike, ctx: GuardContext): GuardResolution {
    if (!this.isHeld || this.lockedOut(ctx.tick) || ctx.exhausted || req.unblockable) return HIT;
    if (this.isUnblockable(req) || !this.inFront(req, ctx.facingYaw, ctx.arcHalfAngle)) return HIT;

    if (req.parryable !== false && this.isParry(req, ctx.tick)) return { outcome: 'parried', scale: 0, poiseScale: 0, staminaCost: 0, guardBreak: false };

    const cost = STAMINA.blockHitBase + STAMINA.blockHitRawScale * req.amount;
    if (!ctx.stamina.canAfford(cost)) {
      this.lockout(ctx.tick);
      return { outcome: 'hit', scale: 1, poiseScale: 1, staminaCost: ctx.stamina.current ?? Number.POSITIVE_INFINITY, guardBreak: true };
    }
    return { outcome: 'blocked', scale: GUARD.blockedScale, poiseScale: GUARD.blockedScale, staminaCost: cost, guardBreak: false };
  }

  private isUnblockable(req: DamageRequestLike): boolean {
    if (req.attackerId === null) return false;
    if (req.swingId !== undefined && this.unblockableSwings.has(swingKey(req.attackerId, req.swingId))) return true;
    return req.attackId !== undefined && this.unblockableAttacks.has(attackKey(req.attackerId, req.attackId));
  }

  private inFront(req: DamageRequestLike, yaw: number, arcHalfAngle: number = GUARD.arcHalfAngle): boolean {
    const d = req.direction;
    if (!d) return false;
    const len = Math.hypot(d.x, d.z);
    if (len < 1e-6) return false;
    const dot = (-Math.sin(yaw) * -d.x + -Math.cos(yaw) * -d.z) / len;
    return dot >= Math.cos(arcHalfAngle);
  }

  private isParry(req: DamageRequestLike, tick: number): boolean {
    const open = req.attackerId !== null && req.swingId !== undefined ? this.swingOpenTick(req.attackerId, req.swingId) : undefined;
    if (open === undefined) return tick - this.press <= GUARD.parryLeadTicks;
    return this.press >= open - GUARD.parryLeadTicks && this.press <= open;
  }
}
