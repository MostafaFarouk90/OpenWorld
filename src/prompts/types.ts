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
  /** 1 while shown, falling to 0 over the fade. */
  opacity: number;
  state: 'shown' | 'fading';
}
