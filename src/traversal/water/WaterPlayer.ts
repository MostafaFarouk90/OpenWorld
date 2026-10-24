// The player in the water (contracts v0.7 item 4; K7 PR 1): wading, the deep-water edge and the dive. Pure behind its
// ports, driven once per fixed tick in the `intent` phase, so a modifier or a vertical intent it sets applies to the
// same tick's move. The shared controller is touched only through K0's hooks (`setMoveMode`, `verticalSpeed`).
import type { MoveModifier } from '../../core/MoveModifiers';
import type { Vec3Like } from '../../core/events';
import type { MovementMode } from '../../movement/types';
import { DIVE_TUNING, WADE_TUNING, type WaterKind, type WaterVolumeDef } from '../../water/types';
import { DIVE_RULES, type DivePocketDef } from '../dive/types';
import { inArea, type WaterVolumes } from './WaterVolumes';

/** Seconds between two deep-water toasts (containment's spacing). */
export const DEEP_TOAST_SECONDS = 4;
export const DEEP_TOAST_KEY = 'water.deep.toast';
/** A feet jump above this in one tick that K7 did not cause is someone else's teleport (review B2). */
export const TELEPORT_JUMP = 5;

export const WADE_SOURCE = 'traversal.wade';
export const DIVE_SOURCE = 'traversal.dive';
export const DROWN_SOURCE = 'traversal.drown';

/** Wading speed scale: x 0.55, and the Fen Boots halve the slowdown (x 0.775): 2.48 and 3.49 m/s at the 4.5 walk. */
export function wadeScale(fenBoots: boolean): number {
  return fenBoots ? 1 - (1 - WADE_TUNING.speedScale) / 2 : WADE_TUNING.speedScale;
}

/** The Ashmare's cap at (x, z): its walk speed in any water, none on dry land (the mount takes the minimum of all caps). */
export function mountCapAt(volumes: WaterVolumes, x: number, z: number, walkSpeed: number): number {
  return volumes.depthAt(x, z) >= WADE_TUNING.minDepth ? walkSpeed : Infinity;
}

/** The dive's action locks: no attacks, block, dodge, Surge, abilities, mount, mercy or stealth sneak (review: keys). */
export const DIVE_LOCKS = [
  'attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'surge', 'surgeLeap',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6', 'mount', 'mercy', 'sneak', 'lockOn',
] as const;

export interface WaterPlayerPorts {
  feet(): Vec3Like;
  yaw(): number;
  grounded(): boolean;
  /** A teleport K7 makes (the expected position is remembered, so it never reads as someone else's). */
  teleport(p: Vec3Like, yaw?: number): void;
  setControllerMode(mode: 'walk' | 'swim'): void;
  setVerticalIntent(v: number | null): void;
  addModifier(source: string, mod: MoveModifier): () => void;
  movementMode(): MovementMode;
  setMovementMode(mode: MovementMode, safe?: { position: Vec3Like; yaw: number } | null): void;
  emit(type: 'water.entered' | 'water.left', p: { kind: WaterKind; volumeId: string }): void;
  emit(type: 'dive.started', p: { volumeId: string }): void;
  emit(type: 'dive.surfaced', p: { volumeId: string; pocketId: string | null }): void;
  emit(type: 'breath.changed', p: { value: number }): void;
  toast(key: string): void;
  fade(opacity: number, seconds: number): void;
  /** Rise held (the `jump` action), sink held (the `sprint` action: sprint is off in the water anyway). */
  rise(): boolean;
  sink(): boolean;
  /** True when the player gives movement input this tick. */
  moving(): boolean;
  /** On the Ashmare (a rider never enters dive water: it is pushed back like deep water). */
  mounted(): boolean;
  fenBoots(): boolean;
  /** Damages the player by `fraction` of max health, never below 1 HP. */
  hurtNonLethal(fraction: number): void;
  /** A walkable top within reach ahead of the swimmer, or null (forward and down rays). */
  probeLedge(feet: Vec3Like, yaw: number): Vec3Like | null;
  warn(message: string): void;
}

