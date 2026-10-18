import type { ActorId } from '../actors/Actor';
import type { Anchor } from '../layout/AnchorRegistry';
import { CALM, type AlertState, type GuardAlert, stepAlert } from './detection';
import type { GuardPerceptionState, P3 } from './perceptionPort';
import { type StealthSectionDef, insideSection, insideVolume } from './sections';

/** What the director needs from the game; the plugin wires it, tests fake it. */
export interface StealthPorts {
  find(id: string): Anchor | undefined;
  /** `interiors.interiorAt(feet)` (null outdoors or without the service). */
  interiorAt(p: P3): string | null;
  playerFeet(): P3;
  /** Quest-derived liveness (ruling 3). */
  sectionLive(def: StealthSectionDef): boolean;
  exitArmed(def: StealthSectionDef): boolean;
  guards(def: StealthSectionDef): readonly ActorId[];
  /** Thread 5's `enemies.perception.state(actorId)`. */
  guardState(id: ActorId): GuardPerceptionState | null;
  /** `enemies.reset(group)` then `spawnGroup(group)` for each of the section's groups. */
  resetGuards(def: StealthSectionDef): void;
  /**
   * Turns an observer-only guard toward a point and holds it there (pausing its patrol) until called with null.
   * Optional: thread 5's `enemies.perception.face` when present.
   */
  face?(actorId: ActorId, at: P3 | null): void;
  /** `waystones.safeTeleport` (fade, freeze, ground wait); resolves false when the player was not moved. */
  teleport(feet: P3, yaw: number): Promise<boolean>;
  /** True while a save is loading (the director skips ticks between the load teleport and `save.loaded`). */
  paused(): boolean;
  suspend(reason: string): () => void;
  checkpointSave(reason: string): void;
  emit: {
    section(sectionId: string, phase: 'entered' | 'cleared' | 'exited'): void;
    alert(observerId: ActorId, sectionId: string, state: AlertState): void;
    noticed(observerId: ActorId, sectionId: string, level: number): void;
    caught(observerId: ActorId, sectionId: string, checkpointId: string): void;
    checkpoint(sectionId: string, checkpointId: string): void;
  };
  warn(message: string): void;
}

interface Active {
  def: StealthSectionDef;
  release: (() => void) | null;
}

export interface Eye {
  level: number;
  state: AlertState;
  observerId: ActorId | null;
}

const RANK: Record<AlertState, number> = { calm: 0, suspicious: 1, alerted: 2 };

/**
 * Stealth sections at runtime (plans/slice-2-stealth-chase.md sections 6 and 12): enter and leave by volume, ordered
 * checkpoints with a checkpoint save, per-guard alert levels, capture back to the checkpoint (never a quest
 * failure), hide spots and the load rule. Holds `save.suspend` only while a live section is active.
 */
export class StealthDirector {
  private active: Active | null = null;
  /** Reached checkpoint index per section id (persisted as checkpoint ids). */
  private readonly reached = new Map<string, number>();
  private readonly alerts = new Map<ActorId, GuardAlert>();
  private capturing = false;
  /** Bumped per capture or load teleport, so a stale promise never clears a newer one's flag. */
  private teleportGen = 0;
  /** Guards currently held facing a sighting (released on calm, leave, capture and dispose). */
  private readonly facing = new Set<ActorId>();
  /** Sections cleared this window: not re-entered until their quest window closes (no entered/cleared loop). */
  private readonly cleared = new Set<string>();
  private hiddenAt: string | null = null;
  private readonly eyeOut: Eye = { level: 0, state: 'calm', observerId: null };
  private disposed = false;

  constructor(
    private readonly defs: readonly StealthSectionDef[],
    private readonly ports: StealthPorts,
  ) {}

  get section(): StealthSectionDef | null {
    return this.active?.def ?? null;
  }

  get hidden(): boolean {
    return this.hiddenAt !== null;
  }

  /** The hide spot the player is in (null when not hidden). */
  get hiddenIn(): string | null {
    return this.hiddenAt;
  }

  /** Current checkpoint id for a section (null before its first). */
  checkpointOf(sectionId: string): string | null {
    const def = this.defs.find((d) => d.id === sectionId);
    const i = this.reached.get(sectionId);
    return def && i !== undefined ? (def.checkpoints[i]?.id ?? null) : null;
  }

  suspicion(observerId: ActorId): number {
    return this.ports.guardState(observerId)?.awareness ?? 0;
  }

  /** The HUD eye (thread 8 polls it per frame): the most alarmed guard of the live section; null outside one. */
  eye(): Eye | null {
    return this.active ? this.eyeOut : null;
  }

