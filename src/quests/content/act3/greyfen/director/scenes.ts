// The Greyfen set pieces' shared frame (K12 follow-up): freeze the player, push the cutscene input context, hold the camera, show
// the hold-Esc skip (the tutorial's SkipHold and widget) and release all of it exactly once, whatever ends the scene (it
// finishing, a skip, a load, the quest leaving, the plugin being torn down). Nothing here knows the story; the caller's `onEnd`
// writes the flags.
import type { CameraShot } from '../../../../../rendering/ThirdPersonCamera';
import { createSkipWidget, SkipHold } from '../../../../../tutorial/SkipHold';
import type { Kit } from './shared';

export type PieceEnd = 'finished' | 'skipped' | 'load' | 'cancelled' | 'teardown';

/** The three ways a scene can be staged; false in a reduced boot (no camera rig, no player), when the caller falls back. */
export function canStage(k: Kit): boolean {
  const c = k.ctx;
  return !!c.cameraRig && typeof c.player?.addMoveModifier === 'function';
}

export class SetPiece {
  private undo: Array<() => void> = [];
  private camera: { release(blendOut?: number): void } | null = null;
  private skip = new SkipHold(1.2);
  private ui: ReturnType<typeof createSkipWidget> | null = null;
  private unmount: (() => void) | null = null;
  private live = false;
  private ticks = 0;

  constructor(
    private readonly k: Kit,
    private readonly source: string,
    private readonly onEnd: (reason: PieceEnd) => void,
  ) {}

  get active(): boolean {
    return this.live;
  }

  /** Fixed ticks since `begin`. */
  get age(): number {
    return this.ticks;
  }

  /** Takes the player and the camera. False (nothing taken) when the scene cannot be staged or one is already running. */
  /** `shot` null stages nothing on the player: no freeze, no cutscene context, no camera (the scene plays in the world, he watches from where he stands). */
  begin(shot: CameraShot | null): boolean {
    if (this.live || !canStage(this.k)) return false;
    const c = this.k.ctx;
    this.live = true;
    this.ticks = 0;
    this.skip = new SkipHold(1.2);
    if (shot) {
      const freeze = c.player.addMoveModifier(this.source, { freeze: true });
      if (freeze) this.undo.push(freeze);
      const cut = c.input?.contexts?.push('cutscene', this.source);
      if (cut) this.undo.push(cut);
      this.camera = c.cameraRig?.override(shot) ?? null;
    }
    this.mountSkip();
    return true;
  }

  /** Swaps the camera hold for another shot (the old one is released with a short blend). */
  reshoot(shot: CameraShot): void {
    if (!this.live || !this.camera) return;
    const old = this.camera;
    this.camera = this.k.ctx.cameraRig?.override(shot) ?? null;
    old?.release(0.2);
  }

  /** Call once a fixed tick while the scene runs. */
  tick(dialogueOpen: boolean): void {
    if (!this.live) return;
    this.ticks++;
    const a = this.k.ctx.input?.actions;
    const fire = this.skip.tick({
      menuDown: a?.down('menu') ?? false,
      menuPressed: a?.pressed('menu') ?? false,
      beatActive: true,
      modalOpen: dialogueOpen,
      allowModal: true,
      dt: 1 / 60,
    });
    this.ui?.update(this.skip.progress, this.skip.hintVisible || this.ticks < 180);
    if (fire) this.end('skipped');
  }

  /** Releases everything and reports why, once. */
  end(reason: PieceEnd): void {
    if (!this.live) return;
    this.live = false;
    try {
      this.camera?.release(1);
    } catch {
      // a torn-down camera rig: nothing to restore
    }
    this.camera = null;
    for (const u of this.undo.splice(0).reverse()) {
      try {
        u();
      } catch {
        // a torn-down service
      }
    }
    try {
      this.unmount?.();
    } catch {
      // a torn-down HUD: the scene's end must still run
    }
    this.unmount = null;
    this.ui = null;
    this.onEnd(reason);
  }

  private mountSkip(): void {
    const doc = typeof document === 'undefined' ? null : document;
    const hud = this.k.ctx.hud;
    if (!doc || !hud) return;
    const ui = createSkipWidget(doc, (key) => this.k.ctx.strings.t(key === 'tutorial.skip.hint' ? 'greyfen.scene.skip' : key));
    this.ui = ui;
    this.unmount = hud.mount('center', { ...ui.widget, id: `greyfen.skip.${this.source}` });
  }
}
