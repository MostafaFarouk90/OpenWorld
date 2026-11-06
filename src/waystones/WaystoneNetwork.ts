import { SafeTeleport } from './SafeTeleport';
import { WAYSTONE_TUNING } from './tuning';
import type { CheckpointSave, PlacementKind, PlacementRule, PlacementTarget, RespawnPoint, TravelResult, Vec3 } from './types';

export interface AnchorLike {
  id: string;
  position: Vec3;
  yaw: number;
  tags?: string[];
}

export interface WaystoneContext {
  dead: boolean;
  cutscene: boolean;
  dialogue: boolean;
  /** A hostile actor is aggroed on the player within the rest radius. */
  hostileAggro: boolean;
  /** Flag `tutorial.heartshard-awakened`. */
  heartshard: boolean;
  /** Flag `waystone.allowRestInCombat`. */
  allowRestInCombat: boolean;
  /** v0.7: the movement mode refuses fast travel (gliding, the ferry, a dive); absent reads false. */
  movementRefuses?: boolean;
}

export interface NetworkPorts {
  anchors: { withTag(tag: string): AnchorLike[]; find(id: string): AnchorLike | undefined };
  emit(event: string, payload: Record<string, unknown>): void;
  setFlag(key: string, value: boolean): void;
  context(): WaystoneContext;
  /** Heal HP and stamina; no flask refill, no enemy respawn. */
  /** `quiet` (the inn) skips the waystone toast and prompt. */
  restoreVitals(opts?: { quiet?: boolean }): void;
  requestSave(reason: 'waystone' | 'rest'): void;
  toast(key: string): void;
  playerFeet(): Vec3;
  playerYaw?(): number;
  teleport: SafeTeleport;
  log(level: 'warn' | 'info', msg: string): void;
  /** v0.8: the stone is dark now (WAYSTONE_DARK); a dark stone is skipped for respawn and refuses travel. Absent: none. */
  dark?(id: string): boolean;
  /** v0.8: where a death goes when its stone is dark (the M41 camp or the refuge); absent or undefined: the fallback spawn. */
  darkRespawn?(): AnchorLike | undefined;
}

export interface WaystoneSave {
  lit: string[];
  lastRest: string | null;
  respawn: string | null;
}

export type RekindleResult =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'already-lit' | 'cold' | 'dead' | 'cutscene' | 'dialogue' };

export type RestResult =
  | { ok: true }
  | { ok: false; reason: 'unknown' | 'not-lit' | 'in-combat' | 'dead' | 'cutscene' | 'dialogue' };

const PREFIX = 'waystone.';

const VALID_ID = /^[A-Za-z0-9_-]{1,63}$/;

function nameOf(anchorId: string): string {
  return anchorId.startsWith(PREFIX) ? anchorId.slice(PREFIX.length) : anchorId;
}

export class WaystoneNetwork {
  private readonly lit = new Set<string>();
  private lastRest: string | null = null;
  private respawnId: string | null = null;
  private busy = false;
  private readonly rules: PlacementRule[] = [];
  /** Interior checkpoints in the order set (the last set wins). */
  private readonly checkpoints = new Map<string, string>();
  /**
   * L13: `respawn` was applied in the load now running. A save applies its entries in the file's key order, and a
   * key-sorted file (every committed fixture) has `respawn` before `waystones`, so `load` must not clear what `respawn`
   * just set. Reset by `loadSettled` on `save.loaded`.
   */
  private checkpointsLoaded = false;

  constructor(private readonly ports: NetworkPorts) {}

  /** Waystone ids (anchor name without the `waystone.` prefix) currently defined by anchors. */
  ids(): string[] {
    return this.ports.anchors.withTag('waystone').map((a) => nameOf(a.id));
  }

  anchor(id: string): AnchorLike | undefined {
    return this.ports.anchors.find(PREFIX + id);
  }

  isLit(id: string): boolean {
    return this.lit.has(id) && this.anchor(id) !== undefined;
  }

  litIds(): string[] {
    return this.ids().filter((id) => this.lit.has(id));
  }

  /** Mark stones the anchors declare pre-lit (tag `waystone-lit`). Silent: no events, no saves. */
  applyPreLit(): void {
    for (const a of this.ports.anchors.withTag('waystone-lit')) {
      this.lit.add(nameOf(a.id));
      this.ports.setFlag(`${a.id}.lit`, true);
    }
  }

  get travelling(): boolean {
    return this.busy || this.ports.teleport.active;
  }

  rekindle(id: string, cause: 'player' | 'script' = 'player'): RekindleResult {
    if (!this.anchor(id)) return { ok: false, reason: 'unknown' };
    if (this.lit.has(id)) return { ok: false, reason: 'already-lit' };
    const ctx = this.ports.context();
    if (cause === 'player') {
      if (ctx.dead) return { ok: false, reason: 'dead' };
      if (ctx.cutscene) return { ok: false, reason: 'cutscene' };
      if (ctx.dialogue) return { ok: false, reason: 'dialogue' };
      if (!ctx.heartshard) {
        this.ports.toast('waystone.cold');
        return { ok: false, reason: 'cold' };
      }
    }
    this.lit.add(id);
    this.respawnId = id;
    this.ports.setFlag(`${PREFIX}${id}.lit`, true);
    this.ports.emit('waystone.rekindled', { waystoneId: id, cause });
    this.ports.emit('discover', { placeId: `waystone.${id}`, kind: 'waystone' });
    this.ports.requestSave('waystone');
    return { ok: true };
  }

