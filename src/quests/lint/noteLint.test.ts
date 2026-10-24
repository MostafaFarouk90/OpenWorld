import { describe, expect, it } from 'vitest';
import { NOTES_UNDER_NPCS } from '../content/act2/notes';
import { QUEST_NOTES } from '../content/notes';
import { ACT2_QUEST_NOTES } from '../content/act2';
import { NOTE_LINT_ALLOW, findNoteHits, shippedNoteInput, unlistedNoteHits, type NoteLintInput } from './noteLint';
import { isAct3Id } from './act3Ids';

const input = shippedNoteInput();
const hits = findNoteHits(input);

describe('note lint over the shipped content', () => {
  it('resolves every note anchor', () => {
    for (const n of input.notes) expect(input.anchors.has(n.anchorId), n.anchorId).toBe(true);
    expect(input.notes.length).toBe(QUEST_NOTES.length + ACT2_QUEST_NOTES.length);
  });

  it('has no unlisted hit', () => {
    const rest = unlistedNoteHits(hits);
    expect(rest.map((h) => `${h.noteId} vs ${h.other} (${h.kind} ${h.distance.toFixed(2)} m)`)).toEqual([]);
  });

  it('every allow entry still matches a real hit (a stale entry is removed)', () => {
    for (const a of NOTE_LINT_ALLOW) {
      expect(hits.some((h) => h.noteId === a.noteId && h.other === a.other), `${a.noteId} / ${a.other}`).toBe(true);
    }
  });

  it('every allow entry carries a reason and an owner, and none names an Act 3 id', () => {
    for (const a of NOTE_LINT_ALLOW) {
      expect(a.reason.length).toBeGreaterThan(5);
      expect(a.owner.length).toBeGreaterThan(2);
      expect(isAct3Id(a.noteId), a.noteId).toBe(false);
      expect(isAct3Id(a.other), a.other).toBe(false);
    }
    const m22 = NOTE_LINT_ALLOW.find((a) => a.noteId === 'note-m22-stalls')!;
    expect(m22).toMatchObject({ other: 'npc:gerta', reason: 'possible M22 stall, polish batch', owner: 'polish batch' });
  });

  it('NOTES_UNDER_NPCS holds the three Act 2 notes and no Act 3 note', () => {
    expect([...NOTES_UNDER_NPCS.keys()].sort()).toEqual(['note-m13-shield', 'note-m15-map', 'note-r11-camp-1']);
    for (const id of NOTES_UNDER_NPCS.keys()) expect(isAct3Id(id), id).toBe(false);
    for (const n of NOTES_UNDER_NPCS.values()) expect(isAct3Id(n.quest)).toBe(false);
  });

  it('finds the three same-anchor NPC notes and the Gerta stall', () => {
    const anchorHits = hits.filter((h) => h.kind === 'anchor').map((h) => `${h.noteId}/${h.other}`);
    expect(anchorHits).toEqual(expect.arrayContaining(['note-m13-shield/npc:ealdred', 'note-r11-camp-1/npc:wynne', 'note-m15-map/npc:corwin']));
    expect(hits.some((h) => h.noteId === 'note-m22-stalls' && h.other === 'npc:gerta')).toBe(true);
  });
});

describe('note lint rules (synthetic)', () => {
  const anchors = new Map([
    ['a.note', [{ space: 'world', x: 0, z: 0 }]],
    ['a.close', [{ space: 'world', x: 2, z: 0 }]],
    ['a.far', [{ space: 'world', x: 2.6, z: 0 }]],
    ['a.other-room', [{ space: 'cellar', x: 1, z: 0 }]],
  ]);
  const base = (anchorOf: string, id = 'npc:x'): NoteLintInput => ({
    notes: [{ interactableId: 'use:note-m30-x', anchorId: 'a.note' }],
    occupants: [{ id, kind: 'npc', anchorId: anchorOf }],
    anchors,
  });

  it('reports a shared anchor id', () => {
    expect(findNoteHits(base('a.note'))).toEqual([{ noteId: 'note-m30-x', other: 'npc:x', kind: 'anchor', distance: 0 }]);
  });
  it('reports a neighbour inside 2.5 m but not outside it', () => {
    expect(findNoteHits(base('a.close'))).toHaveLength(1);
    expect(findNoteHits(base('a.far'))).toEqual([]);
  });
  it('ignores a neighbour in another space', () => {
    expect(findNoteHits(base('a.other-room'))).toEqual([]);
  });
  it('ignores an occupant whose anchor is unknown', () => {
    expect(findNoteHits(base('a.missing'))).toEqual([]);
  });
  it('an unlisted Act 3 pair stays a failure; a listed pair is removed', () => {
    const h = findNoteHits(base('a.note'));
    expect(unlistedNoteHits(h)).toHaveLength(1);
    expect(unlistedNoteHits(h, [{ noteId: 'note-m30-x', other: 'npc:x', reason: 'r', owner: 'o' }])).toEqual([]);
  });
});
