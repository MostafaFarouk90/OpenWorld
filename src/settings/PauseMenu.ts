// G1 (plans/g1-settings-menu.md): the pause screen and its Settings and Controls pages. One modal widget; the page
// changes inside it, so Esc steps back a page (Controls or Settings to the pause screen) before it resumes the game.
// Built on the HUD's DOM surface (ElementLike) so it runs against the stub DOM in node tests.
import type { DocumentLike, ElementLike } from '../hud/dom';
import { makeEl, type Translate } from '../hud/widget';
import type { Action, Binding } from '../input/actions';
import { glyphOf, type RebindResult } from '../input/InputBindings';
import type { QualityStep } from '../vfx/tuning';
import { controlRows, CONTROL_GROUPS } from './controls';
import { VOLUME_STEP, type Settings } from './SettingsStore';

export type PausePage = 'main' | 'settings' | 'controls' | 'quit' | 'confirm';

/** An item another plugin adds to the pause screen (G3's Second Hearth, G4's Leave expedition). */
export interface PauseItem {
  id: string;
  labelKey: string;
  /** With a confirm text, the menu asks before it calls `onSelect`. */
  confirmKey?: string;
  onSelect(): void;
}
export type QualityChoice = QualityStep | 'auto';
export type SaveResult = 'done' | 'blocked' | 'failed';

export interface PauseBindings {
  get(action: Action): readonly [Binding | null, Binding | null];
  rebind(action: Action, slot: 0 | 1, binding: Binding, opts?: { swap?: boolean }): RebindResult;
  clear(action: Action, slot: 0 | 1): void;
  resetToDefaults(): void;
}

export interface PauseMenuPorts {
  t: Translate;
  settings: { get(): Readonly<Settings>; set(patch: Partial<Settings>): void };
  /** Null without the quality service. */
  quality: { get(): QualityChoice; set(choice: QualityChoice): void } | null;
  /** The prompt manager's "show hints always"; null without it. */
  hints: { get(): boolean; set(on: boolean): void } | null;
  bindings: PauseBindings;
  /**
   * Starts listening for the next key or mouse button and calls `cb` with it once. Returns a cancel. Escape never
   * reaches `cb`: Esc is the menu's back key (the plugin routes it to `back()`).
   */
  listen(cb: (b: Binding) => void): () => void;
  /** Extra items whose condition holds right now, in the order they were added. */
  items?(): readonly PauseItem[];
  canSave(): boolean;
  save(): Promise<SaveResult>;
  resume(): void;
  quit(): void;
}

const QUALITY_CHOICES: readonly QualityChoice[] = ['auto', 'low', 'medium', 'high'];
const VOLUMES = ['master', 'music', 'effects'] as const;

export class PauseMenu {
  readonly id = 'pause-menu';
  readonly element: ElementLike;
  private readonly t: Translate;
  private readonly body: ElementLike;
  private _page: PausePage = 'main';
  private status: string | null = null;
  private saving = false;
  private capture: { action: Action; slot: 0 | 1; cancel: () => void } | null = null;
  private pending: { action: Action; slot: 0 | 1; binding: Binding } | null = null;
  private confirming: PauseItem | null = null;
  private sig = '';
  private disposed = false;

  constructor(
    private readonly doc: DocumentLike,
    private readonly ports: PauseMenuPorts,
  ) {
    this.t = ports.t;
    this.element = makeEl(doc, 'div', 'owg-card owg-pause');
    this.element.setAttribute('role', 'dialog');
    this.body = makeEl(doc, 'div', 'owg-pause-body', this.element);
    this.render();
  }

  get page(): PausePage {
    return this._page;
  }

  /** The action and slot waiting for a key, or null. */
  get capturing(): { action: Action; slot: 0 | 1 } | null {
    return this.capture ? { action: this.capture.action, slot: this.capture.slot } : null;
  }

  get statusText(): string | null {
    return this.status;
  }

  /** Esc: cancels a key capture, else steps back a page, else resumes the game. */
  back(): void {
    if (this.capture) {
      this.stopCapture();
      this.status = null;
    } else if (this._page !== 'main') {
      this.go('main');
      return;
    } else {
      this.ports.resume();
      return;
    }
    this.render();
  }

