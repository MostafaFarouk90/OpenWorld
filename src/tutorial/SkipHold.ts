import type { HudWidget } from '../ui/HudLayer';

export interface SkipTickInput {
  menuDown: boolean;
  /** A fresh press of `menu` this tick. */
  menuPressed: boolean;
  beatActive: boolean;
  modalOpen: boolean;
  /** True when this modal may be skipped through (e.g. the vow dialogue). */
  allowModal: boolean;
  dt: number;
}

const GRACE_SECONDS = 0.5;
const HINT_SECONDS = 3;
const EPS = 1e-9;

/**
 * Decides when a hold-Esc beat skip fires. Chrome swallows the Esc keydown that exits pointer lock,
 * so a hold starts either from a pointer-lock drop during a beat (then the key may be invisible to the
 * page for a short grace) or from a fresh `menu` press while unlocked.
 */
export class SkipHold {
  private held = 0;
  private holding = false;
  private grace = 0;
  private hintLeft = 0;
  /** Set after firing or a modal-started press; nothing counts until menu is released. */
  private blocked = false;
  private beatActive = false;
  private modalBlocks = false;

  constructor(private readonly holdSeconds = 1.5) {}

  get progress(): number {
    return this.holding ? Math.min(1, this.held / this.holdSeconds) : 0;
  }

  get hintVisible(): boolean {
    return this.hintLeft > 0;
  }

  /** Call from the `pointerlockchange` handler. */
  onPointerLockChange(locked: boolean): void {
    if (locked || !this.beatActive) return;
    this.hintLeft = HINT_SECONDS;
    if (this.blocked || this.modalBlocks) return;
    this.holding = true;
    this.held = 0;
    this.grace = GRACE_SECONDS;
  }

  tick(i: SkipTickInput): boolean {
    this.beatActive = i.beatActive;
    this.modalBlocks = i.modalOpen && !i.allowModal;
    if (!i.beatActive) {
      this.reset();
      this.hintLeft = 0;
      return false;
    }
    this.hintLeft = Math.max(0, this.hintLeft - i.dt);
    // A modal that does not allow skipping cancels any hold until menu is released.
    if (this.modalBlocks && (this.holding || i.menuDown)) {
      this.holding = false;
      this.held = 0;
      this.grace = 0;
      this.blocked = true;
    }
    if (!i.menuDown) {
      if (this.holding && this.grace > 0) {
        this.grace -= i.dt;
        this.held += i.dt;
      } else {
        this.reset();
      }
    } else {
      if (this.blocked) return false;
      if (!this.holding) {
        if (!i.menuPressed) return false;
        this.holding = true;
        this.held = 0;
        this.grace = 0;
      }
      this.grace = Math.max(0, this.grace - i.dt);
      this.held += i.dt;
    }
    if (this.holding && this.held >= this.holdSeconds - EPS) {
      this.reset();
      this.blocked = true;
      return true;
    }
    return false;
  }

  private reset(): void {
    this.holding = false;
    this.held = 0;
    this.grace = 0;
    this.blocked = false;
  }
}

/** A progress bar plus the hint text; the plugin feeds it `progress` and `hintVisible` each frame. */
export function createSkipWidget(
  doc: Pick<Document, 'createElement'>,
  t: (key: string) => string,
): { widget: HudWidget; update(progress: number, hintVisible: boolean): void } {
  const element = doc.createElement('div');
  const hint = doc.createElement('div');
  const track = doc.createElement('div');
  const bar = doc.createElement('div');
  element.className = 'tutorial-skip';
  Object.assign(element.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#eee' });
  hint.className = 'tutorial-skip__hint';
  hint.textContent = t('tutorial.skip.hint');
  hint.style.display = 'none';
  track.className = 'tutorial-skip__track';
  Object.assign(track.style, { width: '160px', height: '4px', background: 'rgba(255,255,255,0.25)', display: 'none' });
  bar.className = 'tutorial-skip__bar';
  Object.assign(bar.style, { height: '100%', width: '0%', background: '#fff' });
  track.appendChild(bar);
  element.appendChild(hint);
  element.appendChild(track);
  return {
    widget: {
      id: 'tutorial.skip',
      element,
      dispose() {
        element.remove();
      },
    },
    update(progress, hintVisible) {
      const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
      bar.style.width = `${Math.round(p * 100)}%`;
      track.style.display = p > 0 ? 'block' : 'none';
      hint.style.display = hintVisible ? 'block' : 'none';
    },
  };
}
