// Contracts v0.8 item 9: the scene sequencer. One scene runs at a time (others queue). Flag steps are buffered and written
// only at a checkpoint step or at the end (finished or skipped; a skip writes every flag the scene would have written). A
// cancel (the player's death) drops the flags since the last checkpoint. The persisted entry `{ id, checkpoint }` is
// written at each checkpoint (with a `zone` save) and cleared at the end, so a load replays from the last checkpoint and
// never writes a flag twice. Everything outside is a port, so the runner is tested headless.
import type { CameraShot } from '../rendering/ThirdPersonCamera';
import type { SavedScene, SceneDef, SceneEndReason, SceneStep } from './types';

type FlagValue = boolean | number | string;

export interface SceneRunnerPorts {
  setFlag(key: string, value: FlagValue): void;
  emit(event: 'scene.started' | 'scene.checkpoint' | 'scene.line' | 'scene.ended', payload: Record<string, unknown>): void;
  /** Holds autosave, pushes the `scene` movement mode and the `cutscene` input context; returns the release. */
  hold(): () => void;
  /** A `zone` save at a checkpoint: the hold is lifted for the save and taken again. */
  checkpointSave(): void;
  /** Camera and animation run only when this is true (canStage). */
  canStage(): boolean;
  shot(shot: CameraShot): { release(): void } | null;
  anim(who: string, clip: string): void;
  /** `player` through the safe teleport, an NPC through npcs.place. */
  move(who: string, to: string, yaw?: number): void;
  spawn(spawnerId: string): void;
  warn(msg: string): void;
}

interface Running {
  def: SceneDef;
  /** Index of the next step to run. */
  at: number;
  /** Seconds left on the current timed step. */
  wait: number;
  buffer: Map<string, FlagValue>;
  /** The last checkpoint reached (null: the start). */
  checkpoint: string | null;
  shot: { release(): void } | null;
  release: () => void;
  resolve: (r: SceneEndReason) => void;
}

export const DEFAULT_LINE_SECONDS = 3;

export class SceneRunner {
  private readonly defs = new Map<string, SceneDef>();
  private run: Running | null = null;
  private readonly queue: { id: string; from: string | null; resolve: (r: SceneEndReason) => void }[] = [];
  /** The persisted entry: what a save made now holds. */
  private entry: SavedScene | null = null;

  constructor(private readonly ports: SceneRunnerPorts) {}

  register(def: SceneDef): () => void {
    if (this.defs.has(def.id)) throw new Error(`scenes: duplicate scene "${def.id}"`);
    const cps = def.steps.filter((s): s is { checkpoint: string } => 'checkpoint' in s).map((s) => s.checkpoint);
    if (new Set(cps).size !== cps.length) throw new Error(`scenes: scene "${def.id}" repeats a checkpoint name`);
    this.defs.set(def.id, def);
    return () => {
      if (this.defs.get(def.id) === def) this.defs.delete(def.id);
    };
  }

  get active(): string | null {
    return this.run?.def.id ?? null;
  }

  play(id: string, from: string | null = null): Promise<SceneEndReason> {
    if (!this.defs.has(id)) {
      this.ports.warn(`scenes: unknown scene "${id}"`);
      return Promise.resolve('cancelled');
    }
    return new Promise((resolve) => {
      this.queue.push({ id, from, resolve });
      if (!this.run) this.next();
    });
  }

  skip(): boolean {
    const r = this.run;
    if (!r || r.def.skippable === false) return false;
    for (let i = r.at; i < r.def.steps.length; i++) {
      const s = r.def.steps[i];
      if ('flag' in s) r.buffer.set(s.flag.key, s.flag.value ?? true);
    }
    this.end('skipped');
    return true;
  }

  /** The player died (or the owner stops it): flags since the last checkpoint are dropped. */
  cancel(): void {
    if (!this.run) return;
    this.run.buffer.clear();
    this.end('cancelled');
  }

  /** Advances the running scene by `dt` seconds of game time. */
  tick(dt: number): void {
    let guard = 0;
    while (this.run && guard++ < 1000) {
      const r = this.run;
      if (r.wait > 0) {
        r.wait -= dt;
        if (r.wait > 1e-9) return;
        r.wait = 0;
        dt = 0;
        r.shot?.release();
        r.shot = null;
      }
      if (r.at >= r.def.steps.length) {
        this.end('finished');
        return;
      }
      this.step(r, r.def.steps[r.at++]);
    }
  }

