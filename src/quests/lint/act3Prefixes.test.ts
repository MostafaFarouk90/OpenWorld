import { describe, expect, it } from 'vitest';
import { ALL_INTERIORS } from '../../interiors/interiors.plugin';
import { TUTORIAL_ANCHORS } from '../../tutorial/beats';
import { ACT2_TRIGGERS, ACT2_QUEST_DEFS } from '../content/act2';
import { OLDSMOKE_TRIGGERS } from '../content/act2/oldsmoke';
import { questDefs } from '../content';
import { ACT3_ANCHOR_PREFIXES, ACT3_FLAG_OWNERS, ACT3_QUEST_FLAG_OWNERS, ACT3_TRIGGER_PREFIXES } from './act3Flags';
import { ACT3_QUEST_IDS } from './act3Ids';
import { ALL_LAYOUTS } from './noteLint';

const anchorIds = [
  ...ALL_LAYOUTS.flatMap((l) => l.anchors.map((a) => a.id)),
  ...TUTORIAL_ANCHORS.map((a) => a.id),
  ...ALL_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id)),
];
const triggerIds = [
  ...ALL_LAYOUTS.flatMap((l) => l.triggers.map((t) => t.id)),
  ...ACT2_TRIGGERS.map((t) => t.id),
  ...OLDSMOKE_TRIGGERS.map((t) => t.id),
  ...ALL_INTERIORS.flatMap((d) => d.triggers.map((t) => t.id)),
];

describe('Act 3 reserved prefixes', () => {
  it('finds the shipped ids it checks against', () => {
    expect(anchorIds.length).toBeGreaterThan(500);
    expect(triggerIds.length).toBeGreaterThan(50);
    expect(anchorIds.some((id) => id.startsWith('harrowmark.'))).toBe(true);
    expect(triggerIds.some((id) => id.startsWith('trg.'))).toBe(true);
  });

  it.each(ACT3_ANCHOR_PREFIXES)('no shipped anchor starts with %s', (prefix) => {
    expect(anchorIds.filter((id) => id.startsWith(prefix))).toEqual([]);
  });

  it.each(ACT3_TRIGGER_PREFIXES)('no shipped trigger starts with %s', (prefix) => {
    expect(triggerIds.filter((id) => id.startsWith(prefix))).toEqual([]);
  });

  it('the prefixes are the ones of the plan', () => {
    expect([...ACT3_ANCHOR_PREFIXES]).toEqual(['greyfen.', 'fenroad.', 'dragonspine.', 'spineroad.']);
    expect([...ACT3_TRIGGER_PREFIXES]).toEqual(['trg.greyfen.', 'trg.dragonspine.']);
  });

  it('no shipped quest uses an Act 3 id or an Act 3 quest flag', () => {
    const shipped = new Set(questDefs.map((q) => q.id));
    for (const id of ACT3_QUEST_IDS) expect(shipped.has(id), id).toBe(false);
    expect(ACT2_QUEST_DEFS.length).toBeGreaterThan(0);
    const json = JSON.stringify(questDefs);
    for (const id of ACT3_QUEST_IDS) expect(json.includes(`story.${id}.`), id).toBe(false);
  });
});

describe('Act 3 flag owners', () => {
  const byPattern = new Map(ACT3_FLAG_OWNERS.map((o) => [o.pattern, o.owner]));

  it('names every non-quest flag owner', () => {
    expect(Object.fromEntries(byPattern)).toEqual({
      'warmth.block.<id>.level': 'K9',
      'story.a3.campSeen': 'K16',
      'story.gate.a4': 'K16',
      'trainer.<classId>.masterBook': 'K11',
      'boss.<id>.outcome': 'core boss registry',
      'story.phase.dragonspineOpen': 'Phase F PR',
      'gear.shardgem.granted.<id>': 'K10',
    });
  });

  it('has one row per pattern, each with an owner and a note', () => {
    expect(byPattern.size).toBe(ACT3_FLAG_OWNERS.length);
    for (const o of [...ACT3_FLAG_OWNERS, ...ACT3_QUEST_FLAG_OWNERS]) {
      expect(o.owner.length, o.pattern).toBeGreaterThan(1);
      expect(o.note.length, o.pattern).toBeGreaterThan(1);
    }
  });

  it('gives every Act 3 quest id (m23 to m34, d05, d06, r12 to r18) a story.<id>.* row, and nothing else', () => {
    expect(ACT3_QUEST_IDS).toHaveLength(12 + 2 + 7);
    expect(ACT3_QUEST_FLAG_OWNERS.map((o) => o.pattern)).toEqual(ACT3_QUEST_IDS.map((id) => `story.${id}.*`));
    expect(ACT3_QUEST_IDS).toContain('m34');
    expect(ACT3_QUEST_IDS).toContain('r18');
    expect(ACT3_QUEST_IDS).not.toContain('m22');
    expect(ACT3_QUEST_IDS).not.toContain('r11');
  });

  it('no non-quest row collides with a quest flag row', () => {
    for (const o of ACT3_FLAG_OWNERS) {
      const m = /^story\.([a-z0-9]+)\./.exec(o.pattern);
      if (m) expect(ACT3_QUEST_IDS, o.pattern).not.toContain(m[1]);
    }
  });
});
