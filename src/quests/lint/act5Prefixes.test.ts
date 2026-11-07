// v0.9 item 14: the Act 5 ids, flag owners and reserved prefixes. Nothing shipped before Act 5 uses them; Act 5 threads
// add their own owned sub-prefixes here (OWNED_*), as Act 4 did in act4Prefixes.test.ts.
import { describe, expect, it } from 'vitest';
import { ALL_INTERIORS } from '../../interiors/interiors.plugin';
import { TUTORIAL_ANCHORS } from '../../tutorial/beats';
import { ACT2_TRIGGERS } from '../content/act2';
import { OLDSMOKE_TRIGGERS } from '../content/act2/oldsmoke';
import { questDefs } from '../content';
import { ACT5_QUEST_DEFS } from '../content/act5';
import { ALL_LAYOUTS } from './noteLint';
import { ACT4_WORLD_LAYOUT } from '../../region/act4/act4World.layout';
import { WASTE_LAYOUT } from '../../waste/waste.layout';
import { CALDERA_LAYOUT } from '../../caldera/caldera.layout';
import { ACT5_ANCHOR_PREFIXES, ACT5_FLAG_OWNERS, ACT5_QUEST_FLAG_OWNERS, ACT5_TRIGGER_PREFIXES } from './act5Flags';
import { ACT5_PHASE_I, ACT5_PHASE_J, ACT5_QUEST_IDS, isAct5Id } from './act5Ids';
import { ACT4_QUEST_IDS } from './act4Ids';
import { ACT3_QUEST_IDS } from './act3Ids';

const layouts = [...ALL_LAYOUTS, ACT4_WORLD_LAYOUT, WASTE_LAYOUT, CALDERA_LAYOUT];
const anchorIds = [...layouts.flatMap((l) => l.anchors.map((a) => a.id)), ...TUTORIAL_ANCHORS.map((a) => a.id), ...ALL_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id))];
const triggerIds = [
  ...layouts.flatMap((l) => l.triggers.map((t) => t.id)),
  ...ACT2_TRIGGERS.map((t) => t.id),
  ...OLDSMOKE_TRIGGERS.map((t) => t.id),
  ...ALL_INTERIORS.flatMap((d) => d.triggers.map((t) => t.id)),
];

/** Act 5 sub-prefixes a thread owns and ships. N0: the Anvil shrine's placeholder anchor and the fog faces' anchors. */
const OWNED_SUB_PREFIXES: readonly string[] = [
  'caldera.anvil.shrine',
  'caldera.fog.',
  // N2: the Act 5 interiors
  'caldera.int.',
  // N1: the Caldera's exteriors (caldera/caldera.layout.ts)
  'caldera.rim-gate',
  'caldera.camp.',
  'caldera.stokers.',
  'caldera.door.',
  'caldera.tunnel.mouth',
  'caldera.lava-stair.',
  'caldera.terraces.',
  'caldera.inner-gate.',
  'caldera.anvil.causeway',
  'caldera.siege.',
  // N11: the Foundry quests' own anchors (src/quests/content/act5/foundry/anchors.ts)
  'caldera.q.f.',
];
const OWNED_TRIGGER_SUB_PREFIXES: readonly string[] = [
  // N2: the Act 5 interiors
  'trg.caldera.int.',
  // N1: the Caldera's exteriors
  'trg.caldera.rim-gate',
  'trg.caldera.camp',
  'trg.caldera.lava-stair.',
  'trg.caldera.inner-gate',
  'trg.caldera.terraces',
  'trg.caldera.cooling-hall',
  'trg.caldera.tunnel',
  // N11: the Foundry quests' triggers
  'trg.caldera.q.f.',
];

describe('Act 5 ids and reserved prefixes (v0.9 item 14)', () => {
  it('lists the 17 quests, split into Phase I and Phase J, none shared with Acts 3 and 4', () => {
    expect(ACT5_QUEST_IDS).toHaveLength(17);
    expect(new Set([...ACT5_PHASE_I, ...ACT5_PHASE_J])).toEqual(new Set(ACT5_QUEST_IDS));
    expect(ACT5_PHASE_I.filter((q) => ACT5_PHASE_J.includes(q))).toEqual([]);
    for (const id of ACT5_QUEST_IDS) expect(ACT3_QUEST_IDS.includes(id) || ACT4_QUEST_IDS.includes(id), id).toBe(false);
  });

  it('isAct5Id matches whole ids only', () => {
    expect(isAct5Id('story.m52.complete')).toBe(true);
    expect(isAct5Id('note-d09-ledger')).toBe(true);
    expect(isAct5Id('use:r30-verse')).toBe(true);
    expect(isAct5Id('m470')).toBe(false);
    expect(isAct5Id('story.m46.complete')).toBe(false);
    expect(isAct5Id('dm47')).toBe(false);
  });

  it('owners cover the plan rows; every quest owns its own namespace', () => {
    const p = ACT5_FLAG_OWNERS.map((o) => o.pattern);
    for (const k of ['story.m47.rimGateOpen', 'story.phase.foundryOpen', 'story.gate.end', 'world.afterEnding', 'favour.snapshot.<id>.<track>']) expect(p).toContain(k);
    expect(new Set(p).size).toBe(p.length);
    expect(ACT5_QUEST_FLAG_OWNERS.map((o) => o.pattern)).toContain('story.m56.*');
    expect(ACT5_QUEST_FLAG_OWNERS).toHaveLength(17);
  });

  it('finds the shipped ids it checks against', () => {
    expect(anchorIds.length).toBeGreaterThan(500);
    expect(triggerIds.length).toBeGreaterThan(50);
  });

  it.each(ACT5_ANCHOR_PREFIXES)('no shipped anchor starts with %s outside an owned sub-prefix', (prefix) => {
    expect(anchorIds.filter((id) => id.startsWith(prefix) && !OWNED_SUB_PREFIXES.some((s) => id.startsWith(s)))).toEqual([]);
  });

  it.each(ACT5_TRIGGER_PREFIXES)('no shipped trigger starts with %s outside an owned sub-prefix', (prefix) => {
    expect(triggerIds.filter((id) => id.startsWith(prefix) && !OWNED_TRIGGER_SUB_PREFIXES.some((s) => id.startsWith(s)))).toEqual([]);
  });

  it('the prefixes are the plan\'s', () => {
    expect([...ACT5_ANCHOR_PREFIXES]).toEqual(['caldera.']);
    expect([...ACT5_TRIGGER_PREFIXES]).toEqual(['trg.caldera.']);
  });

  it('no shipped quest uses an Act 5 id or an Act 5 quest flag', () => {
    // Act 5's own blocks (N10, N11) are the writers; every other quest must not touch an Act 5 id or flag
    const before = questDefs.filter((q) => !ACT5_QUEST_DEFS.includes(q));
    const shipped = new Set(before.map((q) => q.id));
    for (const id of ACT5_QUEST_IDS) expect(shipped.has(id), id).toBe(false);
    const json = JSON.stringify(before);
    for (const id of ACT5_QUEST_IDS) expect(json.includes(`story.${id}.`), id).toBe(false);
  });
});
