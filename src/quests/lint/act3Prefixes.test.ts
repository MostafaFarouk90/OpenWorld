import { describe, expect, it } from 'vitest';
import { ALL_INTERIORS } from '../../interiors/interiors.plugin';
import { ACT3_INTERIORS } from '../../interiors/act3';
import { TUTORIAL_ANCHORS } from '../../tutorial/beats';
import { ACT2_TRIGGERS, ACT2_QUEST_DEFS } from '../content/act2';
import { OLDSMOKE_TRIGGERS } from '../content/act2/oldsmoke';
import { questDefs } from '../content';
import { ACT3_ANCHOR_PREFIXES, ACT3_FLAG_OWNERS, ACT3_QUEST_FLAG_OWNERS, ACT3_TRIGGER_PREFIXES } from './act3Flags';
import { ACT3_QUEST_IDS } from './act3Ids';
import { DRAGONSPINE_LAYOUT } from '../../dragonspine/dragonspine.layout';
import { ALL_LAYOUTS as ALL_LAYOUTS_WITH_ACT3 } from './noteLint';

// The Act 3 interiors are the prefixes' owners (K3, K4): only the ids shipped before them are checked.
const shippedInteriors = ALL_INTERIORS.filter((d) => !ACT3_INTERIORS.includes(d));
// The Dragonspine layout is held to the prefixes it owns instead (the last test of this file); the others must stay clear of them.
const ALL_LAYOUTS = ALL_LAYOUTS_WITH_ACT3.filter((l) => l !== DRAGONSPINE_LAYOUT);
const DRAGONSPINE_OWNED = ['dragonspine.', 'trg.dragonspine.', 'npc-post.', 'waystone.'];

const anchorIds = [
  ...ALL_LAYOUTS.flatMap((l) => l.anchors.map((a) => a.id)),
  ...TUTORIAL_ANCHORS.map((a) => a.id),
  ...shippedInteriors.flatMap((d) => d.anchors.map((a) => a.id)),
];
const triggerIds = [
  ...ALL_LAYOUTS.flatMap((l) => l.triggers.map((t) => t.id)),
  ...ACT2_TRIGGERS.map((t) => t.id),
  ...OLDSMOKE_TRIGGERS.map((t) => t.id),
  ...shippedInteriors.flatMap((d) => d.triggers.map((t) => t.id)),
];

describe('Act 3 reserved prefixes', () => {
  it('finds the shipped ids it checks against', () => {
    expect(anchorIds.length).toBeGreaterThan(500);
    expect(triggerIds.length).toBeGreaterThan(50);
    expect(anchorIds.some((id) => id.startsWith('harrowmark.'))).toBe(true);
    expect(triggerIds.some((id) => id.startsWith('trg.'))).toBe(true);
  });

  /** Act 3 sub-prefixes an Act 3 thread owns and ships (coordinator rulings): K6b's ambient spawn anchors, K2's POIs. */
  const OWNED_SUB_PREFIXES = ['greyfen.fauna.', 'greyfen.poi.', 'dragonspine.poi.', 'fenroad.poi.', 'spineroad.poi.'];
  /** K2's POI discovery triggers (the null-land caches use `trg.poi.a3.`, outside the reserved prefixes). */
  const OWNED_TRIGGER_SUB_PREFIXES = ['trg.greyfen.poi.', 'trg.dragonspine.poi.'];
  it.each(ACT3_ANCHOR_PREFIXES)('no shipped anchor starts with %s outside an owned sub-prefix', (prefix) => {
    expect(anchorIds.filter((id) => id.startsWith(prefix) && !OWNED_SUB_PREFIXES.some((s) => id.startsWith(s)))).toEqual([]);
  });

  it('the owned sub-prefixes are in use and sit under a reserved prefix', () => {
    for (const s of OWNED_SUB_PREFIXES) {
      expect(ACT3_ANCHOR_PREFIXES.some((p) => s.startsWith(p)), s).toBe(true);
      expect(anchorIds.some((id) => id.startsWith(s)), s).toBe(true);
    }
  });

  it.each(ACT3_TRIGGER_PREFIXES)('no shipped trigger starts with %s outside an owned sub-prefix', (prefix) => {
    expect(triggerIds.filter((id) => id.startsWith(prefix) && !OWNED_TRIGGER_SUB_PREFIXES.some((s) => id.startsWith(s)))).toEqual([]);
  });

  it('the owned trigger sub-prefixes are in use and sit under a reserved prefix', () => {
    for (const s of OWNED_TRIGGER_SUB_PREFIXES) {
      expect(ACT3_TRIGGER_PREFIXES.some((p) => s.startsWith(p)), s).toBe(true);
      expect(triggerIds.some((id) => id.startsWith(s)), s).toBe(true);
    }
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

describe('the Dragonspine layout\'s own ids', () => {
  it('stay in the prefixes K4 owns', () => {
    const ids = [...DRAGONSPINE_LAYOUT.anchors, ...DRAGONSPINE_LAYOUT.triggers].map((x) => x.id);
    expect(ids.length).toBeGreaterThan(100);
    expect(ids.filter((id) => !DRAGONSPINE_OWNED.some((p) => id.startsWith(p)))).toEqual([]);
    expect(DRAGONSPINE_LAYOUT.triggers.filter((t) => !t.id.startsWith('trg.dragonspine.')).map((t) => t.id)).toEqual([]);
  });
});

describe('Act 3 flag owners', () => {
  const byPattern = new Map(ACT3_FLAG_OWNERS.map((o) => [o.pattern, o.owner]));

  it('names every non-quest flag owner', () => {
    expect(Object.fromEntries(byPattern)).toEqual({
      'warmth.block.<id>.level': 'K9',
      'story.m26.netsCut': 'K12',
      'story.a3.campSeen': 'K16',
      'story.gate.a4': 'K16',
      'trainer.<classId>.masterBook': 'K11',
      'boss.<id>.outcome': 'core boss registry',
      'story.phase.dragonspineOpen': 'Phase F PR',
      'gear.shardgem.granted.<id>': 'K10',
      'place.poi.a3.<id>.discovered': 'K2',
      'poi.a3.<id>.taken': 'K2',
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

  it('no non-quest row collides with a quest flag row (except a named cross-read, owned by the quest thread)', () => {
    // story.m26.netsCut is K12's (M26's thread) and read by K9's Mere stone; its row exists so the owner is on record (K9 review B2).
    const namedQuestFlags = new Set(['story.m26.netsCut']);
    for (const o of ACT3_FLAG_OWNERS) {
      if (namedQuestFlags.has(o.pattern)) {
        expect(o.owner, o.pattern).toBe('K12');
        continue;
      }
      const m = /^story\.([a-z0-9]+)\./.exec(o.pattern);
      if (m) expect(ACT3_QUEST_IDS, o.pattern).not.toContain(m[1]);
    }
  });
});
