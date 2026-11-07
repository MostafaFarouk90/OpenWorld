import { describe, expect, it } from 'vitest';
import { REKINDLE_SCAR_LIMIT } from './ports';
import { lastChanceNote, scarNote } from './scarNote';
import { ACT5_JOURNAL_STRINGS_EN } from './strings.en';

const t = (k: string, p?: Record<string, string | number>): string => (ACT5_JOURNAL_STRINGS_EN[k] ?? k).replace(/\{(\w+)\}/g, (_, n: string) => String(p?.[n] ?? `{${n}}`));
const flags = (on: string[]) => (k: string) => on.includes(k);

describe('scarNote (Q13)', () => {
  it('is hidden before M54 starts and after the choice', () => {
    expect(scarNote({ flag: flags([]), scars: () => 3, t })).toBeNull();
    expect(scarNote({ flag: flags(['story.m54.started', 'story.m56.choice']), scars: () => 3, t })).toBeNull();
  });
  it.each([
    [0, 'lives'],
    [REKINDLE_SCAR_LIMIT - 1, 'lives'],
    [REKINDLE_SCAR_LIMIT, 'dies'],
    [12, 'dies'],
  ])('with %i Scars Cael %s', (n, which) => {
    const note = scarNote({ flag: flags(['story.m54.started']), scars: () => n, t })!;
    expect(note.lines[0]).toContain(`Scars: ${n}.`);
    expect(note.lines[0]).toContain(which === 'dies' ? "takes Cael's life" : 'would live');
  });
  it('names the Rite until it is spent; an unknown Scar count shows nothing', () => {
    const on = ['story.m54.started'];
    expect(scarNote({ flag: flags(on), scars: () => 2, t })!.lines).toHaveLength(2);
    expect(scarNote({ flag: flags([...on, 'aelfreda.rite.a5']), scars: () => 2, t })!.lines).toHaveLength(1);
    expect(scarNote({ flag: flags(on), scars: () => undefined, t })).toBeNull();
  });
});

describe('lastChanceNote (Q12)', () => {
  const defs = new Set(['r28', 'r29', 'r30']);
  const ports = (states: Record<string, string>, on: string[] = []) => ({
    flag: flags(on),
    questState: (id: string) => states[id] ?? 'inactive',
    questDef: (id: string) => (defs.has(id) ? { titleKey: `title.${id}` } : undefined),
    t,
  });
  const ready = { d09: 'completed', r27: 'completed' };
  it('lists the optional quests still open once D09 and R27 are done and M54 has not started', () => {
    const n = lastChanceNote(ports({ ...ready, r28: 'completed', r29: 'active' }))!;
    expect(n.lines).toEqual(['title.r29', 'title.r30', ACT5_JOURNAL_STRINGS_EN['hud.journal.lastChance.optional']]);
  });
  it('waits for D09 and R27, and drops when nothing is open', () => {
    expect(lastChanceNote(ports({ d09: 'completed' }))).toBeNull();
    expect(lastChanceNote(ports({ ...ready, r28: 'completed', r29: 'completed', r30: 'failed' }))).toBeNull();
  });
  it('never shows once M54 is active, completed, or its flag is set (a load past it)', () => {
    expect(lastChanceNote(ports({ ...ready, m54: 'active' }))).toBeNull();
    expect(lastChanceNote(ports({ ...ready, m54: 'completed' }))).toBeNull();
    expect(lastChanceNote(ports(ready, ['story.m54.started']))).toBeNull();
  });
});
