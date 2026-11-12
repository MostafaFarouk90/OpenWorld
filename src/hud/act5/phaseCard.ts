// Act 5 N9 (plans/act5-N9.md section 5): "The Rim holds" recap rows. Pure; a row whose flag is missing drops its line.
import { RIM_HOLDS_ROWS } from './ports';

export function rimHoldsLines(flag: (k: string) => boolean, t: (key: string) => string): string[] {
  const lines: string[] = [];
  for (const r of RIM_HOLDS_ROWS) {
    let on = false;
    try {
      on = flag(r.flag);
    } catch {
      on = false;
    }
    if (on) lines.push(t(r.key));
  }
  lines.push(t('hud.phase.rimHolds.next'));
  return lines;
}
