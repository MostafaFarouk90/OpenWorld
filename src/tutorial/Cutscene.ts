import type { HudWidget } from '../ui/HudLayer';

export interface CutsceneShot {
  yaw: number;
  pitch: number;
  /** Time the camera takes to settle on the shot. */
  seconds: number;
}

export interface CutsceneDeps {
  emit(name: 'cutscene.started' | 'cutscene.ended', payload: { cutsceneId: string }): void;
  /** Pushes the 'cutscene' input context; returns the pop. */
  pushContext(): () => void;
  /** Adds a freeze move modifier; returns the release. */
  freeze(): () => void;
  hud: {
    mount(slot: 'overlay', w: HudWidget): () => void;
    setVisible(v: boolean): void;
    readonly isVisible: boolean;
  };
  /** The camera rig (ThirdPersonCamera satisfies this); null headless. */
  rig: { yaw: number; pitch: number; lockTarget: unknown } | null;
  doc: Pick<Document, 'createElement'>;
  warn?(message: string): void;
}

const TWO_PI = Math.PI * 2;

/** Shortest signed arc from `from` to `to`, in (-PI, PI]. */
function shortestArc(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/**
 * Runs one cutscene at a time: input context, move freeze, letterbox, hidden HUD and a camera eased
 * onto a shot. `end` undoes everything it did, each step guarded so one failing dep cannot strand the rest.
 */
export class CutsceneDirector {
  private id: string | null = null;
  private undo: Array<{ name: string; fn: () => void }> = [];
  private shot: CutsceneShot | null = null;
  private remaining = 0;

  constructor(private readonly deps: CutsceneDeps) {}

  get active(): string | null {
    return this.id;
  }

  start(id: string, shot?: CutsceneShot): boolean {
    if (this.id !== null) return false;
    const { deps } = this;
    this.id = id;
    this.undo = [];
    this.guard('pushContext', () => this.undo.push({ name: 'popContext', fn: deps.pushContext() }));
    this.guard('freeze', () => this.undo.push({ name: 'unfreeze', fn: deps.freeze() }));
    this.guard('letterbox', () => this.undo.push({ name: 'unmount letterbox', fn: deps.hud.mount('overlay', this.letterbox()) }));
    this.guard('hud', () => {
      const was = deps.hud.isVisible;
      deps.hud.setVisible(false);
      this.undo.push({ name: 'restore hud', fn: () => deps.hud.setVisible(was) });
    });
    if (deps.rig) {
      const rig = deps.rig;
      const lock = rig.lockTarget;
      rig.lockTarget = null;
      this.undo.push({ name: 'restore lockTarget', fn: () => { rig.lockTarget = lock; } });
    }
    this.shot = null;
    if (shot) this.setShot(shot);
    this.guard('emit started', () => deps.emit('cutscene.started', { cutsceneId: id }));
    return true;
  }

  /** Points the camera at a new shot; takes effect on the next `render`. */
  setShot(shot: CutsceneShot): void {
    this.shot = shot;
    this.remaining = Number.isFinite(shot.seconds) ? Math.max(0, shot.seconds) : 0;
  }

  /** Eases the rig toward the shot so it arrives after `seconds` in total; never overshoots. */
  render(frameTime: number): void {
    const rig = this.deps.rig;
    const shot = this.shot;
    if (this.id === null || !rig || !shot || !(frameTime > 0)) return;
    const step = this.remaining <= 0 ? 1 : Math.min(1, frameTime / this.remaining);
    this.remaining = Math.max(0, this.remaining - frameTime);
    const diff = shortestArc(rig.yaw, shot.yaw);
    rig.yaw = step >= 1 ? rig.yaw + diff : rig.yaw + diff * step;
    rig.pitch = step >= 1 ? shot.pitch : rig.pitch + (shot.pitch - rig.pitch) * step;
    // Keep yaw in a sane range when the arc crossed the seam.
    if (rig.yaw > Math.PI * 2 || rig.yaw < -Math.PI * 2) rig.yaw %= TWO_PI;
  }

  end(): void {
    const id = this.id;
    if (id === null) return;
    this.id = null;
    this.shot = null;
    const steps = this.undo.reverse();
    this.undo = [];
    for (const s of steps) this.guard(s.name, s.fn);
    this.guard('emit ended', () => this.deps.emit('cutscene.ended', { cutsceneId: id }));
  }

  dispose(): void {
    this.end();
  }

  private guard(what: string, fn: () => void): void {
    try {
      fn();
    } catch (e) {
      this.deps.warn?.(`cutscene ${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private letterbox(): HudWidget {
    const doc = this.deps.doc;
    const element = doc.createElement('div');
    element.className = 'tutorial-letterbox';
    Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    for (const edge of ['top', 'bottom'] as const) {
      const bar = doc.createElement('div');
      bar.className = `tutorial-letterbox__${edge}`;
      Object.assign(bar.style, { position: 'absolute', left: '0', right: '0', [edge]: '0', height: '12%', background: '#000' });
      element.appendChild(bar);
    }
    return {
      id: 'tutorial.letterbox',
      element,
      order: 800,
      dispose() {
        element.remove();
      },
    };
  }
}