interface Drowning {
  t: number;
  placed: boolean;
}

export class WaterPlayer {
  private volumeId: string | null = null;
  private volumeKind: WaterKind | null = null;
  private wadeOff: (() => void) | null = null;
  private wadeScaleNow = 0;
  private lastGood: Vec3Like | null = null;
  private sinceToast = Infinity;
  private lastFeet: Vec3Like | null = null;
  private expected: Vec3Like | null = null;
  /** Ticks during which no dive may start (after an exit or a load). */
  private guard = 0;
  private readonly warned = new Set<string>();

  // Dive state.
  private diving = false;
  private diveVolume: string | null = null;
  private diveOff: (() => void) | null = null;
  private freezeOff: (() => void) | null = null;
  private breathLeft: number = DIVE_TUNING.breathSeconds;
  private shownBreath: number = DIVE_TUNING.breathSeconds;
  private headWasUnder = false;
  private entryStand: Vec3Like | null = null;
  private lastPocket: DivePocketDef | null = null;
  private drowning: Drowning | null = null;
  private blockedTicks = 0;

  constructor(
    private readonly volumes: WaterVolumes,
    private readonly ports: WaterPlayerPorts,
  ) {}

  get state(): 'dry' | 'wading' | 'diving' {
    return this.diving ? 'diving' : this.wadeOff ? 'wading' : 'dry';
  }

  get breath(): number {
    return this.breathLeft;
  }

  /** The point a save in dive mode stores (the last pocket's stand, else the entry stand). */
  get safeStand(): Vec3Like | null {
    return this.lastPocket?.stand ?? this.entryStand;
  }

  /** Call when K7 itself moves the player by another path (the ferry, the sled reset), so it never reads as a jump. */
  expect(p: Vec3Like): void {
    this.expected = { x: p.x, y: p.y, z: p.z };
  }

  fixedUpdate(dt: number): void {
    const f = this.ports.feet();
    const jumped = this.jumpedExternally(f);
    this.lastFeet = { x: f.x, y: f.y, z: f.z };
    this.sinceToast += dt;
    if (this.guard > 0) this.guard--;

    if (this.diving) {
      if (jumped) {
        // Someone else's teleport (a waystone, a cutscene): the dive ends where they put the player.
        this.exitDive(null);
        return;
      }
      this.tickDive(dt, f);
      return;
    }

    // Seated on the ferry, nothing here applies (the boat crosses the Mere's deep water).
    if (this.ports.movementMode() === 'ferry') {
      this.setWade(null);
      this.trackVolume(null);
      return;
    }

    const v = this.volumes.volumeAt(f);
    this.trackVolume(v);
    if (!v) {
      this.setWade(null);
      if (this.ports.grounded()) this.lastGood = { x: f.x, y: f.y, z: f.z };
      return;
    }
    const depth = v.surfaceY - f.y;
    if (v.kind === 'dive') {
      if (this.ports.mounted() && depth >= WADE_TUNING.minDepth) {
        this.pushBack(f);
        return;
      }
      if (f.y + DIVE_RULES.headHeight < v.surfaceY && this.guard === 0) {
        this.startDive(v);
        return;
      }
      this.setWade(depth >= WADE_TUNING.minDepth && !this.ports.mounted() ? wadeScale(this.ports.fenBoots()) : null);
      return;
    }
    if (v.kind === 'deep' || depth > WADE_TUNING.maxDepth) {
      this.pushBack(f);
      return;
    }
    // A rider is slowed by the mount's speed cap (the Ashmare walks); the wade scale would multiply on top of it.
    if (depth >= WADE_TUNING.minDepth && !this.ports.mounted()) {
      this.setWade(wadeScale(this.ports.fenBoots()));
    } else {
      this.setWade(null);
    }
    if (this.ports.grounded()) this.lastGood = { x: f.x, y: f.y, z: f.z };
  }

