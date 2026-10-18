import { SafeTeleport } from './SafeTeleport';
import { WAYSTONE_TUNING } from './tuning';
import type { RespawnPoint, TravelResult, Vec3 } from './types';

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
}

export interface NetworkPorts {
  anchors: { withTag(tag: string): AnchorLike[]; find(id: string): AnchorLike | undefined };
  emit(event: string, payload: Record<string, unknown>): void;
  setFlag(key: string, value: boolean): void;
  context(): WaystoneContext;
  /** Heal HP and stamina; no flask refill, no enemy respawn. */
  restoreVitals(): void;
  requestSave(reason: 'waystone' | 'rest'): void;
  toast(key: string): void;
  playerFeet(): Vec3;
  playerYaw?(): number;
  teleport: SafeTeleport;
  log(level: 'warn' | 'info', msg: string): void;
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

  respawnPoint(): RespawnPoint {
    const id = this.respawnId;
    if (id !== null && this.lit.has(id)) {
      const a = this.anchor(id);
      if (a) return { waystoneId: id, feet: { ...a.position }, yaw: a.yaw };
    }
    const spawn = this.ports.anchors.find(WAYSTONE_TUNING.fallbackSpawnAnchor);
    if (spawn) return { waystoneId: null, feet: { ...spawn.position }, yaw: spawn.yaw };
    this.ports.log('warn', 'waystones: no respawn anchor, using origin');
    return { waystoneId: null, feet: { x: 0, y: 0, z: 0 }, yaw: 0 };
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
    if (this.busy || this.ports.teleport.active) return { ok: false, reason: 'busy' };
    const ctx = this.ports.context();
    if (ctx.dead) return { ok: false, reason: 'dead' };
    if (ctx.cutscene) return { ok: false, reason: 'cutscene' };
    if (ctx.dialogue) return { ok: false, reason: 'dialogue' };
    if (ctx.hostileAggro) return { ok: false, reason: 'in-combat' };
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
