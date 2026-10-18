import type { DialogueRunner, DialogueView } from './DialogueRunner';
import { portraitFor, type PortraitInfo } from './portraits';

export interface DialoguePanelModel {
  visible: boolean;
  speakerId: string;
  speakerName: string;
  portrait: PortraitInfo;
  text: string;
  choices: { number: number; id: string; text: string }[];
  /** shown when there are no choices */
  nextHint: string | null;
}

export interface PanelStrings { t(key: string): string; has(key: string): boolean }

export const EMPTY_MODEL: DialoguePanelModel = {
  visible: false, speakerId: '', speakerName: '', portrait: { color: '#444', initials: '?' }, text: '', choices: [], nextHint: null,
};

/** Pure mapping from the runner's view to what the panel shows. */
export function buildPanelModel(view: DialogueView | null, strings?: PanelStrings): DialoguePanelModel {
  if (!view) return EMPTY_MODEL;
  const nameKey = `npc.${view.speaker}.name`;
  let speakerName = view.speaker;
  if (view.speakerName !== undefined) speakerName = view.speakerName;
  else try { if (strings?.has(nameKey)) speakerName = strings.t(nameKey); } catch { /* keep id */ }
  let hint = 'Space: next';
  try { if (strings?.has('dialogue.next')) hint = strings.t('dialogue.next'); } catch { /* keep default */ }
  return {
    visible: true,
    speakerId: view.speaker,
    speakerName,
    portrait: portraitFor(view.portrait, view.speaker),
    text: view.text,
    choices: view.choices.map((c) => ({ ...c })),
    nextHint: view.choices.length === 0 ? hint : null,
  };
}

export interface DialoguePanelHandle { element: HTMLElement | null; dispose(): void }

export function createDialoguePanel(runner: DialogueRunner, doc?: Document): DialoguePanelHandle {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d) return { element: null, dispose() {} };
  const root = d.createElement('div');
  root.className = 'dialogue-panel';
  root.style.cssText = 'display:none;max-width:640px;margin:0 auto;padding:12px 16px;background:rgba(20,16,12,.9);color:#f2e8d5;border:1px solid #6b5a3e;border-radius:6px;font:16px/1.4 serif;pointer-events:auto;gap:12px;';
  const plate = d.createElement('div');
  plate.className = 'dialogue-portrait';
  plate.style.cssText = 'flex:0 0 56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:bold 24px sans-serif;color:#fff;';
  const body = d.createElement('div');
  body.style.cssText = 'flex:1;min-width:0;';
  const name = d.createElement('div');
  name.className = 'dialogue-speaker';
  name.style.cssText = 'font-weight:bold;color:#e0c070;margin-bottom:4px;';
  const text = d.createElement('div');
  text.className = 'dialogue-text';
  const list = d.createElement('ol');
  list.className = 'dialogue-choices';
  list.style.cssText = 'list-style:none;margin:8px 0 0;padding:0;';
  const hint = d.createElement('div');
  hint.className = 'dialogue-hint';
  hint.style.cssText = 'margin-top:8px;font-size:12px;opacity:.7;text-align:right;';
  body.append(name, text, list, hint);
  root.append(plate, body);
  root.addEventListener('click', (e) => {
    if (e.target === root || e.target === text || e.target === plate) runner.advance();
  });

  const render = (): void => {
    const m = buildPanelModel(runner.view(), runner.strings);
    root.style.display = m.visible ? 'flex' : 'none';
    if (!m.visible) return;
    plate.style.background = m.portrait.color;
    plate.textContent = m.portrait.initials;
    name.textContent = m.speakerName;
    text.textContent = m.text;
    list.textContent = '';
    for (const c of m.choices) {
      const li = d.createElement('li');
      li.style.cssText = 'cursor:pointer;padding:3px 0;';
      li.textContent = `${c.number}. ${c.text}`;
      li.addEventListener('click', () => runner.choose(c.number));
      list.append(li);
    }
    hint.textContent = m.nextHint ?? '';
    hint.style.display = m.nextHint ? 'block' : 'none';
  };
  const off = runner.onChange(render);
  render();
  return { element: root, dispose() { off(); root.remove(); } };
}

export interface PressedSource { pressed(action: string): boolean }

/** Maps dialogue input actions onto the runner. Call once per fixed tick. */
export function handleDialogueInput(runner: DialogueRunner, actions: PressedSource): void {
  if (!runner.isOpen) return;
  if (actions.pressed('dialogueNext')) { runner.advance(); return; }
  for (let n = 1; n <= 4; n++) {
    if (actions.pressed(`dialogueChoice${n}`)) { runner.choose(n); return; }
  }
}