  /** Why a rest is impossible right now (dead, cutscene, dialogue, hostiles near), or null. Waystone rests share it. */
  canRestNow(): 'dead' | 'cutscene' | 'dialogue' | 'in-combat' | null {
    const ctx = this.ports.context();
    if (ctx.dead) return 'dead';
    if (ctx.cutscene) return 'cutscene';
    if (ctx.dialogue) return 'dialogue';
    if (ctx.hostileAggro && !ctx.allowRestInCombat) return 'in-combat';
    return null;
  }

  /**
   * A rest away from any waystone (the inn). Heals and saves like a waystone rest but never touches `respawnId` or
   * `lastRest`, and the `rest` event carries only `placeId`, so a later death respawns at the last rested waystone.
   */
  restAt(placeId: string): { ok: true } | { ok: false; reason: 'dead' | 'cutscene' | 'dialogue' | 'in-combat' } {
    const blocked = this.canRestNow();
    if (blocked) {
      if (blocked === 'in-combat') this.ports.toast('waystone.foesNear');
      return { ok: false, reason: blocked };
    }
    this.ports.restoreVitals({ quiet: true });
    this.ports.emit('rest', { placeId });
    this.ports.requestSave('rest');
    return { ok: true };
  }

  rest(id: string): RestResult {
    if (!this.anchor(id)) return { ok: false, reason: 'unknown' };
    if (!this.lit.has(id)) return { ok: false, reason: 'not-lit' };
    const ctx = this.ports.context();
    if (ctx.dead) return { ok: false, reason: 'dead' };
    if (ctx.cutscene) return { ok: false, reason: 'cutscene' };
    if (ctx.dialogue) return { ok: false, reason: 'dialogue' };
    if (ctx.hostileAggro && !ctx.allowRestInCombat) {
      this.ports.toast('waystone.foesNear');
      return { ok: false, reason: 'in-combat' };
    }
    this.ports.restoreVitals();
    this.lastRest = id;
    this.respawnId = id;
    this.ports.emit('rest', { waystoneId: id });
    this.ports.requestSave('rest');
    return { ok: true };
  }

  /**
   * v0.8 item 8: adds a placement rule (the no-strand rule). Every respawn point, load placement and safe teleport target
   * passes through the rules in order. Returns the undo.
   */
  addPlacementRule(rule: PlacementRule): () => void {
    this.rules.push(rule);
    return () => {
      const i = this.rules.indexOf(rule);
      if (i >= 0) this.rules.splice(i, 1);
    };
  }

  /** The target after every placement rule (a throwing rule is skipped with a warning). */
  place(target: PlacementTarget, kind: PlacementKind): PlacementTarget {
    let t: PlacementTarget = { feet: { ...target.feet }, yaw: target.yaw };
    for (const rule of [...this.rules]) {
      try {
        const next = rule(t, kind);
        if (next && Number.isFinite(next.feet.x) && Number.isFinite(next.feet.y) && Number.isFinite(next.feet.z)) t = { feet: { ...next.feet }, yaw: next.yaw };
      } catch (err) {
        this.ports.log('warn', `waystones: a placement rule failed (${String(err)}); skipped`);
      }
    }
    return t;
  }

  /** v0.8: while a checkpoint is set, a death respawns at its anchor (M39's stairs, M40's deep run), not at a stone. */
  setCheckpoint(id: string, anchorId: string): void {
    this.checkpoints.delete(id);
    this.checkpoints.set(id, anchorId);
  }

  clearCheckpoint(id: string): void {
    this.checkpoints.delete(id);
  }

  activeCheckpoint(): { id: string; anchorId: string } | null {
    const all = [...this.checkpoints];
    for (let i = all.length - 1; i >= 0; i--) if (this.ports.anchors.find(all[i][1])) return { id: all[i][0], anchorId: all[i][1] };
    return null;
  }

  isDark(id: string): boolean {
    return this.ports.dark?.(id) ?? false;
  }

