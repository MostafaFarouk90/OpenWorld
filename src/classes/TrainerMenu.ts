import type { ClassId, ClassResult, ClassesService } from '../actors/classes';
import type { DocumentLike, ElementLike } from '../hud/dom';
import { makeEl } from '../hud/widget';

export type TrainerOption = 'choose' | 'change' | 'drill' | 'skip' | 'reset' | 'close';

export interface TrainerLine {
  option: TrainerOption;
  textKey: string;
  params?: Record<string, string | number>;
  disabled?: boolean;
}

/** What a trainer offers right now (pure; the menu draws it and the tests read it). */
export function trainerLines(classes: ClassesService, classId: ClassId): TrainerLine[] {
  const kit = classes.kit(classId);
  const name = kit?.nameKey ?? `classes.name.${classId}`;
  const lines: TrainerLine[] = [];
  if (!classes.chosen()) {
    lines.push({ option: 'choose', textKey: 'classes.menu.choose', params: { classKey: name } });
  } else if (classes.current() !== classId) {
    const q = classes.changeQuote(classId);
    if (q.ok) {
      lines.push({
        option: 'change',
        textKey: q.free ? 'classes.menu.changeFree' : 'classes.menu.changeCost',
        params: { classKey: name, gold: q.gold },
        disabled: !q.canAfford,
      });
    } else {
      // Say why the change is not on offer (in combat, for one).
      lines.push({ option: 'change', textKey: `classes.refused.${q.reason}`, disabled: true });
    }
  } else {
    const running = classes.drill();
    if (running) lines.push({ option: 'skip', textKey: 'classes.menu.skip' });
    else lines.push({ option: 'drill', textKey: classes.drillOutcome(classId) ? 'classes.menu.replay' : 'classes.menu.drill' });
    lines.push({ option: 'reset', textKey: 'classes.menu.reset' });
  }
  lines.push({ option: 'close', textKey: 'classes.menu.close' });
  return lines;
}

export interface TrainerMenuDeps {
  doc: DocumentLike;
  t(key: string, params?: Record<string, string | number>): string;
  classes: ClassesService;
  classId: ClassId;
  titleKey: string;
  pick(option: TrainerOption): void;
}

/** The trainer's modal: title, the class blurb, one button per line. */
export function buildTrainerMenu(deps: TrainerMenuDeps): ElementLike {
  const { doc, t } = deps;
  const root = makeEl(doc, 'div', 'owg-trainer owg-menu');
  makeEl(doc, 'h2', 'owg-menu-title', root).textContent = t(deps.titleKey);
  makeEl(doc, 'p', 'owg-trainer-blurb', root).textContent = t(`classes.blurb.${deps.classId}`);
  const actions = makeEl(doc, 'div', 'owg-trainer-actions', root);
  for (const line of trainerLines(deps.classes, deps.classId)) {
    const params: Record<string, string | number> = { ...(line.params ?? {}) };
    if (typeof params.classKey === 'string') params.class = t(params.classKey);
    const btn = makeEl(doc, 'button', `owg-btn owg-trainer-${line.option}`, actions);
    btn.textContent = t(line.textKey, params);
    (btn as unknown as { disabled: boolean }).disabled = !!line.disabled;
    btn.onclick = () => deps.pick(line.option);
  }
  return root;
}

/** Toast keys for a refused choice or change. */
export function refusalKey(r: Exclude<ClassResult, { ok: true }>): string {
  return `classes.refused.${r.reason}`;
}
