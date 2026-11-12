// G4 Cinderlands: the expedition board at the rift arch (plan 3.5): seed code, Heat, biome, objective, best, the Hearth
// stall and the best table. Browser only (the plugin opens it when a document exists); the logic it calls is tested
// headless through `BoardModel`.
import { BIOMES } from './biomes';
import { boardMaxHeat, heatMultiplier, modifiersAt } from './heat';
import { HEARTH, HEARTH_ITEMS, type CinderMeta, type HearthItem } from './meta';
import { CLASS_WORDS, formatSeed, parseSeed, rollHex, type RunSeed } from './seed';
import type { ClassId } from '../actors/classes';

type T = (key: string, params?: Record<string, string | number>) => string;

/** The board's state and rules, without DOM. */
export class BoardModel {
  heat: number;
  code: string;

  constructor(
    private readonly meta: CinderMeta,
    readonly classId: ClassId,
    readonly warmth: number,
    readonly fullMode: boolean,
    random: () => number,
  ) {
    this.heat = this.maxHeat;
    this.code = formatSeed({ classId, biome: 'ashfield', hex: rollHex(random), heat: this.heat });
  }

  get maxHeat(): number {
    return boardMaxHeat(this.meta.data.maxHeat, this.warmth, this.fullMode);
  }

  /** Moves the Heat, re-signing the current code for the new Heat so it stays valid. */
  setHeat(h: number): void {
    const next = Math.max(1, Math.min(this.maxHeat, Math.round(h)));
    const parsed = parseSeed(this.code, this.heat);
    this.heat = next;
    if (parsed.ok) this.code = formatSeed({ ...parsed.seed, heat: next });
  }

  newSeed(random: () => number): void {
    this.code = formatSeed({ classId: this.classId, biome: 'ashfield', hex: rollHex(random), heat: this.heat });
  }

  /** A typed code: checked for this Heat; the class word must be the player's (a shared code from another class re-signs). */
  check(code: string): { ok: true; seed: RunSeed } | { ok: false; reason: string } {
    const r = parseSeed(code, this.heat, this.maxHeat);
    if (!r.ok) return r;
    return { ok: true, seed: { ...r.seed, classId: this.classId } };
  }
}

export interface BoardDeps {
  t: T;
  meta: CinderMeta;
  model: BoardModel;
  openModal(el: HTMLElement, onClose: () => void): (() => void) | null;
  start(seed: RunSeed): void;
  random: () => number;
}

/** Opens the board; returns its closer, or null when no document or another modal is open. */
export function openBoard(deps: BoardDeps): (() => void) | null {
  if (typeof document === 'undefined') return null;
  const { t, meta, model } = deps;
  const root = document.createElement('div');
  root.className = 'owg-respec owg-cinder-board';
  root.style.maxWidth = 'min(560px, 92vw)';
  let closer: (() => void) | null = null;

  const el = (tag: string, cls: string, parent: HTMLElement, text?: string): HTMLElement => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    parent.append(e);
    return e;
  };
  const button = (parent: HTMLElement, text: string, on: () => void, disabled = false): HTMLButtonElement => {
    const b = el('button', 'owg-btn', parent, text) as HTMLButtonElement;
    b.disabled = disabled;
    b.onclick = on;
    return b;
  };

  const render = (): void => {
    root.textContent = '';
    el('h2', 'owg-menu-title', root, t(model.fullMode ? 'cinder.board.titleFull' : 'cinder.board.title'));
    const row = el('div', 'owg-respec-quote', root);
    el('span', '', row, `${t('cinder.board.code')}: `);
    const input = el('input', 'owg-cinder-code', row) as HTMLInputElement;
    input.value = model.code;
    input.spellcheck = false;
    input.style.width = '14ch';
    input.onchange = () => {
      model.code = input.value.trim().toUpperCase();
      render();
    };
    button(row, t('cinder.board.newSeed'), () => {
      model.newSeed(deps.random);
      render();
    });

    const heatRow = el('div', 'owg-respec-quote', root);
    button(heatRow, '−', () => {
      model.setHeat(model.heat - 1);
      render();
    }, model.heat <= 1);
    el('span', '', heatRow, ` ${t('cinder.board.heat', { heat: model.heat, mult: heatMultiplier(model.heat).toFixed(2) })} `);
    button(heatRow, '+', () => {
      model.setHeat(model.heat + 1);
      render();
    }, model.heat >= model.maxHeat);
    el('div', 'owg-respec-quote', root, t('cinder.board.heatCap', { max: model.maxHeat }));
    const b = BIOMES.ashfield;
    el('div', 'owg-respec-quote', root, t('cinder.board.biome', { name: t(b.nameKey), offset: b.offset >= 0 ? `+${b.offset}` : String(b.offset) }));
    el('div', 'owg-respec-quote', root, t('cinder.board.objective'));
    const mods = modifiersAt(model.heat);
    el('div', 'owg-respec-quote', root, mods.length ? t('cinder.board.modifiers', { list: mods.map((m) => t(`cinder.mod.${m}`)).join(', ') }) : t('cinder.board.noModifiers'));
    const best = meta.bestFor(model.code);
    el('div', 'owg-respec-quote', root, best ? t('cinder.board.best', { score: best.score }) : t('cinder.board.noBest'));

    const check = model.check(model.code);
    if (!check.ok) el('div', 'owg-respec-warn', root, t(`cinder.board.bad.${check.reason}`));

    const actions = el('div', 'owg-respec-actions', root);
    button(actions, t('cinder.board.start'), () => {
      const c = model.check(model.code);
      if (!c.ok) return;
      const close = closer;
      closer = null;
      close?.();
      deps.start(c.seed);
    }, !check.ok);
    button(actions, t('cinder.board.close'), () => closer?.());

    // Hearth stall and Mastery.
    el('h3', 'owg-menu-title', root, t('cinder.board.hearth'));
    el('div', 'owg-respec-quote', root, t('cinder.board.embers', { embers: meta.data.embers }));
    el('div', 'owg-respec-quote', root, model.fullMode ? t('cinder.board.mastery', { rank: meta.masteryRank(model.classId) }) : t('cinder.board.masteryLocked'));
    for (const item of HEARTH_ITEMS) {
      const r = el('div', 'owg-respec-quote', root);
      const def = HEARTH[item as HearthItem];
      el('span', '', r, `${t(def.nameKey)} ${meta.rank(item)}/${def.maxRank}: ${t(def.descKey)} `);
      const price = meta.price(item);
      button(r, price === null ? t('cinder.board.maxed') : t('cinder.board.buy', { price }), () => {
        meta.buy(item);
        render();
      }, price === null || meta.data.embers < price);
    }

    if (meta.data.bests.length) {
      el('h3', 'owg-menu-title', root, t('cinder.board.bests'));
      for (const row of meta.data.bests) {
        el('div', 'owg-respec-quote', root, `${row.score} · ${row.code} · Heat ${row.heat} · ${Math.floor(row.seconds / 60)}:${String(row.seconds % 60).padStart(2, '0')} · ${t(`cinder.outcome.${row.outcome}`)}`);
      }
    }
  };
  render();
  closer = deps.openModal(root, () => {
    closer = null;
  });
  return closer;
}

/** The class word, for tests that build codes. */
export const classWord = (c: ClassId): string => CLASS_WORDS[c];
