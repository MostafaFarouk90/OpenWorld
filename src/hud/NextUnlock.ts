import type { DocumentLike } from './dom';
import type { NextUnlock as NextUnlockInfo } from './ports';
import { defaultHudT } from './strings.en';
import { makeEl, setShown, type HudWidgetView, type Translate } from './widget';

export interface NextUnlockSource {
  nextUnlock(): NextUnlockInfo;
  skillPoints(): number;
  /** Display name for a skill id; defaults to the id. */
  skillName?(skillId: string): string;
  t?: Translate;
}

function whole(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.ceil(n)) : 0;
}

export class NextUnlock implements HudWidgetView {
  readonly id = 'next-unlock';
  readonly element;
  private readonly t: Translate;
  private readonly text;
  private readonly badge;

  constructor(
    doc: DocumentLike,
    private readonly source: NextUnlockSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-nextunlock');
    this.text = makeEl(doc, 'div', 'owg-nextunlock-text', this.element);
    this.badge = makeEl(doc, 'div', 'owg-points', this.element);
    this.update();
  }

  /** Text for the current state, or null when nothing is left to unlock. */
  label(): string | null {
    const n = this.source.nextUnlock();
    if (n.kind === 'level') return this.t('hud.nextUnlock.level', { remaining: whole(n.remaining), level: n.level });
    if (n.kind === 'skill') {
      const skill = this.source.skillName?.(n.skillId) ?? n.skillId;
      if (n.remaining <= 0) return this.t('hud.nextUnlock.learn', { skill });
      return this.t('hud.nextUnlock.skill', { remaining: whole(n.remaining), skill });
    }
    return null;
  }

  update(): void {
    const label = this.label();
    const points = Number.isFinite(this.source.skillPoints()) ? Math.floor(this.source.skillPoints()) : 0;
    setShown(this.text, label !== null);
    this.text.textContent = label;
    setShown(this.badge, points > 0);
    this.badge.textContent =
      points > 0 ? this.t(points === 1 ? 'hud.nextUnlock.point' : 'hud.nextUnlock.points', { points }) : null;
    setShown(this.element, label !== null || points > 0);
  }

  dispose(): void {
    this.element.remove();
  }
}
