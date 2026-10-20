export type Action = string;

export interface PromptService {
  show(mechanic: string, action: Action, textKey: string, opts?: { force?: boolean }): void;
  success(mechanic: string): void;
  hide(mechanic?: string): void;
  count(mechanic: string): number;
  showHintsAlways: boolean;
}

export interface PromptRow {
  mechanic: string;
  text: string;
  /** The bound key glyph inside `text`, drawn as a keycap; absent when the text names no key. */
  key?: string;
  /** Index of `key` in `text` (where {key} was), so a matching letter earlier in the text is not taken for it. */
  keyAt?: number;
  /** 1 while shown, falling to 0 over the fade. */
  opacity: number;
  state: 'shown' | 'fading';
}