  go(page: PausePage): void {
    this.stopCapture();
    if (page !== 'confirm') this.confirming = null;
    this._page = page;
    this.status = null;
    this.render();
  }

  setVolume(which: (typeof VOLUMES)[number], value: number): void {
    this.ports.settings.set({ [which]: value });
    this.render();
  }

  setQuality(choice: QualityChoice): void {
    this.ports.quality?.set(choice);
    this.render();
  }

  toggle(which: 'muted' | 'barkSubtitles' | 'hints'): void {
    if (which === 'hints') {
      const h = this.ports.hints;
      if (h) h.set(!h.get());
    } else {
      this.ports.settings.set({ [which]: !this.ports.settings.get()[which] });
    }
    this.render();
  }

  /** Waits for the next key or button for `action`'s `slot`. A second call replaces the first. */
  startCapture(action: Action, slot: 0 | 1): void {
    this.stopCapture();
    this.pending = null;
    const cancel = this.ports.listen((b) => this.onCaptured(b));
    this.capture = { action, slot, cancel };
    this.status = this.t('settings.controls.press');
    this.render();
  }

  clearBinding(action: Action, slot: 0 | 1): void {
    this.stopCapture();
    this.ports.bindings.clear(action, slot);
    this.status = null;
    this.render();
  }

  resetControls(): void {
    this.stopCapture();
    this.ports.bindings.resetToDefaults();
    this.status = this.t('settings.controls.resetDone');
    this.render();
  }

  async save(): Promise<void> {
    if (this.saving) return;
    if (!this.ports.canSave()) {
      this.status = this.t('settings.save.blocked');
      this.render();
      return;
    }
    this.saving = true;
    this.status = this.t('settings.save.saving');
    this.render();
    let r: SaveResult = 'failed';
    try {
      r = await this.ports.save();
    } catch {
      r = 'failed';
    }
    this.saving = false;
    if (this.disposed) return;
    this.status = this.t(r === 'done' ? 'settings.save.done' : r === 'blocked' ? 'settings.save.blocked' : 'settings.save.failed');
    this.render();
  }

  /** Re-renders when something outside changed (a save hold started, the quality governor moved). */
  update(): void {
    this.render();
  }

  dispose(): void {
    this.disposed = true;
    this.stopCapture();
    this.element.remove();
  }

  private onCaptured(b: Binding): void {
    const cap = this.capture;
    if (!cap) return;
    const { action, slot } = cap;
    const key = glyphOf(b);
    const swap = !!this.pending && this.pending.action === action && this.pending.slot === slot && sameBinding(this.pending.binding, b);
    const r = this.ports.bindings.rebind(action, slot, b, { swap });
    this.capture = null;
    this.pending = null;
    if (r.ok) {
      this.status = r.swappedWith
        ? this.t('settings.controls.swapped', { key, other: this.actionName(r.swappedWith), action: this.actionName(action) })
        : this.t('settings.controls.changed', { action: this.actionName(action), key });
    } else if (r.reason === 'conflict') {
      // Keep listening: the same key again swaps the two.
      this.pending = { action, slot, binding: b };
      this.capture = { action, slot, cancel: this.ports.listen((nb) => this.onCaptured(nb)) };
      this.status = this.t('settings.controls.conflict', { key, other: this.actionName(r.conflictWith) });
    } else {
      this.status = this.t('settings.controls.reserved', { key });
    }
    this.render();
  }

  private stopCapture(): void {
    if (!this.capture) return;
    try {
      this.capture.cancel();
    } catch {
      // a listener that failed to detach is the plugin's problem, not the menu's
    }
    this.capture = null;
    this.pending = null;
  }

  private actionName(a: Action): string {
    const s = this.t(`settings.action.${a}`);
    return s.startsWith('[[') ? a : s;
  }

  private signature(): string {
    const s = this.ports.settings.get();
    const binds = this._page === 'controls' ? controlRows().map((r) => this.ports.bindings.get(r.action).map((b) => (b ? glyphOf(b) : '')).join('/')) : [];
    return JSON.stringify([
      this._page, this.status, this.confirming?.id ?? null, this.items().map((i) => i.id), this.saving, this.capturing, s, this.ports.quality?.get() ?? null, this.ports.hints?.get() ?? null,
      this.ports.canSave(), binds,
    ]);
  }

