// Note lint (contracts v0.7 item 20, the Act 2 interaction-focus lesson): a readable note must not sit on an NPC post,
// a quest prop or a carry item, because the focus pick then favours the other interactable and the note can be
// unreachable (the Corwin playtest bug). A note is a hit when it shares an anchor id with one of them, or stands within
// NOTE_LINT_RADIUS (the NPC talk radius, x and z only) of one in the same space, unless the allow list names the pair.
// Anchors are resolved from every layout (space 'world') and every interior definition (space = the interior id).
import { BRIGHTWATER_LAYOUT } from '../../region/brightwater.layout';
import { DEADROAD_LAYOUT } from '../../region/deadroad.layout';
import { HARROWMARK_LAYOUT } from '../../harrowmark/harrowmark.layout';
import { DENSITY_LAYOUT_HM } from '../../harrowmark/density.layout';
import { CINDERREACH_LAYOUT } from '../../cinderreach/cinderreach.layout';
import { OLDSMOKE_LAYOUT } from '../../oldsmoke/oldsmoke.layout';
import { ACT2_WORLD_LAYOUT } from '../../region/act2/act2World.layout';
import { GREYFEN_FAUNA_LAYOUT } from '../../enemies/fen/greyfenFauna.layout';
import type { LayoutData } from '../../region/layoutTypes';
import { ALL_INTERIORS } from '../../interiors/interiors.plugin';
import { TUTORIAL_ANCHORS } from '../../tutorial/beats';
import { QUEST_NOTES } from '../content/notes';
import { QUEST_PROPS } from '../content/props';
import { CARRY_ITEMS } from '../content/carry';
import { ACT2_QUEST_NOTES, ACT2_PROPS, ACT2_CARRY } from '../content/act2';
import type { QuestNoteSpec } from '../notes';

/** The NPC talk radius in metres (src/npcs/tuning.ts `talkRadius`). */
export const NOTE_LINT_RADIUS = 2.5;

/** Every world layout the game ships (Brightwater already folds in the corridor and the density pass A). */
export const ALL_LAYOUTS: readonly LayoutData[] = [
  BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT, HARROWMARK_LAYOUT, DENSITY_LAYOUT_HM, CINDERREACH_LAYOUT, OLDSMOKE_LAYOUT, ACT2_WORLD_LAYOUT,
  GREYFEN_FAUNA_LAYOUT,
];

export interface NoteLintAllow {
  noteId: string;
  /** `npc:<id>`, or the prop or carry interactable id (`use:...`, `pickup:...`). */
  other: string;
  reason: string;
  /** The thread that can clear the entry. */
  owner: string;
}

export const NOTE_LINT_ALLOW: readonly NoteLintAllow[] = [
  { noteId: 'note-m13-shield', other: 'npc:ealdred', reason: 'handled by outranks (NOTES_UNDER_NPCS, tested in notesUnderNpcs.test.ts)', owner: 'K0 (shipped Act 1 and 2)' },
  { noteId: 'note-r11-camp-1', other: 'npc:wynne', reason: 'handled by outranks (NOTES_UNDER_NPCS, tested in notesUnderNpcs.test.ts)', owner: 'K0 (shipped Act 1 and 2)' },
  { noteId: 'note-m15-map', other: 'npc:corwin', reason: 'handled by outranks (NOTES_UNDER_NPCS, tested in notesUnderNpcs.test.ts)', owner: 'K0 (shipped Act 1 and 2)' },
  { noteId: 'note-m22-stalls', other: 'npc:gerta', reason: 'handled by outranks since polish pass 3 (#144; NOTES_UNDER_NPCS, tested in notesUnderNpcs.test.ts)', owner: 'K0 (shipped Act 1 and 2)' },
  { noteId: 'note-m03-ember', other: 'use:d01-altar', reason: 'time-disjoint: the note reads only during M03, the altar is enabled only while D01 altar is current', owner: 'K0 (shipped Act 1 and 2)' },
];

/** A position in a space: 'world' for layouts, the interior id for an interior's local coordinates. */
export interface Placed { space: string; x: number; z: number }

export interface Occupant { id: string; kind: 'npc' | 'prop' | 'carry'; anchorId: string }

export interface NoteLintInput {
  notes: readonly Pick<QuestNoteSpec, 'interactableId' | 'anchorId'>[];
  occupants: readonly Occupant[];
  /** anchor id to every place it is defined (layouts and interiors) */
  anchors: ReadonlyMap<string, readonly Placed[]>;
}

export interface NoteHit {
  noteId: string;
  other: string;
  kind: 'anchor' | 'near';
  distance: number;
}

export function resolveAnchors(layouts: readonly LayoutData[], interiors: readonly { id: string; anchors: readonly { id: string; x: number; z: number }[] }[]): Map<string, Placed[]> {
  const out = new Map<string, Placed[]>();
  const add = (id: string, p: Placed) => void out.set(id, [...(out.get(id) ?? []), p]);
  for (const l of layouts) for (const a of l.anchors) add(a.id, { space: 'world', x: a.x, z: a.z });
  for (const a of TUTORIAL_ANCHORS) add(a.id, { space: 'world', x: a.x, z: a.z });
  for (const d of interiors) for (const a of d.anchors) add(a.id, { space: d.id, x: a.x, z: a.z });
  return out;
}

export function findNoteHits(input: NoteLintInput): NoteHit[] {
  const hits: NoteHit[] = [];
  for (const n of input.notes) {
    const noteId = n.interactableId.replace(/^use:/, '');
    const mine = input.anchors.get(n.anchorId) ?? [];
    for (const o of input.occupants) {
      if (o.anchorId === n.anchorId) {
        hits.push({ noteId, other: o.id, kind: 'anchor', distance: 0 });
        continue;
      }
      let best = Infinity;
      for (const b of input.anchors.get(o.anchorId) ?? []) {
        for (const a of mine) {
          if (a.space === b.space) best = Math.min(best, Math.hypot(a.x - b.x, a.z - b.z));
        }
      }
      if (best <= NOTE_LINT_RADIUS) hits.push({ noteId, other: o.id, kind: 'near', distance: best });
    }
  }
  return hits;
}

export function shippedNoteInput(): NoteLintInput {
  const npcs: Occupant[] = [
    ...ALL_LAYOUTS.flatMap((l) => l.npcs.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, anchorId: n.post }))),
    ...TUTORIAL_ANCHORS.map((a) => ({ id: `npc:${a.id}`, kind: 'npc' as const, anchorId: a.id })),
  ];
  const props = [...QUEST_PROPS, ...ACT2_PROPS].map((p) => ({ id: p.interactableId, kind: 'prop' as const, anchorId: p.anchorId }));
  const carry = [...CARRY_ITEMS, ...ACT2_CARRY].map((c) => ({ id: c.interactableId, kind: 'carry' as const, anchorId: c.homeAnchor }));
  return {
    notes: [...QUEST_NOTES, ...ACT2_QUEST_NOTES],
    occupants: [...npcs, ...props, ...carry],
    anchors: resolveAnchors(ALL_LAYOUTS, ALL_INTERIORS),
  };
}

/** Hits not covered by the allow list. */
export function unlistedNoteHits(hits: readonly NoteHit[], allow: readonly NoteLintAllow[] = NOTE_LINT_ALLOW): NoteHit[] {
  return hits.filter((h) => !allow.some((a) => a.noteId === h.noteId && a.other === h.other));
}
