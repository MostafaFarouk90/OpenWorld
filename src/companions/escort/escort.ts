// Gaut's mounted escort for M11 (approved invention, Q11; plans/act2-A5.md sections 1.7 and 8). A12 drives it from the
// quest: `start` with A1's Cinder Road polyline, `dismount` before each ambush, `remount`, `stop`. Gaut's NPC is hidden
// while it runs (`npcs.setHidden`); the two Halvard riders are scenery only (no actors, colliders or interactables).
// Not saved: a load stops it and the quest starts it again from its own state.
import type * as THREE from 'three';
import type { GameEvents } from '../../core/events';
import type { NpcDef, NpcModelLoader } from '../../npcs/types';
import type { Vec3 } from '../FollowModel';
import '../events';
import { EscortColumn, Route, type ColumnPose, type EscortPhase } from './EscortColumn';
import { EscortRider, type HorseLoader } from './escortHorse';

export interface EscortStart {
  id: string;
  /** The road polyline (A1's exported Cinder Road points), at least two distinct points. */
  route: readonly Vec3[];
  /** Halvard riders behind Gaut (0 to 2). */
  riders?: number;
  /** The NPC Gaut's figure stands in for (hidden while the escort runs). Default `gaut`. */
  leaderNpcId?: string;
}

export interface EscortService {
  start(o: EscortStart): boolean;
  /** The scripted dismount for all three; resolves when they stand (at once when not riding). */
  dismount(): Promise<void>;
  /** After the dismount has finished; refused while riding or mid-dismount. */
  remount(): boolean;
  stop(): boolean;
  active(): { id: string; phase: EscortPhase } | null;
}

export const GAUT_RIDER: NpcDef = {
  id: 'gaut',
  nameKey: 'npc.gaut.name',
  model: 'knight',
  scale: 1,
  tint: 0x9aa0a8,
  dialogueId: 'npc-gaut',
  idleClip: 'Idle',
};

/** Halvard blue, as the yard veterans wear. */
export const HALVARD_RIDER: NpcDef = { ...GAUT_RIDER, id: 'halvard-rider', nameKey: 'npc.gaut.name', tint: 0x4a5f86 };

export interface EscortPorts {
  events: GameEvents;
  scene: THREE.Object3D;
  playerFeet(): { x: number; y: number; z: number };
  /** Ground under (x, z) near height `yHint` (a down-ray, then the terrain); null when unknown. */
  groundAt(x: number, z: number, yHint: number): number | null;
  setNpcHidden(id: string, hidden: boolean): void;
  horses(): HorseLoader | null;
  npcs(): NpcModelLoader | null;
  warn?(m: string): void;
}

interface Running {
  id: string;
  leader: string;
  column: EscortColumn;
  figures: EscortRider[];
  waiters: (() => void)[];
}

export class Escort implements EscortService {
  private run: Running | null = null;
  private readonly offs: (() => void)[];
  /** The companions save entry loaded (and stopped the old run) ahead of this `save.loaded`. */
  private loadBegun = false;

  constructor(private readonly p: EscortPorts) {
    this.offs = [
      p.events.on('save.loaded', () => {
        // A save without the companions entry predates Act 2: nothing restarts an escort from it.
        if (!this.loadBegun) this.stop();
        this.loadBegun = false;
      }),
    ];
  }

  /** Called from the companions save entry's load, before `save.loaded`: ends the run from before the load. */
  beginLoad(): void {
    this.stop();
    this.loadBegun = true;
  }

  active(): { id: string; phase: EscortPhase } | null {
    return this.run ? { id: this.run.id, phase: this.run.column.phase } : null;
  }

  /** Gaut and the riders, for tests. */
  poses(): ColumnPose[] {
    return this.run ? this.run.column.poses() : [];
  }

  figures(): readonly EscortRider[] {
    return this.run?.figures ?? [];
  }

  start(o: EscortStart): boolean {
    if (this.run || !o || typeof o.id !== 'string' || !o.id || !Array.isArray(o.route)) return false;
    const route = new Route(o.route.filter((q) => q && [q.x, q.y, q.z].every(Number.isFinite)));
    if (!route.valid) return false;
    const riders = Math.max(0, Math.min(2, Math.floor(o.riders ?? 2)));
    const feet = this.p.playerFeet();
    const column = new EscortColumn(route, feet);
    const figures = [new EscortRider(GAUT_RIDER)];
    for (let i = 0; i < riders; i++) figures.push(new EscortRider(HALVARD_RIDER));
    for (const f of figures) {
      this.p.scene.add(f.root);
      void f.load(this.p.horses(), this.p.npcs(), this.p.warn);
    }
    const leader = o.leaderNpcId ?? 'gaut';
    this.run = { id: o.id, leader, column, figures, waiters: [] };
    this.p.setNpcHidden(leader, true);
    this.place();
    this.p.events.emit('escort.started', { escortId: o.id });
    return true;
  }

  dismount(): Promise<void> {
    const r = this.run;
    if (!r || r.column.phase === 'dismounted') return Promise.resolve();
    r.column.dismount();
    return new Promise((resolve) => r.waiters.push(resolve));
  }

  remount(): boolean {
    const r = this.run;
    // Not mid-dismount: A12 awaits dismount() before an ambush, which must not start with the riders seated.
    if (!r || r.column.phase !== 'dismounted') return false;
    r.column.remount();
    for (const f of r.figures) f.seat(true);
    this.flush(r);
    this.p.events.emit('escort.remounted', { escortId: r.id });
    return true;
  }

  stop(): boolean {
    const r = this.run;
    if (!r) return false;
    this.run = null;
    for (const f of r.figures) f.dispose();
    this.flush(r);
    this.p.setNpcHidden(r.leader, false);
    this.p.events.emit('escort.stopped', { escortId: r.id });
    return true;
  }

  fixedUpdate(dt: number): void {
    const r = this.run;
    if (!r) return;
    if (r.column.tick(dt, this.p.playerFeet()) === 'dismounted') {
      for (const f of r.figures) f.seat(false);
      this.flush(r);
      this.p.events.emit('escort.dismounted', { escortId: r.id });
    }
    this.place();
    for (const f of r.figures) f.update(dt);
  }

  dispose(): void {
    this.stop();
    for (const off of this.offs.splice(0)) off();
  }

  private flush(r: Running): void {
    for (const w of r.waiters.splice(0)) w();
  }

  private place(): void {
    const r = this.run;
    if (!r) return;
    const poses = r.column.poses();
    r.figures.forEach((f, i) => {
      const q = poses[i];
      if (!q) return;
      const y = this.p.groundAt(q.x, q.z, this.p.playerFeet().y);
      f.root.position.set(q.x, y !== null && Number.isFinite(y) ? y : q.y, q.z);
      f.root.rotation.y = q.yaw;
      f.setSpeed(r.column.phase === 'riding' ? q.speed : 0);
    });
  }
}

declare module '../../core/Services' {
  interface GameServices {
    /** A5's mounted escort (M11). */
    escort: EscortService;
  }
}
