import { describe, it, expect } from 'vitest';
import { BEATS, FULL_ORDER, VETERAN_ORDER, KETTLEWICK_ORDER, LOCKABLE_VERBS, TUTORIAL_ANCHORS } from './beats';
import { TUTORIAL_STRINGS_EN } from './strings.en';
import { TUTORIAL_QUESTS } from './quests';
import { BEAT_IDS } from './types';
import { MECHANICS } from '../prompts/PromptManager';
import { ACTIONS } from '../input/actions';
import { BRIGHTWATER_LAYOUT } from '../region/brightwater.layout';
import { SLICE_SPAWNERS } from '../enemies/spawnerDefs';

const anchorIds = new Set<string>([...BRIGHTWATER_LAYOUT.anchors.map((a) => a.id), ...TUTORIAL_ANCHORS.map((a) => a.id)]);
const triggerIds = new Set<string>(BRIGHTWATER_LAYOUT.triggers.map((t) => t.id));
const spawnerIds = new Set<string>(SLICE_SPAWNERS.map((s) => s.id));
const beats = Object.values(BEATS);

describe('tutorial beats', () => {
  it('covers every beat id and the key matches the id', () => {
    expect(Object.keys(BEATS).sort()).toEqual([...BEAT_IDS].sort());
    for (const [k, b] of Object.entries(BEATS)) expect(b.id).toBe(k);
  });

  it('orders contain each beat once', () => {
    expect(FULL_ORDER).toHaveLength(15);
    expect(new Set(FULL_ORDER).size).toBe(15);
    expect(FULL_ORDER).not.toContain('skirmish');
    expect(new Set(VETERAN_ORDER).size).toBe(VETERAN_ORDER.length);
    expect(VETERAN_ORDER).toContain('skirmish');
    expect(KETTLEWICK_ORDER).toEqual(['t15']);
  });

  it('tutorial anchors are the five NPC anchors', () => {
    expect(TUTORIAL_ANCHORS.map((a) => a.id)).toEqual([
      'tutorial.gaut.chapel', 'tutorial.gaut.lane', 'tutorial.gaut.square', 'tutorial.gaut.gate', 'tutorial.aelfreda.gate',
    ]);
  });

  for (const b of beats) {
    describe(b.id, () => {
      it('prompts use valid mechanics and actions', () => {
        for (const p of b.prompts ?? []) {
          expect(MECHANICS).toContain(p.mechanic);
          expect(ACTIONS as readonly string[]).toContain(p.action);
        }
      });
      it('anchors and triggers exist', () => {
        expect(anchorIds.has(b.startAnchor)).toBe(true);
        for (const a of Object.values(b.npcs ?? {})) expect(anchorIds.has(a), a).toBe(true);
        for (const goal of b.steps.flat()) {
          if (goal.kind === 'trigger') expect(triggerIds.has(goal.id), goal.id).toBe(true);
          if (goal.kind === 'gaze') for (const a of goal.anchors) expect(anchorIds.has(a), a).toBe(true);
        }
      });
      it('spawners exist', () => {
        for (const s of (b.waves ?? []).flat()) expect(spawnerIds.has(s.spawnerId), s.spawnerId).toBe(true);
        for (const g of b.steps.flat()) if (g.kind === 'cleared') for (const id of g.spawnerIds) expect(spawnerIds.has(id), id).toBe(true);
      });
      it('string keys exist', () => {
        const keys = [...(b.prompts ?? []).map((p) => p.textKey), ...(b.lines ?? [])];
        for (const k of keys) expect(TUTORIAL_STRINGS_EN[k], k).toBeTruthy();
      });
      it('unlocks and locks are lockable verbs', () => {
        for (const v of [...(b.unlocks ?? []), ...(b.extraLocks ?? [])]) expect(LOCKABLE_VERBS).toContain(v);
      });
      it('combat beats end with a cleared step covering every wave', () => {
        if (!b.waves) return;
        const last = b.steps[b.steps.length - 1].find((g) => g.kind === 'cleared');
        if (b.id === 't15') {
          expect(b.steps.flat().some((g) => g.kind === 'cleared')).toBe(true);
          return;
        }
        expect(last?.kind).toBe('cleared');
        const cleared = new Set(b.steps.flat().flatMap((g) => (g.kind === 'cleared' ? g.spawnerIds : [])));
        for (const s of b.waves.flat()) expect(cleared.has(s.spawnerId)).toBe(true);
      });
    });
  }

  it('quest ids resolve to tutorial quests (except thread 3 t03 and t12)', () => {
    const ids = new Set(TUTORIAL_QUESTS.map((q) => q.id));
    for (const b of beats) if (b.id !== 't03' && b.id !== 't12') expect(ids.has(b.questId), b.id).toBe(true);
  });
});