  private render(): void {
    if (this.disposed) return;
    const sig = this.signature();
    if (sig === this.sig) return;
    this.sig = sig;
    this.body.replaceChildren();
    const page = this._page;
    this.element.className = `owg-card owg-pause owg-pause-${page}`;
    if (page === 'main') this.renderMain();
    else if (page === 'settings') this.renderSettings();
    else if (page === 'controls') this.renderControls();
    else if (page === 'quit') this.renderQuit();
    else this.renderConfirm();
    if (this.status) makeEl(this.doc, 'div', 'owg-pause-status', this.body).textContent = this.status;
    makeEl(this.doc, 'div', 'owg-card-hint', this.body).textContent = this.t('settings.pause.hint');
  }

  private button(parent: ElementLike, labelKey: string, onClick: () => void, opts: { off?: boolean; on?: boolean; id?: string } = {}): ElementLike {
    const b = makeEl(this.doc, 'button', `owg-btn${opts.off ? ' owg-btn-off' : ''}${opts.on ? ' owg-btn-on' : ''}`, parent);
    b.textContent = labelKey.startsWith('=') ? labelKey.slice(1) : this.t(labelKey);
    if (opts.id) b.setAttribute('data-id', opts.id);
    b.onclick = () => onClick();
    return b;
  }

  private title(key: string): void {
    makeEl(this.doc, 'h2', 'owg-card-title', this.body).textContent = this.t(key);
  }

  private renderMain(): void {
    this.title('settings.pause.title');
    const list = makeEl(this.doc, 'div', 'owg-pause-list', this.body);
    this.button(list, 'settings.pause.resume', () => this.ports.resume(), { id: 'resume' });
    this.button(list, 'settings.pause.settings', () => this.go('settings'), { id: 'settings' });
    this.button(list, 'settings.pause.controls', () => this.go('controls'), { id: 'controls' });
    this.button(list, 'settings.pause.save', () => void this.save(), { id: 'save', off: !this.ports.canSave() || this.saving });
    for (const item of this.items()) this.button(list, item.labelKey, () => this.select(item), { id: `item-${item.id}` });
    this.button(list, 'settings.pause.quit', () => this.go('quit'), { id: 'quit' });
  }

  private items(): readonly PauseItem[] {
    try {
      return this.ports.items?.() ?? [];
    } catch {
      return [];
    }
  }

  /** An added item: straight to `onSelect`, or through the confirm page when it has a confirm text. */
  select(item: PauseItem): void {
    if (item.confirmKey) {
      this.confirming = item;
      this.go('confirm');
      return;
    }
    this.run(item);
  }

  private run(item: PauseItem): void {
    try {
      item.onSelect();
    } catch (e) {
      console.error(`[settings] pause item "${item.id}" failed`, e);
    }
  }

  private renderConfirm(): void {
    const item = this.confirming;
    if (!item) {
      this._page = 'main';
      this.renderMain();
      return;
    }
    makeEl(this.doc, 'p', 'owg-pause-note', this.body).textContent = this.t(item.confirmKey ?? item.labelKey);
    const actions = makeEl(this.doc, 'div', 'owg-pause-actions', this.body);
    this.button(actions, 'settings.confirm', () => this.run(item), { id: 'confirm-yes' });
    this.button(actions, 'settings.quit.cancel', () => this.go('main'), { id: 'confirm-no' });
  }

  private row(parent: ElementLike, labelKey: string): ElementLike {
    const r = makeEl(this.doc, 'div', 'owg-pause-row', parent);
    makeEl(this.doc, 'span', 'owg-pause-label', r).textContent = this.t(labelKey);
    return makeEl(this.doc, 'span', 'owg-pause-ctrl', r);
  }

