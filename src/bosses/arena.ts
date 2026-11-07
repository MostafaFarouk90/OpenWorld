// The boss arena hook (contracts v0.9 item 7, plan Part 3.6): an arena is a set of named pieces (a floor, a platform,
// a lava level) an encounter drives by state, and that go back to their start on their own when the fight ends without an
// outcome (`boss.ended`) or a save loads. N3 builds the kit (the pieces' `apply` and `reset`); N6 PR 2 drives it from
// `boss.phase`. `phaseTeleport` moves the player (and the companions that follow a teleport) through the waystones'
// safe teleport, so a phase that changes the floor never leaves Cael inside a wall.
import type { Vec3 } from '../physics/PhysicsWorld';

export interface ArenaPiece {
  /** Puts the piece in `state` (the encounter's own words: 'risen', 'cracked', 'lava-2'). */
  apply(state: string): void;
  /** Back to the start. */
  reset(): void;
}

export interface ArenaDef {
  bossId: string;
  pieces: Readonly<Record<string, ArenaPiece>>;
}

export interface BossArenaService {
  /** Registers an arena. Throws on a duplicate id; returns the undo. */
  register(arenaId: string, def: ArenaDef): () => void;
  /** Sets one piece's state; false (with one warning) for an unknown arena or piece. */
  set(arenaId: string, pieceId: string, state: string): boolean;
  /** The piece's state now (undefined at its start or when unknown). */
  state(arenaId: string, pieceId: string): string | undefined;
  /** Resets every piece of an arena (also run on `boss.ended` for its boss and on `save.loaded`). */
  reset(arenaId: string): void;
  /** Moves the player to an anchor (safe teleport); false when the arena or anchor is unknown or nothing can teleport. */
  phaseTeleport(arenaId: string, anchorId: string): Promise<boolean>;
}

declare module '../core/Services' {
  interface GameServices {
    /** v0.9: provided by the Act 5 core plugin (caldera/act5Core.plugin.ts). */
    bossArena: BossArenaService;
  }
}

export interface BossArenaDeps {
  warn(m: string): void;
  emit?(e: { kind: 'piece'; arenaId: string; pieceId: string; state: string } | { kind: 'reset'; arenaId: string }): void;
  /** The anchor's pose, or undefined. */
  anchor?(id: string): { position: Vec3; yaw: number } | undefined;
  /** The waystones' safe teleport; absent (headless) means phaseTeleport answers false. */
  safeTeleport?(feet: Vec3, yaw: number): Promise<{ ok: boolean }>;
}

export class BossArenas implements BossArenaService {
  private readonly arenas = new Map<string, { def: ArenaDef; states: Map<string, string> }>();
  private readonly warned = new Set<string>();

  constructor(private readonly deps: BossArenaDeps) {}

  register(arenaId: string, def: ArenaDef): () => void {
    if (this.arenas.has(arenaId)) throw new Error(`bossArena: arena "${arenaId}" is already registered`);
    const entry = { def, states: new Map<string, string>() };
    this.arenas.set(arenaId, entry);
    return () => {
      if (this.arenas.get(arenaId) === entry) this.arenas.delete(arenaId);
    };
  }

  set(arenaId: string, pieceId: string, state: string): boolean {
    const a = this.arenas.get(arenaId);
    const piece = a?.def.pieces[pieceId];
    if (!a || !piece) {
      this.warnOnce(`${arenaId}/${pieceId}`, `bossArena: unknown ${a ? `piece "${pieceId}" in` : 'arena'} "${arenaId}"`);
      return false;
    }
    piece.apply(state);
    a.states.set(pieceId, state);
    this.deps.emit?.({ kind: 'piece', arenaId, pieceId, state });
    return true;
  }

  state(arenaId: string, pieceId: string): string | undefined {
    return this.arenas.get(arenaId)?.states.get(pieceId);
  }

  reset(arenaId: string): void {
    const a = this.arenas.get(arenaId);
    if (!a) return;
    for (const [id, piece] of Object.entries(a.def.pieces)) {
      try {
        piece.reset();
      } catch (e) {
        this.deps.warn(`bossArena: piece "${id}" of "${arenaId}" failed to reset (${String(e)})`);
      }
    }
    a.states.clear();
    this.deps.emit?.({ kind: 'reset', arenaId });
  }

  /** `boss.ended` for `bossId`: every arena of that boss resets. */
  onBossEnded(bossId: string): void {
    for (const [id, a] of this.arenas) if (a.def.bossId === bossId) this.reset(id);
  }

  /** `save.loaded`: every arena resets (a load mid-fight restarts the encounter from its start). */
  onLoaded(): void {
    for (const id of this.arenas.keys()) this.reset(id);
  }

  async phaseTeleport(arenaId: string, anchorId: string): Promise<boolean> {
    if (!this.arenas.has(arenaId)) {
      this.warnOnce(`tp:${arenaId}`, `bossArena: unknown arena "${arenaId}"`);
      return false;
    }
    const a = this.deps.anchor?.(anchorId);
    if (!a) {
      this.warnOnce(`tp:${anchorId}`, `bossArena: no anchor "${anchorId}" for "${arenaId}"`);
      return false;
    }
    if (!this.deps.safeTeleport) return false;
    const o = await this.deps.safeTeleport(a.position, a.yaw);
    return o.ok;
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.deps.warn(msg);
  }
}
