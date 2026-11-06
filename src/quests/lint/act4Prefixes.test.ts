// v0.8 item 15: the Act 4 ids, flag owners and reserved prefixes. Nothing shipped before Act 4 uses them; Act 4 threads
// add their own owned sub-prefixes here (OWNED_*), as Act 3 did in act3Prefixes.test.ts.
import { describe, expect, it } from 'vitest';
import { ALL_INTERIORS } from '../../interiors/interiors.plugin';
import { TUTORIAL_ANCHORS } from '../../tutorial/beats';
import { ACT2_TRIGGERS } from '../content/act2';
import { OLDSMOKE_TRIGGERS } from '../content/act2/oldsmoke';
import { questDefs } from '../content';
import { ALL_LAYOUTS } from './noteLint';
import { ACT4_ANCHOR_PREFIXES, ACT4_FLAG_OWNERS, ACT4_QUEST_FLAG_OWNERS, ACT4_TRIGGER_PREFIXES } from './act4Flags';
import { ACT4_PHASE_G, ACT4_PHASE_H, ACT4_QUEST_IDS, isAct4Id } from './act4Ids';
import { ACT3_QUEST_IDS } from './act3Ids';
import { ACT4_WORLD_LAYOUT } from '../../region/act4/act4World.layout';

const anchorIds = [
  ...[...ALL_LAYOUTS, ACT4_WORLD_LAYOUT].flatMap((l) => l.anchors.map((a) => a.id)),
  ...TUTORIAL_ANCHORS.map((a) => a.id),
  ...ALL_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id)),
];
const triggerIds = [
  ...ALL_LAYOUTS.flatMap((l) => l.triggers.map((t) => t.id)),
  ...ACT2_TRIGGERS.map((t) => t.id),
  ...OLDSMOKE_TRIGGERS.map((t) => t.id),
  ...ALL_INTERIORS.flatMap((d) => d.triggers.map((t) => t.id)),
];

/** Act 4 sub-prefixes a thread owns and ships (L0: the fog faces' anchors, act4World.layout.ts). */
const OWNED_SUB_PREFIXES: readonly string[] = ['ashroad.fog.', 'waste.fog.'];
const OWNED_TRIGGER_SUB_PREFIXES: readonly string[] = [];

describe('Act 4 ids and reserved prefixes (v0.8 item 15)', () => {
  it('lists the 21 quests, split into Phase G and Phase H, none shared with Act 3', () => {
    expect(ACT4_QUEST_IDS).toHaveLength(21);
    expect(new Set([...ACT4_PHASE_G, ...ACT4_PHASE_H])).toEqual(new Set(ACT4_QUEST_IDS));
    expect(ACT4_PHASE_G.filter((q) => ACT4_PHASE_H.includes(q))).toEqual([]);
    for (const id of ACT4_QUEST_IDS) expect(ACT3_QUEST_IDS.includes(id), id).toBe(false);
  });

  it('isAct4Id matches whole ids only', () => {
    expect(isAct4Id('story.m38.complete')).toBe(true);
    expect(isAct4Id('note-d07-ledger')).toBe(true);
    expect(isAct4Id('use:r25-candle')).toBe(true);
    expect(isAct4Id('m350')).toBe(false); // not a quest id
    expect(isAct4Id('story.m34.complete')).toBe(false);
    expect(isAct4Id('dm38')).toBe(false);
  });

  it('owners cover the plan rows; every quest owns its own namespace', () => {
    const p = ACT4_FLAG_OWNERS.map((o) => o.pattern);
    for (const k of ['story.phase.wasteOpen', 'story.a4.campSeen', 'story.gate.a5', 'story.d07.ledgers', 'story.m36.delegate.<id>']) expect(p).toContain(k);
    expect(ACT4_FLAG_OWNERS.find((o) => o.pattern === 'story.gate.a5')!.owner).toBe('L13');
    expect(ACT4_QUEST_FLAG_OWNERS.map((o) => o.pattern)).toContain('story.m42.*');
    expect(ACT4_QUEST_FLAG_OWNERS).toHaveLength(21);
  });

  it('finds the shipped ids it checks against', () => {
    expect(anchorIds.length).toBeGreaterThan(500);
    expect(triggerIds.length).toBeGreaterThan(50);
  });

  it.each(ACT4_ANCHOR_PREFIXES)('no shipped anchor starts with %s outside an owned sub-prefix', (prefix) => {
    expect(anchorIds.filter((id) => id.startsWith(prefix) && !OWNED_SUB_PREFIXES.some((s) => id.startsWith(s)))).toEqual([]);
  });

  it.each(ACT4_TRIGGER_PREFIXES)('no shipped trigger starts with %s outside an owned sub-prefix', (prefix) => {
    expect(triggerIds.filter((id) => id.startsWith(prefix) && !OWNED_TRIGGER_SUB_PREFIXES.some((s) => id.startsWith(s)))).toEqual([]);
  });

  it('the prefixes are the ones of the plan (ashgate. added for the refuge outside the Waste)', () => {
    expect([...ACT4_ANCHOR_PREFIXES]).toEqual(['harrowmark.a4.', 'ashroad.', 'waste.', 'ashgate.']);
    expect([...ACT4_TRIGGER_PREFIXES]).toEqual(['trg.harrowmark.a4.', 'trg.waste.', 'trg.ashgate.', 'trg.ashroad.']);
  });

  it('no quest shipped before Act 4 uses an Act 4 id or an Act 4 quest flag', () => {
    const shipped = new Set(questDefs.map((q) => q.id));
    for (const id of ACT4_QUEST_IDS) expect(shipped.has(id), id).toBe(false);
    const json = JSON.stringify(questDefs);
    for (const id of ACT4_QUEST_IDS) expect(json.includes(`story.${id}.`), id).toBe(false);
  });
});
