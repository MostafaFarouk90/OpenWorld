import { QUALITY, QUALITY_STORAGE_KEY, type QualityStep } from '../vfx/tuning';
import type { GraphicsService } from '../vfx/ports';

export type QualitySource = 'user' | 'probe' | 'governor';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function isQualityStep(v: unknown): v is QualityStep {
  return v === 'low' || v === 'medium' || v === 'high';
}

export interface QualityManagerOptions {
  storage?: StorageLike | null;
  graphics?: GraphicsService | null;
  /** Usually `location.search`; a valid `?quality=` wins for the session and is not persisted. */
  search?: string;
  onChange?: (q: QualityStep) => void;
}

export class QualityManager {
  private _step: QualityStep = 'medium';
  private _userChosen = false;
  private _stored = false;
  private readonly storage: StorageLike | null;
  private readonly graphics: GraphicsService | null;
  private readonly subs = new Set<(q: QualityStep) => void>();
  private warned = false;

  constructor(opts: QualityManagerOptions = {}) {
    this.storage = opts.storage ?? null;
    this.graphics = opts.graphics ?? null;
    if (opts.onChange) this.subs.add(opts.onChange);
    this.readStored();
    const override = this.readOverride(opts.search);
    if (override) {
      this._step = override;
      this._userChosen = true;
    }
  }

  get step(): QualityStep {
    return this._step;
  }
  get userChosen(): boolean {
    return this._userChosen;
  }
  /** True when a choice was read from storage (the probe then has nothing to decide). */
  get hasStoredChoice(): boolean {
    return this._stored;
  }

  set(step: QualityStep, source: QualitySource): boolean {
    if (!isQualityStep(step)) return false;
    const changed = step !== this._step;
    this._step = step;
    if (source === 'user') this._userChosen = true;
    if (source === 'user' || source === 'probe') this.persist(source === 'user');
    if (changed) {
      this.applyToGraphics();
      for (const fn of [...this.subs]) {
        try {
          fn(step);
        } catch (e) {
          console.error('[quality] subscriber threw', e);
        }
      }
    }
    return true;
  }

  subscribe(fn: (q: QualityStep) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /** Pushes the current step to the graphics service. Failures are isolated and logged once. */
  applyToGraphics(): void {
    const g = this.graphics;
    if (!g) return;
    const q = QUALITY[this._step];
    try {
      g.setRenderScale(q.renderScale);
      g.setShadows(q.shadows, q.shadowDistance);
      g.setViewDistanceOffset(q.viewDistanceOffset);
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        console.error('[quality] graphics service failed', e);
      }
    }
  }

  private readStored(): void {
    try {
      const raw = this.storage?.getItem(QUALITY_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as { step?: unknown; userChosen?: unknown } | null;
      if (data && isQualityStep(data.step)) {
        this._step = data.step;
        this._userChosen = data.userChosen === true;
        this._stored = true;
      }
    } catch {
      // corrupt or inaccessible storage: stay on medium
    }
  }

  private readOverride(search?: string): QualityStep | null {
    if (!search) return null;
    try {
      const v = new URLSearchParams(search).get('quality');
      return isQualityStep(v) ? v : null;
    } catch {
      return null;
    }
  }

  private persist(userChosen: boolean): void {
    try {
      this.storage?.setItem(QUALITY_STORAGE_KEY, JSON.stringify({ step: this._step, userChosen }));
    } catch {
      // storage unavailable: the choice lives for the session only
    }
  }
}