  fixedUpdate(dt: number): void {
    if (this.disposed || this.capturing || this.ports.paused()) return;
    for (const id of this.cleared) {
      const def = this.defs.find((d) => d.id === id);
      if (!def || !this.ports.sectionLive(def)) this.cleared.delete(id);
    }
    const feet = this.ports.playerFeet();
    const cur = this.active;
    if (cur) {
      const def = cur.def;
      if (!this.ports.sectionLive(def)) return this.leave('exited');
      if (this.ports.exitArmed(def) && insideVolume(def.exit, this.ports.find, feet)) return this.leave('cleared');
      if (!this.inside(def, feet)) return this.leave('exited');
      this.updateCheckpoints(def, feet);
      this.updateGuards(def, dt);
      return;
    }
    for (const def of this.defs) {
      if (!this.cleared.has(def.id) && this.ports.sectionLive(def) && this.inside(def, feet)) {
        this.enter(def);
        this.updateCheckpoints(def, feet);
        return;
      }
    }
  }

  private inside(def: StealthSectionDef, feet: P3): boolean {
    return insideSection(def, this.ports.find, this.ports.interiorAt, feet);
  }

  private enter(def: StealthSectionDef): void {
    this.active = { def, release: this.ports.suspend(`stealth:${def.id}`) };
    this.alerts.clear();
    this.resetEye();
    this.ports.emit.section(def.id, 'entered');
  }

  private leave(phase: 'cleared' | 'exited'): void {
    const cur = this.active;
    if (!cur) return;
    this.active = null;
    this.releaseFacing();
    this.hiddenAt = null;
    this.alerts.clear();
    cur.release?.();
    if (phase === 'cleared') this.cleared.add(cur.def.id);
    this.ports.emit.section(cur.def.id, phase);
  }

  private updateCheckpoints(def: StealthSectionDef, feet: P3): void {
    const have = this.reached.get(def.id) ?? -1;
    // Forward only: the furthest checkpoint box the player stands in, beyond the one already reached.
    for (let i = def.checkpoints.length - 1; i > have; i--) {
      if (insideVolume(def.checkpoints[i].volume, this.ports.find, feet)) {
        this.reached.set(def.id, i);
        const id = def.checkpoints[i].id;
        // Store, release our own hold, save, take it again (game-events-and-flags.md section 6).
        const cur = this.active;
        if (cur?.def === def) {
          cur.release?.();
          cur.release = null;
          this.ports.checkpointSave(`stealth:${id}`);
          cur.release = this.ports.suspend(`stealth:${def.id}`);
        }
        this.ports.emit.checkpoint(def.id, id);
        return;
      }
    }
  }

  private updateGuards(def: StealthSectionDef, dt: number): void {
    this.resetEye();
    for (const id of this.ports.guards(def)) {
      const st = this.ports.guardState(id);
      if (!st) continue;
      const prev = this.alerts.get(id) ?? CALM;
      const { next, caught } = stepAlert(prev, { awareness: st.awareness, sees: st.sees, distance: st.distance }, dt);
      this.alerts.set(id, next);
      if (next.state !== prev.state) this.ports.emit.alert(id, def.id, next.state);
      // A suspicious (or alerted) guard turns toward where it last sensed the player; calm again, it resumes its patrol.
      if (next.state !== 'calm' && (st.sees || st.hears)) {
        this.facing.add(id);
        this.ports.face?.(id, this.ports.playerFeet());
      } else if (next.state === 'calm' && this.facing.delete(id)) this.ports.face?.(id, null);
      if (RANK[next.state] > RANK[this.eyeOut.state] || (next.state === this.eyeOut.state && st.awareness > this.eyeOut.level)) {
        this.eyeOut.state = next.state;
        this.eyeOut.level = st.awareness;
        this.eyeOut.observerId = id;
      }
      if (caught) return this.capture(id);
    }
  }

  private releaseFacing(): void {
    for (const id of this.facing) this.ports.face?.(id, null);
    this.facing.clear();
  }

  private resetEye(): void {
    this.eyeOut.level = 0;
    this.eyeOut.state = 'calm';
    this.eyeOut.observerId = null;
  }

  /** Thread 5's `ai.spotted` for the player (contract: maps to `stealth.noticed`). */
  onSpotted(observerId: ActorId): void {
    const cur = this.active;
    if (!cur || this.capturing || !this.ports.guards(cur.def).includes(observerId)) return;
    this.ports.emit.noticed(observerId, cur.def.id, 1);
  }

  /** The player hit a watch guard of the live section: counts as caught (ruling, should-fix 6). */
  onPlayerHitGuard(observerId: ActorId): void {
    const cur = this.active;
    if (!cur || this.capturing || !this.ports.guards(cur.def).includes(observerId)) return;
    this.capture(observerId);
  }

