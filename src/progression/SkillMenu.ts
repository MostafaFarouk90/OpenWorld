import type { DocumentLike, ElementLike } from '../hud/dom';
import type { ProgressionService } from '../hud/ports';
import { skillViewModel } from './skillViewModel';

export interface SkillMenuDeps {
  progression: ProgressionService;
  t(key: string, params?: Record<string, string | number>): string;
  /** Current class id, read on every render; falls back to the progression's class, then the Knight. */
  classId?(): string | null | undefined;
  close(): void;
  onLearn?(skillId: string): void;
  onRefused?(): void;
}

/** The skill tree modal: three branches, five tiers; only the nodes marked available can be learned. */
export class SkillMenu {
  readonly element: ElementLike;

  constructor(
    private readonly doc: DocumentLike,
    private readonly deps: SkillMenuDeps,
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'owg-menu owg-skills';
    this.render();
  }

  private el(tag: string, className: string, text?: string): ElementLike {
    const e = this.doc.createElement(tag);
    e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private branchTitle(branch: string): string {
    const key = `hud.skills.branch.${branch}`;
    const text = this.deps.t(key);
    if (text && !text.includes(key)) return text;
    return branch.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  render(): void {
    const { progression: p, t } = this.deps;
    const vm = skillViewModel(p, this.deps.classId?.());
    const head = this.el('div', 'owg-menu-head');
    head.append(
      this.el('h2', 'owg-menu-title', t('hud.skills.title')),
      this.el('span', 'owg-level', t('hud.skills.level', { level: vm.level })),
      this.el('span', 'owg-points', t('hud.skills.points', { points: vm.points })),
    );
    const close = this.el('button', 'owg-btn', t('hud.skills.close'));
    close.onclick = () => this.deps.close();
    head.append(close);

    const cols = this.el('div', 'owg-branches');
    if (vm.branches.length === 0) cols.append(this.el('p', 'owg-skills-empty', t('hud.skills.empty')));
    for (const b of vm.branches) {
      const col = this.el('div', 'owg-branch');
      col.append(this.el('h3', 'owg-branch-title', this.branchTitle(b.branch)));
      for (const n of b.nodes) {
        const node = this.el('div', `owg-skill owg-skill-${n.state}`);
        node.append(
          this.el('span', 'owg-skill-name', t(n.skill.nameKey)),
          this.el('span', 'owg-skill-meta', `${t('hud.skills.tier', { tier: n.skill.tier })} · ${t(n.skill.kind === 'active' ? 'hud.skills.active' : 'hud.skills.passive')}`),
          this.el('span', 'owg-skill-desc', t(n.skill.descKey)),
        );
        if (n.state === 'learned') node.append(this.el('span', 'owg-skill-state', t('hud.skills.learned')));
        else if (n.state === 'unavailable') node.append(this.el('span', 'owg-skill-state', t('hud.skills.locked')));
        else {
          const btn = this.el('button', 'owg-btn', t('hud.skills.learn', { cost: n.skill.cost }));
          btn.onclick = () => {
            if (p.learn(n.skill.id).ok) this.deps.onLearn?.(n.skill.id);
            else this.deps.onRefused?.();
            this.render();
          };
          node.append(btn);
        }
        col.append(node);
      }
      cols.append(col);
    }
    this.element.replaceChildren(head, cols);
  }
}
