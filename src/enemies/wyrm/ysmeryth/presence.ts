import { YSMERYTH_IDS } from './def';
import { YsmerythScene, type PoseMark, type YsmerythPose, type YsmerythScenePorts } from './scene';

export interface YsmerythPresencePorts extends YsmerythScenePorts {
  getBool(key: string): boolean;
  anchor(id: string): PoseMark | undefined;
  /** True while her trial runs (she is on the roost then, never at the Hearth). */
  trialRunning(): boolean;
  emitPose(pose: YsmerythPose): void;
  warn(message: string): void;
}

/**
 * The scene Ysmeryth at the Wyrm's Hearth (plans/act3-K6a-pr2.md 1.5). Never saved: by default she perches there from
 * `story.m31.complete`; K13's `pose` / `hide` override that until a load. Absent while the trial runs.
 */
export class YsmerythPresence {
  private scene: YsmerythScene | null = null;
  private override: YsmerythPose | 'hidden' | null = null;
  private warned = false;

  constructor(private readonly ports: YsmerythPresencePorts) {}

  get current(): YsmerythScene | null {
    return this.scene;
  }

  get pose(): YsmerythPose | null {
    return this.scene?.currentPose ?? null;
  }

  /** The pose she should hold now, or null for none. */
  wanted(): YsmerythPose | null {
    if (this.ports.trialRunning() || this.override === 'hidden') return null;
    if (this.override) return this.override;
    return this.ports.getBool(YSMERYTH_IDS.m31Complete) ? 'perch' : null;
  }

  /** K13: show her at `pose` (she flies there when already shown). */
  show(pose: YsmerythPose): boolean {
    if (!this.mark(pose)) return false;
    this.override = pose;
    this.derive();
    return true;
  }

  hide(): void {
    this.override = 'hidden';
    this.derive();
  }

  /** `save.loaded`: back to the derived default, placed at once. */
  onLoaded(): void {
    this.override = null;
    this.clear();
    this.derive();
  }

  tick(dt: number): void {
    this.derive();
    this.scene?.update(dt);
  }

  dispose(): void {
    this.clear();
  }

  private derive(): void {
    const want = this.wanted();
    if (!want) {
      this.clear();
      return;
    }
    const at = this.mark(want);
    if (!at) return;
    if (!this.scene) {
      this.scene = new YsmerythScene(this.ports, want, at);
      this.ports.emitPose(want);
      return;
    }
    if (this.scene.currentPose !== want) {
      this.scene.show(want, at);
      this.ports.emitPose(want);
    }
  }

  private clear(): void {
    this.scene?.dispose();
    this.scene = null;
  }

  private mark(pose: YsmerythPose): PoseMark | null {
    const a = this.ports.anchor(YSMERYTH_IDS.hearth[pose]);
    if (!a) {
      if (!this.warned) {
        this.warned = true;
        this.ports.warn(`Ysmeryth's ${pose} needs the Hearth anchor ${YSMERYTH_IDS.hearth[pose]}`);
      }
      return null;
    }
    return a;
  }
}
