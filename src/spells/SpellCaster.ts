import type { ActorId, ActorsLike, EventsLike, PlayerLike } from '../vfx/ports';
import type { Ember } from './Ember';
import { SPELLCAST_CLIPS } from './spellClips';
import type { SpellDef } from './spellDefs';
import { SPELL_LOCK_ACTIONS, SPELL_MOVE_SOURCE } from './tuning';

/** The caster's port to the game. Kept small; the plugin builds one from the PluginContext. */
export interface SpellHost {
  events: EventsLike;
  player: PlayerLike;
  actors: ActorsLike;
  ember: Ember;
  /** Starts the cast clip; false when it cannot play. */
  playClip(clip: string, opts: { lockMove: boolean }): boolean;
  stopClip?(clip: string): void;
  isStaggered(id: ActorId): boolean;
  /** True while the player attacks/dodges/blocks. (A running cast is detected by the caster itself.) */
  isBusy(id: ActorId): boolean;
  /** Dialogue, cutscene or menu. */
  inputBlocked(): boolean;
  /** Polled each update; a reason (rest, save, modal) cancels the running cast. */
  cancelRequested?(): string | null;
}

export type CastFailReason = 'unknown' | 'ember' | 'cooldown' | 'busy' | 'staggered' | 'dead' | 'blocked';
export type CastResult = { ok: true } | { ok: false; reason: CastFailReason };

export interface ReleaseContext {
  casterId: ActorId;
  spellId: string;
  def: SpellDef;
}

interface Active {
  casterId: ActorId;
  def: SpellDef;
  elapsed: number;
  releaseTime: number;
  duration: number;
  released: boolean;
  removeModifier: (() => void) | null;
}

const EPS = 1e-9;

export class SpellCaster {
  private readonly defs = new Map<string, { def: SpellDef; onRelease: (ctx: ReleaseContext) => void }>();
  private readonly cooldownUntil = new Map<string, number>();
  private active: Active | null = null;
  private time = 0;
  private readonly offs: Array<() => void>;

  constructor(private readonly host: SpellHost) {
    this.offs = [
      host.events.on('actor.staggered', (e) => this.active && e.actorId === this.active.casterId && this.cancel('staggered')),
      host.events.on('actor.died', (e) => this.active && e.actorId === this.active.casterId && this.cancel('dead')),
    ];
  }

  get state(): 'idle' | 'casting' | 'recovering' {
    if (!this.active) return 'idle';
    return this.active.released ? 'recovering' : 'casting';
  }

  def(id: string): SpellDef | undefined {
    return this.defs.get(id)?.def;
  }

  register(def: SpellDef, onRelease: (ctx: ReleaseContext) => void): () => void {
    const entry = { def, onRelease };
    this.defs.set(def.id, entry);
    return () => {
      if (this.defs.get(def.id) === entry) this.defs.delete(def.id);
    };
  }

  /** Seconds of cooldown remaining (sim time). */
  cooldown(spellId: string): number {
    const until = this.cooldownUntil.get(spellId);
    return until === undefined ? 0 : Math.max(0, until - this.time);
  }

  canCast(casterId: ActorId, spellId: string): CastResult {
    const entry = this.defs.get(spellId);
    if (!entry) return { ok: false, reason: 'unknown' };
    const actor = this.host.actors.get(casterId);
    if (!actor || actor.dead) return { ok: false, reason: 'dead' };
    if (this.host.isStaggered(casterId)) return { ok: false, reason: 'staggered' };
    if (this.active || this.host.isBusy(casterId)) return { ok: false, reason: 'busy' };
    if (this.host.inputBlocked()) return { ok: false, reason: 'blocked' };
    if (this.cooldown(spellId) > 0) return { ok: false, reason: 'cooldown' };
    if (!(this.host.ember.value >= entry.def.emberCost)) return { ok: false, reason: 'ember' };
    return { ok: true };
  }

  cast(casterId: ActorId, spellId: string): CastResult {
    const check = this.canCast(casterId, spellId);
    if (!check.ok) return check;
    const def = this.defs.get(spellId)!.def;
    const clip = SPELLCAST_CLIPS[def.clip];
    if (!clip) return { ok: false, reason: 'unknown' };
    if (!this.host.ember.spend(def.emberCost)) return { ok: false, reason: 'ember' };

    const a: Active = {
      casterId, def, elapsed: 0, duration: clip.duration, releaseTime: clip.duration * def.releaseAt, released: false, removeModifier: null,
    };
    // Everything that can throw or fail runs before spell.cast and the charge sound, so a refusal leaves no trace.
    const abort = (): CastResult => {
      this.active = null;
      a.removeModifier?.();
      a.removeModifier = null;
      this.host.ember.restore(def.emberCost);
      return { ok: false, reason: 'busy' };
    };
    this.active = a;
    if (casterId === this.host.player.actor.id) {
      try {
        a.removeModifier = this.host.player.addMoveModifier(SPELL_MOVE_SOURCE, { lockMove: def.lockMove, lockActions: [...SPELL_LOCK_ACTIONS] });
      } catch {
        return abort();
      }
    }
    let played = false;
    try {
      played = this.host.playClip(def.clip, { lockMove: def.lockMove });
    } catch {
      played = false;
    }
    if (!played) return abort();
    this.host.events.emit('spell.cast', { casterId, spellId });
    return { ok: true };
  }

  /** Fixed tick. A frozen sim does not call this. */
  update(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.time += dt;
    const a = this.active;
    if (!a) return;
    const requested = this.host.cancelRequested?.();
    if (requested) {
      this.cancel(requested);
      return;
    }
    if (this.host.actors.get(a.casterId)?.dead !== false) {
      this.cancel('dead');
      return;
    }
    a.elapsed += dt;
    if (!a.released && a.elapsed + EPS >= a.releaseTime) this.release(a);
    if (this.active === a && a.elapsed + EPS >= a.duration) this.end(null, false);
  }

  /** Interrupts the running cast. Before release: no effect and the Ember is refunded. */
  cancel(reason: string): void {
    const a = this.active;
    if (!a) return;
    this.end(reason, !a.released);
  }

  dispose(): void {
    this.cancel('dispose');
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.defs.clear();
  }

  private release(a: Active): void {
    a.released = true;
    this.cooldownUntil.set(a.def.id, this.time + a.def.cooldown);
    try {
      this.defs.get(a.def.id)?.onRelease({ casterId: a.casterId, spellId: a.def.id, def: a.def });
    } finally {
      this.host.events.emit('spell.released', { casterId: a.casterId, spellId: a.def.id });
    }
  }

  /** Always clears the move modifier. reason null is a normal finish. */
  private end(reason: string | null, refund: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.removeModifier?.();
    a.removeModifier = null;
    if (reason !== null) {
      this.host.stopClip?.(a.def.clip);
      if (refund) this.host.ember.restore(a.def.emberCost);
      this.host.events.emit('spell.cancelled', { casterId: a.casterId, spellId: a.def.id, reason });
    }
  }
}
