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
      it('opens with a line, and every string key resolves', () => {
        expect((b.lines ?? []).length).toBeGreaterThan(0);
        for (const l of b.lines ?? []) expect(TUTORIAL_STRINGS_EN[l], l).toMatch(/^(Sir Gaut|Sister Aelfreda|Aelfreda|Edda|Hob): /);
      });
      it('objective targets are one per step and resolve to real anchors', () => {
        if (!b.targets) return;
        expect(b.targets).toHaveLength(b.steps.length);
        for (const t of b.targets) if (t !== null) expect(anchorIds.has(t), t).toBe(true);
      });
      it('prompts use one {key} at most and their step exists', () => {
        for (const p of b.prompts ?? []) {
          expect((TUTORIAL_STRINGS_EN[p.textKey].match(/\{key\}/g) ?? []).length, p.textKey).toBeLessThanOrEqual(1);
          if (p.step !== undefined) expect(p.step).toBeLessThan(b.steps.length);
        }
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

  it('T01 is walk to the gate, then topple the scarecrow, with each prompt on its step', () => {
    expect(BEATS.t01.steps).toEqual([[{ kind: 'trigger', id: 'trg.t01.gate' }], [{ kind: 'flag', key: 'place.scarecrow.toppled' }]]);
    expect(BEATS.t01.targets).toEqual(['brightwater.gate', 'brightwater.scarecrow']);
    expect(BEATS.t01.prompts?.map((p) => [p.mechanic, p.step])).toEqual([['move', 0], ['attack1', 1]]);
  });

  it('teaches the right verbs: dodge text, lock swap, rekindle and rest prompts', () => {
    expect(TUTORIAL_STRINGS_EN['tutorial.prompt.dodge']).toBe('Tap {key} with a direction to dodge');
    expect(BEATS.t11.prompts?.map((p) => p.mechanic)).toContain('lockSwap');
    expect(TUTORIAL_STRINGS_EN['tutorial.prompt.rekindle']).toBe('Hold {key} at the chapel waystone to rekindle it');
    expect(BEATS.t14.prompts?.some((p) => p.textKey === 'tutorial.prompt.rekindle' && p.action === 'interact')).toBe(true);
    expect(TUTORIAL_STRINGS_EN['tutorial.prompt.rest']).toBe('Hold {key} at a waystone to rest');
    expect(BEATS.t06.steps[0]).toEqual([{ kind: 'sprint', meters: 25, count: 2 }]);
    expect(TUTORIAL_STRINGS_EN['tutorial.t01.summary']).toMatch(/barley loft/);
  });

  it('quest ids resolve to tutorial quests (except thread 3 t03 and t12)', () => {
    const ids = new Set(TUTORIAL_QUESTS.map((q) => q.id));
    for (const b of beats) if (b.id !== 't03' && b.id !== 't12') expect(ids.has(b.questId), b.id).toBe(true);
  });
});

describe('beat start facings', () => {
  // The first thing each beat asks for; the player must arrive looking at it (Mostafa, 2026-10-19:
  // "I should be facing the village and the scarecrow").
  const TARGETS: Partial<Record<(typeof FULL_ORDER)[number], string>> = {
    t01: 'brightwater.scarecrow',
    t02: 'chapel.banner-2',
    t03: 'trg.t03.stane',
    t04: 'trg.t04.chapel',
    t05: 'spawn.t05.wraith-3',
    t06: 'trg.t06.end',
    t07: 'trg.t07.cart',
    t08: 'spawn.t08.wraith-1',
    t09: 'spawn.t09.soldier-1',
    t10: 'spawn.t10.wraith-1',
    t11: 'trg.t11.square',
    t12: 'trg.t12.bakery',
    t14: 'trg.t14.chapel',
    t15: 'trg.t15.gate',
  };
  const point = (id: string): { x: number; z: number } => {
    const p = BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === id) ?? BRIGHTWATER_LAYOUT.triggers.find((t) => t.id === id);
    if (!p) throw new Error(`missing ${id}`);
    return { x: p.x, z: p.z };
  };

  for (const [beat, target] of Object.entries(TARGETS)) {
    it(`${beat} starts facing ${target}`, () => {
      const start = BRIGHTWATER_LAYOUT.anchors.find((a) => a.id === BEATS[beat as keyof typeof BEATS].startAnchor)!;
      const yaw = (start.yawDeg * Math.PI) / 180;
      // Engine yaw 0 looks down -Z (ThirdPersonCamera.toWorld).
      const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const t = point(target);
      const dx = t.x - start.x;
      const dz = t.z - start.z;
      const cos = (forward.x * dx + forward.z * dz) / Math.hypot(dx, dz);
      expect(Math.acos(Math.min(1, cos)) * (180 / Math.PI)).toBeLessThan(25);
    });
  }
});