  /** `save.loaded`: everything K7 holds on the player goes, and no dive starts this tick or the next (review B2). */
  reset(): void {
    if (this.diving) this.ports.emit('breath.changed', { value: DIVE_TUNING.breathSeconds });
    this.endDiveState();
    this.setWade(null);
    if (this.volumeId) {
      this.ports.emit('water.left', { kind: this.volumeKind!, volumeId: this.volumeId });
      this.volumeId = null;
      this.volumeKind = null;
    }
    this.lastGood = null;
    this.lastFeet = null;
    this.expected = null;
    this.guard = 2;
  }

  /** A flag changed (D05's sluices): a last pocket that left the active set is remapped, and the safe point with it. */
  onFlagsChanged(): void {
    if (!this.diving) return;
    const active = this.volumes.activePockets();
    if (this.lastPocket && !active.some((p) => p.id === this.lastPocket!.id)) {
      const from = this.lastPocket.stand;
      let best: DivePocketDef | null = null;
      let bestD = Infinity;
      for (const p of active) {
        const d = Math.hypot(p.stand.x - from.x, p.stand.y - from.y, p.stand.z - from.z);
        if (d < bestD) {
          best = p;
          bestD = d;
        }
      }
      this.lastPocket = best;
      if (!best) {
        const r = this.volumes.activeRoutes()[0];
        if (r) this.entryStand = r.entryStand;
      }
      this.publishSafePoint();
    }
  }

  // ---------------------------------------------------------------------------------------------- the dive

  private startDive(v: WaterVolumeDef): void {
    const route = this.volumes.activeRoutes().find((r) => r.volumeId === v.id);
    this.entryStand = route?.entryStand ?? this.lastGood;
    if (!route) this.warnOnce(`water: dive volume "${v.id}" has no registered route; the entry stand falls back to the last dry point`);
    this.lastPocket = null;
    this.diving = true;
    this.diveVolume = v.id;
    // The mode first, the same tick (K6b's leech reads it), then the controller and the locks.
    this.publishSafePoint();
    this.setWade(null);
    this.ports.setControllerMode('swim');
    this.diveOff?.();
    this.diveOff = this.ports.addModifier(DIVE_SOURCE, {
      speedScale: DIVE_TUNING.swimSpeed / 4.5,
      noSprint: true,
      lockActions: DIVE_LOCKS,
    });
    this.breathLeft = DIVE_TUNING.breathSeconds;
    this.shownBreath = DIVE_TUNING.breathSeconds;
    this.headWasUnder = true;
    this.blockedTicks = 0;
    this.ports.emit('dive.started', { volumeId: v.id });
    this.ports.emit('breath.changed', { value: DIVE_TUNING.breathSeconds });
  }

