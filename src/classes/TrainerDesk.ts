import type { ClassId, ClassesService } from '../actors/classes';
import type { DocumentLike, ElementLike } from '../hud/dom';
import type { RespecModalService } from '../hud/RespecModal';
import type { ProgressionService } from '../hud/ports';
import { buildTrainerMenu, refusalKey, type TrainerOption } from './TrainerMenu';

export interface TrainerDeskPorts {
  classes: ClassesService;
  progression(): ProgressionService | undefined;
  respecModal(): RespecModalService | undefined;
  /** `ctx.hud.openModal` (context menu); null while another modal is open. */
  openModal(widget: { id: string; element: ElementLike; dispose?(): void }): (() => void) | null;
  doc(): DocumentLike;
  t(key: string, params?: Record<string, string | number>): string;
  toast(key: string): void;
}

/**
 * The trainers' menu. While it is open it holds `progression.allowRespec('trainer')`, so a class change from it is a
 * respec; the permit is released whenever the menu closes (a button, Esc, death, a load, teardown). Reset hands over to
 * the respec modal with a permit of its own, released on its confirm or cancel.
 */
export class TrainerDesk {
  private closer: (() => void) | null = null;
  private permit: (() => void) | null = null;
  private resetPermit: (() => void) | null = null;
  private classId: ClassId | null = null;
  private titleKey = '';

  constructor(private readonly ports: TrainerDeskPorts) {}

  get openFor(): ClassId | null {
    return this.closer ? this.classId : null;
  }

  /** True while the menu or its Reset hand-off holds a permit. */
  get holdsPermit(): boolean {
    return this.permit !== null || this.resetPermit !== null;
  }

  open(classId: ClassId, titleKey: string): boolean {
    if (this.closer) return false;
    const p = this.ports.progression();
    if (!p) return false;
    this.classId = classId;
    this.titleKey = titleKey;
    this.permit = p.allowRespec('trainer');
    if (!this.render()) {
      this.release();
      return false;
    }
    return true;
  }

  close(): void {
    const c = this.closer;
    this.closer = null;
    c?.();
    this.release();
  }

  /** Everything let go: the menu, its permit and a pending Reset's permit (death, load, teardown). */
  closeAll(): void {
    this.close();
    this.resetPermit?.();
    this.resetPermit = null;
  }

  pick(option: TrainerOption): void {
    const id = this.classId;
    if (!id || !this.closer) return;
    const classes = this.ports.classes;
    switch (option) {
      case 'choose':
      case 'change': {
        const r = option === 'choose' ? classes.choose(id) : classes.change(id);
        if (!r.ok) {
          this.ports.toast(refusalKey(r));
          this.redraw();
          return;
        }
        this.close();
        return;
      }
      case 'drill':
        if (!classes.startDrill()) this.ports.toast('classes.refused.drill');
        this.close();
        return;
      case 'skip':
        classes.skipDrill();
        this.close();
        return;
      case 'reset':
        this.close();
        this.reset();
        return;
      case 'close':
        this.close();
        return;
    }
  }

  private reset(): void {
    const p = this.ports.progression();
    const modal = this.ports.respecModal();
    if (!p || !modal) {
      this.ports.toast('classes.reset.unavailable');
      return;
    }
    this.resetPermit = p.allowRespec('trainer');
    const done = (): void => {
      this.resetPermit?.();
      this.resetPermit = null;
    };
    const opened = modal.open({
      quote: p.respecQuote(),
      confirm: () => {
        const r = p.respec();
        if (!r.ok) this.ports.toast(`classes.reset.${r.reason}`);
        done();
      },
      cancel: done,
    });
    if (!opened) {
      done();
      this.ports.toast('classes.reset.unavailable');
    }
  }

  private redraw(): void {
    const c = this.closer;
    this.closer = null;
    c?.();
    if (!this.render()) this.release();
  }

  private render(): boolean {
    const element = buildTrainerMenu({
      doc: this.ports.doc(),
      t: (k, p) => this.ports.t(k, p),
      classes: this.ports.classes,
      classId: this.classId!,
      titleKey: this.titleKey,
      pick: (o) => this.pick(o),
    });
    let closer: (() => void) | null = null;
    closer = this.ports.openModal({
      id: 'trainer',
      element,
      // Closed from outside (another system, teardown): drop the permit too.
      dispose: () => {
        if (this.closer !== closer) return;
        this.closer = null;
        this.release();
      },
    });
    this.closer = closer;
    return closer !== null;
  }

  private release(): void {
    this.permit?.();
    this.permit = null;
  }
}