  private capture(observerId: ActorId): void {
    const cur = this.active;
    if (!cur) return;
    const def = cur.def;
    const i = this.reached.get(def.id) ?? 0;
    const cp = def.checkpoints[i] ?? def.checkpoints[0];
    const anchor = cp ? this.ports.find(cp.anchor) : undefined;
    this.ports.emit.caught(observerId, def.id, cp?.id ?? '');
    // Every guard that was not calm goes calm with the reset (music and HUD readers follow).
    for (const [id, a] of this.alerts) if (a.state !== 'calm') this.ports.emit.alert(id, def.id, 'calm');
    this.hiddenAt = null;
    this.alerts.clear();
    this.releaseFacing();
    this.resetEye();
    if (!anchor) {
      this.ports.warn(`stealth: capture in ${def.id} has no checkpoint anchor`);
      return;
    }
    // A capture is not an exit: the hold stays, the section stays active, no checkpoint save.
    this.ports.resetGuards(def);
    this.teleportTo(anchor, 'capture');
  }

  private teleportTo(anchor: Anchor, why: string): void {
    const gen = ++this.teleportGen;
    this.capturing = true;
    this.ports
      .teleport(anchor.position, anchor.yaw)
      .then((ok) => {
        if (!ok) this.ports.warn(`stealth: ${why} teleport did not move the player`);
      })
      .catch((err) => this.ports.warn(`stealth: ${why} teleport failed: ${String(err)}`))
      .finally(() => {
        if (gen === this.teleportGen) this.capturing = false;
      });
  }

  /** F on a hide spot of the live section; false when it is not one, mid-capture, or an alerted guard is watching. */
  hide(spotId: string): boolean {
    const cur = this.active;
    if (!cur || this.capturing || !cur.def.hideSpots.some((h) => h.id === spotId)) return false;
    // No hiding in plain view: a guard already alerted and watching keeps the player.
    for (const [id, a] of this.alerts) if (a.state === 'alerted' && this.ports.guardState(id)?.sees) return false;
    this.hiddenAt = spotId;
    return true;
  }

  unhide(): void {
    this.hiddenAt = null;
  }

  hideSpotAnchor(spotId: string): Anchor | undefined {
    for (const d of this.defs) {
      const h = d.hideSpots.find((s) => s.id === spotId);
      if (h) return this.ports.find(h.anchor);
    }
    return undefined;
  }

  /** `stealth` v1 data: checkpoint ids per section. */
  serialize(): { checkpoints: Record<string, string> } {
    const checkpoints: Record<string, string> = {};
    for (const [sid, i] of this.reached) {
      const id = this.defs.find((d) => d.id === sid)?.checkpoints[i]?.id;
      if (id) checkpoints[sid] = id;
    }
    return { checkpoints };
  }

  /** Applies saved data; unknown sections or checkpoints are dropped with a warning. */
  load(data: unknown): void {
    this.reached.clear();
    const map = (data as { checkpoints?: unknown } | null)?.checkpoints;
    if (!map || typeof map !== 'object') return;
    for (const [sid, cid] of Object.entries(map as Record<string, unknown>)) {
      const def = this.defs.find((d) => d.id === sid);
      const i = def ? def.checkpoints.findIndex((c) => c.id === cid) : -1;
      if (i < 0) this.ports.warn(`stealth: dropping unknown checkpoint ${sid}/${String(cid)}`);
      else this.reached.set(sid, i);
    }
  }

  /**
   * The load rule (on `save.loaded`): end any active section (`exited`, the hold released), then, if the player loaded
   * inside a live section, reset its guards and teleport to its stored checkpoint (or its start). The next tick
   * re-enters it and emits `stealth.section entered` again.
   */
  onLoaded(): void {
    const cur = this.active;
    this.active = null;
    this.hiddenAt = null;
    this.alerts.clear();
    this.cleared.clear();
    cur?.release?.();
    if (cur) this.ports.emit.section(cur.def.id, 'exited');
    const feet = this.ports.playerFeet();
    for (const def of this.defs) {
      if (!this.ports.sectionLive(def) || !this.inside(def, feet)) continue;
      const cp = def.checkpoints[this.reached.get(def.id) ?? 0];
      const anchor = cp ? this.ports.find(cp.anchor) : undefined;
      if (!anchor) return;
      this.ports.resetGuards(def);
      this.teleportTo(anchor, 'load');
      return;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const cur = this.active;
    this.active = null;
    this.releaseFacing();
    cur?.release?.();
  }
}
