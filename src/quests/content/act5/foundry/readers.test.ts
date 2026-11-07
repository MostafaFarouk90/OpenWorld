import { describe, expect, it } from 'vitest';
import { snapshotFlag } from '../../../../state/favour';
import { REKINDLE_SCAR_LIMIT, caelLivesFor, scarBand } from './scars';
import { SPIRIT_FLAME_CAP, SPIRIT_FLAME_STRINGS, spiritFlamesFor } from './spiritFlames';
import { f1, f5, f6, f8, guardsTurned, openRimQuests, pyresLit, r30Verse, veyOutcome, type QuestStateReader } from './readers';

const flags = (o: Record<string, unknown>) => ({ getFlag: (k: string) => o[k] });
const snap = (id: string, v: Partial<Record<'halvard' | 'oswin' | 'grisel' | 'dragons' | 'ashwalkers', number>>): Record<string, unknown> => ({
  [snapshotFlag(id, 'taken')]: true,
  ...Object.fromEntries(Object.entries(v).map(([t, n]) => [snapshotFlag(id, t as 'halvard'), n])),
});

describe('the Rekindle rule (Q13)', () => {
  it('lives at 7, dies at 8 and 12; bad counts read as 0', () => {
    expect(REKINDLE_SCAR_LIMIT).toBe(8);
    expect(caelLivesFor(0)).toBe(true);
    expect(caelLivesFor(7)).toBe(true);
    expect(caelLivesFor(8)).toBe(false);
    expect(caelLivesFor(12)).toBe(false);
    expect(caelLivesFor(Number.NaN)).toBe(true);
    expect(caelLivesFor(-3)).toBe(true);
  });
  it('scar bands for the dragons under Let It Die', () => {
    expect([0, 7, 8, 11, 12, 30].map(scarBand)).toEqual(['light', 'light', 'heavy', 'heavy', 'grave', 'grave']);
  });
});

describe('the choice readers', () => {
  it('fall back cleanly on unset flags', () => {
    const f = flags({});
    expect(f1(f)).toBe('spy');
    expect(f5(f)).toBe('none');
    expect(f6(f)).toBe('all');
    expect(f8(f)).toBe('half');
    expect(veyOutcome(f)).toBe('spared');
    expect(pyresLit(f)).toBe(0);
    expect(r30Verse(f)).toBeUndefined();
  });
  it('read every value', () => {
    expect(f1(flags({ 'story.m21.choice': 'confront' }))).toBe('confront');
    for (const v of ['miners', 'stewards', 'compromise'] as const) expect(f5(flags({ 'story.r10.choice': v }))).toBe(v);
    expect(f6(flags({ 'story.r21.choice': 'leaders' }))).toBe('leaders');
    expect(f8(flags({ 'story.r24.choice': 'all' }))).toBe('all');
    expect(veyOutcome(flags({ 'boss.vey.outcome': 'defeated' }))).toBe('defeated');
    expect(pyresLit(flags({ 'story.r28.pyres': 9 }))).toBe(4);
    expect(r30Verse(flags({ 'story.r30.verse': 'keepers' }))).toBe('keepers');
    expect(r30Verse(flags({ 'story.r30.verse': 'nonsense' }))).toBeUndefined();
  });
  it('D09: Wenna turns all four at Grisel 25, two at 24, none under Confront', () => {
    expect(guardsTurned(flags(snap('d09', { grisel: 25 })))).toBe(4);
    expect(guardsTurned(flags(snap('d09', { grisel: 24 })))).toBe(2);
    expect(guardsTurned(flags({ ...snap('d09', { grisel: 90 }), 'story.m21.choice': 'confront' }))).toBe(0);
    // no snapshot (never in play): read as Cold
    expect(guardsTurned(flags({}))).toBe(2);
  });
  it('reads the D09 snapshot, not live favour', () => {
    expect(guardsTurned(flags({ ...snap('d09', { grisel: 10 }), 'favour.grisel': 80 }))).toBe(2);
  });
});

describe('openRimQuests (Q12)', () => {
  const q = (s: Record<string, QuestStateReader extends { state(id: string): infer R } ? R : never>, offered: string[] = []): QuestStateReader =>
    ({ state: (id) => s[id], canStart: (id) => offered.includes(id) });
  it('lists active and offered rim quests, in R28, R29, R30 order', () => {
    expect(openRimQuests(q({ r28: 'active', r29: 'completed', r30: 'inactive' }, ['r30']))).toEqual(['r28', 'r30']);
    expect(openRimQuests(q({ r28: 'inactive', r29: 'active', r30: 'inactive' }))).toEqual(['r29']);
  });
  it('drops a missing def, a completed or failed quest and one not offered', () => {
    expect(openRimQuests(q({ r28: 'completed', r29: 'failed' }))).toEqual([]);
    expect(openRimQuests({ state: () => 'inactive' })).toEqual([]);
  });
});

describe('spiritFlamesFor (D10, N6 takes the first ten)', () => {
  it('a sparse save still has the companions, Rook and Edric', () => {
    const ids = spiritFlamesFor(flags({})).map((x) => x.id);
    expect(ids.slice(0, 3)).toEqual(['tobb', 'hrolf', 'aelfreda']);
    expect(ids).toContain('rook');
    expect(ids).toContain('edric');
    expect(ids).not.toContain('gaut');
    expect(ids).not.toContain('eormen');
  });
  it('a full save in the priority order, unique ids, every label has a string', () => {
    const f = flags({
      ...snap('m52', { halvard: 75, oswin: 60, grisel: 55, dragons: 80, ashwalkers: 70 }),
      'story.m36.delegate.halvard': 'won', 'story.m36.delegate.oswin': 'won', 'story.m36.delegate.grisel': 'won',
      'story.r11.choice': 'spared', 'story.r24.choice': 'all', 'story.m39.oathblade': true, 'boss.eormen.outcome': 'released',
    });
    const ids = spiritFlamesFor(f).map((x) => x.id);
    expect(ids).toEqual([
      'tobb', 'hrolf', 'aelfreda', 'gaut', 'house-halvard', 'house-oswin', 'house-grisel',
      'dragon-ysmeryth', 'dragon-hathren', 'dragon-orsk', 'dragon-hill-wyrm', 'ashwalkers', 'rook', 'edric', 'eormen',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(SPIRIT_FLAME_CAP);
    for (const x of spiritFlamesFor(f)) expect(SPIRIT_FLAME_STRINGS[x.labelKey], x.id).toBeTruthy();
  });
});
