import type { DocumentLike } from './dom';
import { defaultHudT } from './strings.en';
import { makeEl, type HudWidgetView, type Translate } from './widget';

export interface TrackedObjective {
  textKey: string;
  progress: number;
  required: number;
  done: boolean;
  optional?: boolean;
}

export interface TrackedQuest {
  id: string;
  titleKey: string;
  objectives: readonly TrackedObjective[];
}

export interface QuestTrackerSource {
  /** Undefined when the quests service is not loaded. */
  quests: { active(): readonly TrackedQuest[] } | undefined;
  t?: Translate;
}

export const MAX_TRACKED_QUESTS = 3;

export function objectiveProgress(o: Pick<TrackedObjective, 'progress' | 'required'>): string | null {
  if (!(o.required > 1) || !Number.isFinite(o.required)) return null;
  const p = Number.isFinite(o.progress) ? Math.min(Math.max(0, Math.floor(o.progress)), o.required) : 0;
  return `${p}/${o.required}`;
}

export class QuestTracker implements HudWidgetView {
  readonly id = 'quest-tracker';
  readonly element;
  private readonly t: Translate;

  constructor(
    private readonly doc: DocumentLike,
    private readonly source: QuestTrackerSource,
  ) {
    this.t = source.t ?? defaultHudT;
    this.element = makeEl(doc, 'div', 'owg-quests');
    this.update();
  }

  update(): void {
    const quests = (this.source.quests?.active() ?? []).slice(0, MAX_TRACKED_QUESTS);
    const nodes = quests.map((q) => {
      const box = makeEl(this.doc, 'div', 'owg-quest');
      box.setAttribute('data-quest', q.id);
      makeEl(this.doc, 'div', 'owg-quest-title', box).textContent = this.t(q.titleKey);
      // The first open objective is the one to do now (owg-cur); its count sits in a pill.
      const cur = q.objectives.find((o) => !o.done && !o.optional);
      for (const o of q.objectives) {
        const row = makeEl(this.doc, 'div', `owg-objective${o.done ? ' owg-done' : ''}${o.optional ? ' owg-optional' : ''}${o === cur ? ' owg-cur' : ''}`, box);
        const prog = objectiveProgress(o);
        let text = this.t(o.textKey);
        if (o.optional) text += ` ${this.t('hud.quest.optional')}`;
        makeEl(this.doc, 'span', 'owg-objective-text', row).textContent = text;
        if (prog) makeEl(this.doc, 'span', 'owg-count', row).textContent = prog;
      }
      return box;
    });
    this.element.replaceChildren(...nodes);
  }

  dispose(): void {
    this.element.remove();
  }
}