  serialize(): SavedScene | null {
    return this.entry ? { ...this.entry } : null;
  }

  /** Restores the entry from a save; `resume()` (on save.loaded) replays it. */
  load(data: unknown): void {
    this.dropAll();
    const d = data as Partial<SavedScene> | null;
    this.entry = d && typeof d.id === 'string' && (d.checkpoint === null || typeof d.checkpoint === 'string') ? { id: d.id, checkpoint: d.checkpoint ?? null } : null;
  }

  /** On save.loaded: replays the saved scene from its checkpoint (or its start). */
  resume(): Promise<SceneEndReason> | null {
    const e = this.entry;
    if (!e) return null;
    if (!this.defs.has(e.id)) {
      this.ports.warn(`scenes: a save holds unknown scene "${e.id}"; dropped`);
      this.entry = null;
      return null;
    }
    return this.play(e.id, e.checkpoint);
  }

  dispose(): void {
    this.dropAll();
  }

  private dropAll(): void {
    if (this.run) {
      this.run.buffer.clear();
      this.end('cancelled', false);
    }
    for (const q of this.queue.splice(0)) q.resolve('cancelled');
  }

  private next(): void {
    const q = this.queue.shift();
    if (!q) return;
    const def = this.defs.get(q.id);
    if (!def) {
      q.resolve('cancelled');
      this.next();
      return;
    }
    let at = 0;
    if (q.from !== null) {
      const i = def.steps.findIndex((s) => 'checkpoint' in s && s.checkpoint === q.from);
      if (i < 0) this.ports.warn(`scenes: scene "${def.id}" has no checkpoint "${q.from}"; replaying from the start`);
      else at = i + 1;
    }
    const release = this.ports.hold();
    this.run = { def, at, wait: 0, buffer: new Map(), checkpoint: at > 0 ? q.from : null, shot: null, release, resolve: q.resolve };
    this.entry = { id: def.id, checkpoint: this.run.checkpoint };
    this.ports.emit('scene.started', { id: def.id });
  }

  private step(r: Running, s: SceneStep): void {
    try {
      if ('line' in s) {
        this.ports.emit('scene.line', { id: r.def.id, speakerId: s.line.speakerId, textKey: s.line.textKey });
        r.wait = s.line.seconds ?? DEFAULT_LINE_SECONDS;
      } else if ('shot' in s) {
        if (this.ports.canStage()) r.shot = this.ports.shot(s.shot);
        r.wait = s.shot.seconds;
      } else if ('move' in s) {
        this.ports.move(s.move.who, s.move.to, s.move.yaw);
      } else if ('anim' in s) {
        if (this.ports.canStage()) this.ports.anim(s.anim.who, s.anim.clip);
      } else if ('spawn' in s) {
        this.ports.spawn(s.spawn);
      } else if ('wait' in s) {
        r.wait = s.wait;
      } else if ('flag' in s) {
        r.buffer.set(s.flag.key, s.flag.value ?? true);
      } else if ('checkpoint' in s) {
        this.flush(r);
        r.checkpoint = s.checkpoint;
        this.entry = { id: r.def.id, checkpoint: s.checkpoint };
        this.ports.emit('scene.checkpoint', { id: r.def.id, checkpoint: s.checkpoint });
        this.ports.checkpointSave();
      }
    } catch (err) {
      this.ports.warn(`scenes: step ${r.at - 1} of "${r.def.id}" failed (${String(err)}); going on`);
    }
  }

  private flush(r: Running): void {
    for (const [k, v] of r.buffer) this.ports.setFlag(k, v);
    r.buffer.clear();
  }

  private end(reason: SceneEndReason, emit = true): void {
    const r = this.run;
    if (!r) return;
    this.flush(r);
    r.shot?.release();
    this.run = null;
    this.entry = null;
    try {
      r.release();
    } catch (err) {
      this.ports.warn(`scenes: release failed (${String(err)})`);
    }
    if (emit) this.ports.emit('scene.ended', { id: r.def.id, reason });
    r.resolve(reason);
    if (emit) this.next();
  }
}