  respawnPoint(): RespawnPoint {
    const cp = this.activeCheckpoint();
    if (cp) {
      const a = this.ports.anchors.find(cp.anchorId)!;
      // A checkpoint is inside an interior (150 m up): the rules exempt it, so it is returned as set.
      return { waystoneId: null, feet: { ...a.position }, yaw: a.yaw };
    }
    const id = this.respawnId;
    let p: RespawnPoint | null = null;
    if (id !== null && this.lit.has(id)) {
      const a = this.anchor(id);
      if (a && !this.isDark(id)) p = { waystoneId: id, feet: { ...a.position }, yaw: a.yaw };
      else if (a) {
        const d = this.ports.darkRespawn?.();
        if (d) p = { waystoneId: null, feet: { ...d.position }, yaw: d.yaw };
      }
    }
    if (!p) {
      const spawn = this.ports.anchors.find(WAYSTONE_TUNING.fallbackSpawnAnchor);
      if (spawn) p = { waystoneId: null, feet: { ...spawn.position }, yaw: spawn.yaw };
    }
    if (!p) {
      this.ports.log('warn', 'waystones: no respawn anchor, using origin');
      p = { waystoneId: null, feet: { x: 0, y: 0, z: 0 }, yaw: 0 };
    }
    const placed = this.place(p, 'respawn');
    const moved = placed.feet.x !== p.feet.x || placed.feet.y !== p.feet.y || placed.feet.z !== p.feet.z;
    return { waystoneId: moved ? null : p.waystoneId, feet: placed.feet, yaw: placed.yaw };
  }

  /** The load has settled (`save.loaded`): the next load's `waystones` entry clears the checkpoints again. */
  loadSettled(): void {
    this.checkpointsLoaded = false;
  }

  serializeCheckpoints(): CheckpointSave {
    return { checkpoints: [...this.checkpoints].map(([id, anchorId]) => ({ id, anchorId })) };
  }

  loadCheckpoints(data: unknown): void {
    this.checkpointsLoaded = true;
    this.checkpoints.clear();
    const list = (data as Partial<CheckpointSave> | null)?.checkpoints;
    if (!Array.isArray(list)) return;
    for (const c of list) {
      if (c && typeof c.id === 'string' && typeof c.anchorId === 'string' && c.id && c.anchorId) this.checkpoints.set(c.id, c.anchorId);
    }
  }

  async respawnPlayer(): Promise<void> {
    const p = this.respawnPoint();
    // A respawn takes over any travel in flight (the player died during it).
    await this.ports.teleport.start(p.feet, p.yaw, null, { takeover: true });
  }

  async travel(toId: string): Promise<TravelResult> {
    const dest = this.anchor(toId);
    if (!dest) return { ok: false, reason: 'unknown' };
    if (!this.lit.has(toId)) return { ok: false, reason: 'not-lit' };
    if (this.isDark(toId)) return { ok: false, reason: 'dark' };
    if (this.busy || this.ports.teleport.active) return { ok: false, reason: 'busy' };
    const ctx = this.ports.context();
    if (ctx.dead) return { ok: false, reason: 'dead' };
    if (ctx.cutscene) return { ok: false, reason: 'cutscene' };
    if (ctx.dialogue) return { ok: false, reason: 'dialogue' };
    if (ctx.hostileAggro) return { ok: false, reason: 'in-combat' };
    if (ctx.movementRefuses) return { ok: false, reason: 'movement' };
    const from = this.nearestId(this.ports.playerFeet());
    if (from === toId && this.dist2(this.ports.playerFeet(), dest.position) < 4) return { ok: false, reason: 'same' };

    // If the destination never becomes solid the player goes back to where they stood (known resident).
    const here = { ...this.ports.playerFeet() };
    this.busy = true;
    try {
      const res = await this.ports.teleport.start(dest.position, dest.yaw, {
        feet: here,
        yaw: this.ports.playerYaw?.() ?? 0,
      });
      if (!res.ok) return { ok: false, reason: res.reason === 'busy' ? 'busy' : 'terrain-not-ready' };
      this.ports.emit('fastTravel', { fromId: from ?? '', toId });
      this.ports.requestSave('waystone');
      return { ok: true };
    } finally {
      this.busy = false;
    }
  }

  private nearestId(p: Vec3): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of this.ids()) {
      const a = this.anchor(id);
      if (!a) continue;
      const d = this.dist2(p, a.position);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private dist2(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
  }

  /** Persistable data. Unknown/obsolete ids are kept as-is so a missing anchor loses nothing. */
  serialize(): WaystoneSave {
    return { lit: [...this.lit].sort(), lastRest: this.lastRest, respawn: this.respawnId };
  }

  /** Silent restore: sets state and flag mirrors, emits no gameplay events. */
  load(data: unknown): void {
    // v0.8: the checkpoints are their own entry (`respawn`); a save without it has none. Either order of the two entries works.
    if (!this.checkpointsLoaded) this.checkpoints.clear();
    this.lit.clear();
    this.lastRest = null;
    this.respawnId = null;
    if (typeof data !== 'object' || data === null) return;
    const d = data as Partial<WaystoneSave>;
    if (Array.isArray(d.lit)) {
      for (const id of d.lit) if (typeof id === 'string' && VALID_ID.test(id)) this.lit.add(id);
    }
    if (typeof d.lastRest === 'string' && VALID_ID.test(d.lastRest)) this.lastRest = d.lastRest;
    if (typeof d.respawn === 'string' && VALID_ID.test(d.respawn)) this.respawnId = d.respawn;
    for (const id of this.lit) this.ports.setFlag(`${PREFIX}${id}.lit`, true);
    this.applyPreLit();
  }
}