  private tickDive(dt: number, f: Vec3Like): void {
    if (this.drowning) {
      this.tickDrowning(dt);
      return;
    }
    // The volume the swimmer is in now: a sluice may have swapped the set (a lower surface takes over).
    const here = this.volumes.volumeAt(f);
    let v = here && here.kind === 'dive' ? here : null;
    if (!v) {
      const cur = this.diveVolume ? this.volumes.get(this.diveVolume) : undefined;
      if (cur && this.volumes.isActive(cur) && inArea(cur.area, f.x, f.z) && f.y < cur.surfaceY + 0.5) v = cur;
    }
    if (!v) {
      this.exitDive(null);
      return;
    }
    if (v.id !== this.diveVolume) this.diveVolume = v.id;
    const surface = v.surfaceY;
    const headUnder = f.y + DIVE_RULES.headHeight < surface;

    let pocketId: string | null = null;
    if (headUnder) {
      this.breathLeft = Math.max(0, this.breathLeft - dt);
    } else {
      // Head out: one refill, and the nearest pocket within reach becomes the last pocket (same tick, one refill).
      this.breathLeft = DIVE_TUNING.breathSeconds;
      const pocket = this.nearestPocket(f);
      if (pocket) {
        pocketId = pocket.id;
        if (this.lastPocket?.id !== pocket.id) {
          this.lastPocket = pocket;
          this.publishSafePoint();
        }
      }
      if (this.headWasUnder) this.ports.emit('dive.surfaced', { volumeId: v.id, pocketId });
    }
    this.headWasUnder = headUnder;
    this.emitBreath();

    if (this.breathLeft <= 0) {
      this.startDrowning();
      return;
    }

    // Leaving: standing in shallow water with the head out (on ground, not slid up a steep bank), or climbing out at a ledge.
    const depth = surface - f.y;
    if (!headUnder && depth < DIVE_RULES.standDepth && this.ports.grounded()) {
      this.exitDive(pocketId);
      return;
    }
    if (!headUnder && this.ports.moving()) {
      const moved = this.prevSwim ? Math.hypot(f.x - this.prevSwim.x, f.z - this.prevSwim.z) : Infinity;
      this.blockedTicks = moved < 0.01 ? this.blockedTicks + 1 : 0;
      if (this.blockedTicks >= DIVE_RULES.ledgeBlockedTicks) {
        const top = this.ports.probeLedge(f, this.ports.yaw());
        this.blockedTicks = 0;
        if (top && top.y > f.y && top.y - f.y <= DIVE_RULES.ledgeMaxRise) {
          this.ownTeleport(top);
          this.exitDive(pocketId);
          return;
        }
      }
    } else {
      this.blockedTicks = 0;
    }
    this.prevSwim = { x: f.x, y: f.y, z: f.z };

    // Vertical: rise and sink at the swim speed, never above the head-out line.
    const line = surface - DIVE_RULES.headOutDepth;
    let vy = this.ports.rise() ? DIVE_TUNING.swimSpeed : this.ports.sink() ? -DIVE_TUNING.swimSpeed : 0;
    if (vy > 0 && f.y >= line) vy = 0;
    // Above the line (just jumped in, or a sluice lowered the surface): settle back to it, no faster than a sink.
    if (f.y > line + 0.02 && vy >= 0) vy = Math.max(-DIVE_TUNING.swimSpeed, (line - f.y) / Math.max(dt, 1e-6));
    this.ports.setVerticalIntent(vy);
  }

  private prevSwim: Vec3Like | null = null;

  private startDrowning(): void {
    this.drowning = { t: 0, placed: false };
    this.freezeOff?.();
    this.freezeOff = this.ports.addModifier(DROWN_SOURCE, { freeze: true });
    this.ports.setVerticalIntent(0);
    this.ports.hurtNonLethal(DIVE_RULES.drownDamageFraction);
    this.ports.fade(1, DIVE_RULES.drownFadeSeconds);
  }

  private tickDrowning(dt: number): void {
    const d = this.drowning!;
    d.t += dt;
    if (d.placed || d.t < DIVE_RULES.drownFadeSeconds) return;
    d.placed = true;
    // Read now, not when the drowning began: a sluice may have remapped the pocket during the fade.
    const stand = this.safeStand;
    // On the probed ground, never inside it (the stand's height may come from a provisional copy of K1's numbers). The
    // probe starts 1 m up, under any ceiling a player fits beneath (K3's interior ledges), so it never lands on a roof.
    if (stand) this.ownTeleport({ x: stand.x, y: Math.max(stand.y, this.volumes.groundAt(stand.x, stand.z, stand.y + 1) + 0.05), z: stand.z });
    else this.warnOnce('water: a drowning found no stand point; the player stays where they are');
    this.exitDive(null);
    this.ports.fade(0, 0.4);
  }

  private exitDive(pocketId: string | null): void {
    if (!this.diving) return;
    const volumeId = this.diveVolume ?? '';
    // A head-out already sent `dive.surfaced` for this surfacing (a stand or ledge exit): one event, not two.
    const surfacedSent = !this.headWasUnder;
    this.endDiveState();
    if (this.ports.movementMode() === 'dive') this.ports.setMovementMode('walk');
    this.ports.emit('breath.changed', { value: DIVE_TUNING.breathSeconds });
    if (!surfacedSent) this.ports.emit('dive.surfaced', { volumeId, pocketId });
    this.guard = 2;
  }