  private renderSettings(): void {
    this.title('settings.title');
    const s = this.ports.settings.get();
    makeEl(this.doc, 'h3', 'owg-pause-head', this.body).textContent = this.t('settings.audio');
    for (const v of VOLUMES) {
      const c = this.row(this.body, `settings.volume.${v}`);
      this.button(c, '=−', () => this.setVolume(v, s[v] - VOLUME_STEP), { id: `${v}-down`, off: s[v] <= 0 });
      makeEl(this.doc, 'span', 'owg-pause-value', c).textContent = `${s[v]}`;
      this.button(c, '=+', () => this.setVolume(v, s[v] + VOLUME_STEP), { id: `${v}-up`, off: s[v] >= 100 });
    }
    this.onOff(this.row(this.body, 'settings.muted'), s.muted, () => this.toggle('muted'), 'muted');
    const q = this.ports.quality;
    if (q) {
      makeEl(this.doc, 'h3', 'owg-pause-head', this.body).textContent = this.t('settings.graphics');
      const c = this.row(this.body, 'settings.quality');
      const cur = q.get();
      for (const choice of QUALITY_CHOICES) this.button(c, `settings.quality.${choice}`, () => this.setQuality(choice), { id: `quality-${choice}`, on: cur === choice });
      if (cur === 'auto') makeEl(this.doc, 'div', 'owg-pause-note', this.body).textContent = this.t('settings.quality.autoNote');
    }
    makeEl(this.doc, 'h3', 'owg-pause-head', this.body).textContent = this.t('settings.help');
    const h = this.ports.hints;
    if (h) this.onOff(this.row(this.body, 'settings.hintsAlways'), h.get(), () => this.toggle('hints'), 'hints');
    this.onOff(this.row(this.body, 'settings.barkSubtitles'), s.barkSubtitles, () => this.toggle('barkSubtitles'), 'barkSubtitles');
    const actions = makeEl(this.doc, 'div', 'owg-pause-actions', this.body);
    this.button(actions, 'settings.back', () => this.go('main'), { id: 'back' });
  }

  private onOff(parent: ElementLike, on: boolean, flip: () => void, id: string): void {
    this.button(parent, on ? 'settings.on' : 'settings.off', flip, { id, on });
  }

  private renderControls(): void {
    this.title('settings.controls.title');
    const list = makeEl(this.doc, 'div', 'owg-pause-controls', this.body);
    const rows = controlRows();
    const cap = this.capturing;
    for (const g of CONTROL_GROUPS) {
      const inGroup = rows.filter((r) => r.group === g);
      if (inGroup.length === 0) continue;
      makeEl(this.doc, 'h3', 'owg-pause-head', list).textContent = this.t(`settings.group.${g}`);
      for (const r of inGroup) {
        const c = this.row(list, r.labelKey);
        const pair = this.ports.bindings.get(r.action);
        for (const slot of [0, 1] as const) {
          const b = pair[slot];
          const waiting = cap?.action === r.action && cap.slot === slot;
          const label = waiting ? '=…' : `=${b ? glyphOf(b) : this.t('settings.controls.none')}`;
          this.button(c, label, () => this.startCapture(r.action, slot), { id: `bind-${r.action}-${slot}`, on: waiting });
        }
        this.button(c, 'settings.controls.clear', () => this.clearBinding(r.action, 1), { id: `clear-${r.action}`, off: !pair[1] });
      }
    }
    const actions = makeEl(this.doc, 'div', 'owg-pause-actions', this.body);
    this.button(actions, 'settings.controls.reset', () => this.resetControls(), { id: 'reset' });
    this.button(actions, 'settings.back', () => this.go('main'), { id: 'back' });
  }

  private renderQuit(): void {
    this.title('settings.quit.title');
    makeEl(this.doc, 'p', 'owg-pause-note', this.body).textContent = this.t(this.ports.canSave() ? 'settings.quit.saves' : 'settings.quit.unsaved');
    const actions = makeEl(this.doc, 'div', 'owg-pause-actions', this.body);
    this.button(actions, 'settings.quit.confirm', () => this.ports.quit(), { id: 'quit-confirm' });
    this.button(actions, 'settings.quit.cancel', () => this.go('main'), { id: 'quit-cancel' });
  }
}

function sameBinding(a: Binding, b: Binding): boolean {
  return a.device === 'key' ? b.device === 'key' && a.code === b.code : b.device === 'mouse' && a.button === b.button;
}
