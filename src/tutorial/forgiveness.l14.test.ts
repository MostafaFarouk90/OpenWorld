// Act 4 L14 carry-overs: the replay board's block and dodge drills count 2 and forgive like T09 and T10; a forgiven hit
// flashes the prompt; the pity count resets when the lesson moves on.
import { describe, expect, it } from 'vitest';
import { CombatForgiveness, FORGIVENESS, lessonKey, lessonVerb, verbMechanic } from './forgiveness';
import { DRILLS } from './tutorial.plugin';
import { dialogueStrings } from '../dialogue/strings.en';

describe('replay board drills (L14)', () => {
  it('the block and dodge drills need two, as T09 and T10 do', () => {
    for (const id of ['block', 'dodge'] as const) {
      const first = DRILLS[id]!.steps[0]![0]!;
      expect(first.kind).toBe('count');
      expect((first as { count: number }).count).toBe(2);
    }
  });

  it('their count step forgives the same verb; the clear step and other drills do not', () => {
    expect(lessonVerb(null, 0, 'block', 0)).toBe('blocked');
    expect(lessonVerb(null, 0, 'dodge', 0)).toBe('dodged');
    expect(lessonVerb(null, 0, 'block', 1)).toBeNull();
    expect(lessonVerb(null, 0, 'attacks', 0)).toBeNull();
    expect(lessonVerb(null, 0, 'lockon', 0)).toBeNull();
    // a drill wins over a (stale) beat
    expect(lessonVerb('t09', 0, 'attacks', 0)).toBeNull();
  });

  it("Gaut's T09 and T10 lines say twice", () => {
    const s = dialogueStrings;
    const t09 = Object.entries(s).find(([k]) => k.endsWith('npc-gaut.tut-t09'))![1];
    const t10 = Object.entries(s).find(([k]) => k.endsWith('npc-gaut.tut-t10'))![1];
    for (const line of [t09, t10]) {
      expect(line).not.toMatch(/three/);
      expect(line).toMatch(/twice/);
    }
  });
});

describe('forgiven hit flash and pity reset (L14)', () => {
  it('maps each verb to the mechanic a clean block or dodge flashes', () => {
    expect(verbMechanic('blocked')).toBe('block');
    expect(verbMechanic('dodged')).toBe('dodge');
  });

  it('the lesson key changes with the beat, the step and the drill', () => {
    const keys = new Set([
      lessonKey('t09', 0, null, 0), lessonKey('t09', 1, null, 0), lessonKey('t10', 0, null, 0),
      lessonKey(null, 0, 'block', 0), lessonKey(null, 0, 'dodge', 0), lessonKey(null, 0, 'dodge', 1),
    ]);
    expect(keys.size).toBe(6);
    expect(lessonKey('t09', 0, null, 0)).toBe(lessonKey('t09', 0, null, 0));
  });

  it('a reset between beats stops pity carried over from the last lesson', () => {
    const f = new CombatForgiveness();
    for (let i = 0; i < FORGIVENESS.pityHits - 1; i++) expect(f.onHitTaken(i * 5, 'blocked')).toBeNull();
    f.reset();
    // without the reset this hit would have been handed over
    expect(f.onHitTaken(100, 'dodged')).toBeNull();
  });
});