  /** Drops every piece of dive state on the player (controller mode, vertical intent, modifiers). */
  private endDiveState(): void {
    // A drowning cut short (a load, another system's teleport) never sent its fade back in: send it, or the screen stays black.
    if (this.drowning && !this.drowning.placed) this.ports.fade(0, 0.4);
    if (this.diving || this.diveOff || this.freezeOff) {
      this.ports.setControllerMode('walk');
      this.ports.setVerticalIntent(null);
    }
    this.diveOff?.();
    this.diveOff = null;
    this.freezeOff?.();
    this.freezeOff = null;
    this.diving = false;
    this.diveVolume = null;
    this.drowning = null;
    this.lastPocket = null;
    this.entryStand = null;
    this.breathLeft = DIVE_TUNING.breathSeconds;
    this.shownBreath = DIVE_TUNING.breathSeconds;
    this.prevSwim = null;
    this.blockedTicks = 0;
  }

  private publishSafePoint(): void {
    const s = this.safeStand;
    this.ports.setMovementMode('dive', s ? { position: { x: s.x, y: s.y, z: s.z }, yaw: this.ports.yaw() } : null);
  }

  private nearestPocket(f: Vec3Like): DivePocketDef | null {
    let best: DivePocketDef | null = null;
    let bestD: number = DIVE_RULES.pocketRadius;
    for (const p of this.volumes.activePockets()) {
      const d = Math.hypot(p.at.x - f.x, p.at.z - f.z);
      if (d <= bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private emitBreath(): void {
    const shown = Math.ceil(this.breathLeft);
    if (shown !== this.shownBreath) {
      this.shownBreath = shown;
      this.ports.emit('breath.changed', { value: shown });
    }
  }

  // ---------------------------------------------------------------------------------------------- wading and the edge

  private setWade(scale: number | null): void {
    if (scale === null) {
      this.wadeOff?.();
      this.wadeOff = null;
      this.wadeScaleNow = 0;
      return;
    }
    if (this.wadeOff && this.wadeScaleNow === scale) return;
    this.wadeOff?.();
    this.wadeScaleNow = scale;
    this.wadeOff = this.ports.addModifier(WADE_SOURCE, { speedScale: scale, noSprint: true });
  }

  private pushBack(f: Vec3Like): void {
    this.setWade(null);
    if (!this.lastGood) {
      this.warnOnce('water: the player is in deep water with no dry point to return to');
      return;
    }
    this.ownTeleport(this.lastGood);
    if (this.sinceToast >= DEEP_TOAST_SECONDS) {
      this.sinceToast = 0;
      this.ports.toast(DEEP_TOAST_KEY);
    }
    void f;
  }

  private trackVolume(v: WaterVolumeDef | null): void {
    const id = v?.id ?? null;
    if (id === this.volumeId) return;
    if (this.volumeId) this.ports.emit('water.left', { kind: this.volumeKind!, volumeId: this.volumeId });
    this.volumeId = id;
    this.volumeKind = v?.kind ?? null;
    if (v) this.ports.emit('water.entered', { kind: v.kind, volumeId: v.id });
  }

  // ---------------------------------------------------------------------------------------------- teleports

  private ownTeleport(p: Vec3Like): void {
    this.expect(p);
    this.ports.teleport(p, this.ports.yaw());
  }

  private jumpedExternally(f: Vec3Like): boolean {
    const ref = this.expected ?? this.lastFeet;
    this.expected = null;
    if (!ref) return false;
    return Math.hypot(f.x - ref.x, f.y - ref.y, f.z - ref.z) > TELEPORT_JUMP;
  }

  private warnOnce(m: string): void {
    if (this.warned.has(m)) return;
    this.warned.add(m);
    this.ports.warn(m);
  }
}
