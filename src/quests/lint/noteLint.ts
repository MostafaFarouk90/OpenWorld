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
import { DRAGONSPINE_FAUNA_LAYOUT } from '../../enemies/peak/dragonspineFauna.layout';
import { DRAGONSPINE_LAYOUT } from '../../dragonspine/dragonspine.layout';
import type { LayoutData } from '../../region/layoutTypes';
import { ALL_INTERIORS } from '../../interiors/interiors.plugin';
import { TUTORIAL_ANCHORS } from '../../tutorial/beats';
import { QUEST_NOTES } from '../content/notes';
import { QUEST_PROPS } from '../content/props';
import { CARRY_ITEMS } from '../content/carry';
import { ACT2_QUEST_NOTES, ACT2_PROPS, ACT2_CARRY } from '../content/act2';
import { ACT3_QUEST_NOTES, ACT3_PROPS, ACT3_CARRY } from '../content/act3';
import { GREYFEN_QUEST_LAYOUT } from '../content/act3/greyfen/extraAnchors';
import { ACT4_QUEST_NOTES, ACT4_PROPS, ACT4_CARRY } from '../content/act4';
import { ACT5_QUEST_NOTES, ACT5_PROPS, ACT5_CARRY } from '../content/act5';
import { harrowmarkA4InteriorExtras, harrowmarkA4QuestLayout } from '../content/act4/harrowmark/layout';
import { HARROWMARK_A4_Q_NPCS } from '../content/act4/harrowmark/npcs';
import { wasteA4InteriorExtras, wasteA4QuestLayout } from '../content/act4/waste/layout';
// Act 5 (N10, additive)
import { rimA5InteriorExtras, rimA5QuestLayout } from '../content/act5/rim/layout';
import { foundryA5InteriorExtras, foundryA5QuestLayout } from '../content/act5/foundry/layout';
import { WASTE_A4_NPCS } from '../content/act4/waste/npcs';
import type { QuestNoteSpec } from '../notes';
import { ACT3_POI_LAYOUT } from '../../world/poi/act3/place';

/** The NPC talk radius in metres (src/npcs/tuning.ts `talkRadius`). */
export const NOTE_LINT_RADIUS = 2.5;

/** Every world layout the game ships (Brightwater already folds in the corridor and the density pass A). */
export const ALL_LAYOUTS: readonly LayoutData[] = [
  BRIGHTWATER_LAYOUT, DEADROAD_LAYOUT, HARROWMARK_LAYOUT, DENSITY_LAYOUT_HM, CINDERREACH_LAYOUT, OLDSMOKE_LAYOUT, ACT2_WORLD_LAYOUT,
  GREYFEN_FAUNA_LAYOUT, DRAGONSPINE_LAYOUT, ACT3_POI_LAYOUT, DRAGONSPINE_FAUNA_LAYOUT,
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
  { noteId: 'note-m39-token', other: 'use:m39-barricade', reason: 'time-disjoint: M39 is sequential, the barricade is used (and spent) before the token objective is current', owner: 'L10 (Act 4 Harrowmark quests)' },
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
    ...[...ALL_LAYOUTS, GREYFEN_QUEST_LAYOUT].flatMap((l) => l.npcs.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, anchorId: n.post }))),
    ...TUTORIAL_ANCHORS.map((a) => ({ id: `npc:${a.id}`, kind: 'npc' as const, anchorId: a.id })),
    ...HARROWMARK_A4_Q_NPCS.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, anchorId: n.post })),
    ...WASTE_A4_NPCS.map((n) => ({ id: `npc:${n.id}`, kind: 'npc' as const, anchorId: n.post })),
  ];
  const props = [...QUEST_PROPS, ...ACT2_PROPS, ...ACT3_PROPS, ...ACT4_PROPS, ...ACT5_PROPS].map((p) => ({ id: p.interactableId, kind: 'prop' as const, anchorId: p.anchorId }));
  const carry = [...CARRY_ITEMS, ...ACT2_CARRY, ...ACT3_CARRY, ...ACT4_CARRY, ...ACT5_CARRY].map((c) => ({ id: c.interactableId, kind: 'carry' as const, anchorId: c.homeAnchor }));
  return {
    notes: [...QUEST_NOTES, ...ACT2_QUEST_NOTES, ...ACT3_QUEST_NOTES, ...ACT4_QUEST_NOTES, ...ACT5_QUEST_NOTES],
    occupants: [...npcs, ...props, ...carry],
    anchors: resolveAnchors([...ALL_LAYOUTS, GREYFEN_QUEST_LAYOUT, harrowmarkA4QuestLayout(), wasteA4QuestLayout(), rimA5QuestLayout(), foundryA5QuestLayout()], [...ALL_INTERIORS, ...harrowmarkA4InteriorExtras(), ...wasteA4InteriorExtras(), ...rimA5InteriorExtras(), ...foundryA5InteriorExtras()]),
  };
}

/** Hits not covered by the allow list. */
export function unlistedNoteHits(hits: readonly NoteHit[], allow: readonly NoteLintAllow[] = NOTE_LINT_ALLOW): NoteHit[] {
  return hits.filter((h) => !allow.some((a) => a.noteId === h.noteId && a.other === h.other));
}
