// Act 4 L7 (Q2): every trade or respec inside Harrowmark's walls before M38 is at the Ashgate refuge after M41, or on
// the deliberately-shut list (coordinator ruling 2026-11-06), and nothing is skipped silently.
import { describe, expect, it } from 'vitest';
import { flagConditionHolds } from '../core/flagCondition';
import { DEFAULT_KITS, TRAINER_POSTS, trainerPlacement } from '../classes/kits';
import { HARROWMARK_LAYOUT, HARROWMARK_NPCS } from '../harrowmark/harrowmark.layout';
import {
  ACT4_TRAINER_POSTS,
  ACT4_VENDOR_OPEN_WHEN,
  ACT4_VENDOR_POSTS,
  DELIBERATELY_SHUT_UNTIL_ACT5,
  REFUGE_VENDORS,
  refugeShop,
  refugeTrainer,
} from './refugePosts.act4';
import { VENDORS } from './stock';

const flags = (f: Record<string, boolean>) => ({ getFlag: (k: string) => f[k] });
const BEFORE_M38 = flags({ 'story.gate.a4': true });
const M38_TO_M41 = flags({ 'story.gate.a4': true, 'story.m38.complete': true, 'story.m39.complete': true });
const AFTER_M41 = flags({ 'story.gate.a4': true, 'story.m38.complete': true, 'story.m39.complete': true, 'story.m41.complete': true });

/** Harrowmark NPCs with no trade, training or respec to move (each named, so a new NPC with a service fails the test). */
const NO_SERVICE: Readonly<Record<string, string>> = {
  edric: 'the king (audiences are quest scenes)',
  vey: 'the Lord-Regent (no service)',
  rook: 'moved as the Knight trainer at the refuge (his talk post is L1\'s)',
};

const shopVendors = HARROWMARK_LAYOUT.anchors.filter((a) => a.id.startsWith('shop.')).map((a) => a.id.slice('shop.'.length));

describe('the refuge covers every service inside the walls', () => {
  it('every Harrowmark shop has a refuge shop row from M41', () => {
    expect(shopVendors.length).toBeGreaterThan(0);
    for (const v of shopVendors) {
      const row = ACT4_VENDOR_POSTS.find((r) => r.vendorId === v);
      expect(row, v).toBeDefined();
      expect(row!.anchorId).toBe(refugeShop(v));
      expect(flagConditionHolds(row!.when, AFTER_M41), v).toBe(true);
      expect(flagConditionHolds(row!.when, M38_TO_M41), v).toBe(false);
      expect(flagConditionHolds(row!.when, BEFORE_M38), v).toBe(false);
    }
    // Wenna joins them: she is the Grisel vendor from M38 and trades only at the refuge.
    expect([...REFUGE_VENDORS].sort()).toEqual([...shopVendors, 'wenna'].sort());
  });
  it('every class desk (training and respec) is at the refuge after M41', () => {
    for (const kit of Object.values(DEFAULT_KITS)) {
      const p = trainerPlacement(kit, AFTER_M41);
      expect(p.moved, kit.classId).toBe(true);
      expect(p.deskAnchor).toBe(refugeTrainer(p.npcId));
      expect(trainerPlacement(kit, BEFORE_M38).moved, kit.classId).toBe(false);
    }
    expect(trainerPlacement(DEFAULT_KITS.knight, AFTER_M41).npcId).toBe('rook');
    expect(TRAINER_POSTS).toEqual(ACT4_TRAINER_POSTS);
  });
  it('every Harrowmark NPC is moved, shut on purpose or has no service, and the shut list holds no stale entry', () => {
    const moved = new Set<string>([...REFUGE_VENDORS, ...ACT4_TRAINER_POSTS.map((r) => r.npcId)]);
    const shut = Object.keys(DELIBERATELY_SHUT_UNTIL_ACT5);
    const unaccounted = HARROWMARK_NPCS.map((n) => n.id).filter((id) => !moved.has(id) && !shut.includes(id) && !(id in NO_SERVICE));
    expect(unaccounted).toEqual([]);
    // Each shut entry is a real Harrowmark NPC that is not also moved, and has a reason.
    for (const id of shut) {
      expect(HARROWMARK_NPCS.some((n) => n.id === id), id).toBe(true);
      expect(moved.has(id), id).toBe(false);
      expect(DELIBERATELY_SHUT_UNTIL_ACT5[id].length).toBeGreaterThan(10);
    }
    expect(shut.sort()).toEqual(['aldith', 'wace', 'whitlock']);
  });
});

describe('Act 4 vendor open rules', () => {
  const open = (v: string, f: ReturnType<typeof flags>) => flagConditionHolds(ACT4_VENDOR_OPEN_WHEN[v], f);
  it('Wenna opens at M38, Aldous closes at M38', () => {
    expect(open('wenna', BEFORE_M38)).toBe(false);
    expect(open('wenna', M38_TO_M41)).toBe(true);
    expect(open('aldous', BEFORE_M38)).toBe(true);
    expect(open('aldous', M38_TO_M41)).toBe(false);
    expect(open('aldous', AFTER_M41)).toBe(false);
  });
  it('Hild opens with the Ash Road (M41), Wulfhild after M43', () => {
    expect(open('hild', M38_TO_M41)).toBe(false);
    expect(open('hild', AFTER_M41)).toBe(true);
    expect(open('wulfhild', AFTER_M41)).toBe(false);
    expect(open('wulfhild', flags({ 'story.m43.complete': true }))).toBe(true);
  });
  it('names only real or Act 4 vendor ids', () => {
    for (const v of [...Object.keys(ACT4_VENDOR_OPEN_WHEN), ...ACT4_VENDOR_POSTS.map((r) => r.vendorId)]) {
      expect(v in VENDORS || v === 'wulfhild' || v === 'hild', v).toBe(true);
    }
  });
});
