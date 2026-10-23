import { describe, expect, it } from 'vitest';
import {
  ACT2_CAMP_DIALOGUE, ACT2_ENDING_ID, ACT2_ENDING_QUESTS, ACT2_GATE_FLAG, createAct2Ending, endingQuestState, questCompleteFlag,
  type Act2EndingPorts,
} from './act2Ending';
import { actEnding } from './actEndings';
import { dialogueDefs } from '../dialogue/content';
import { SCENE_ACT2_CAMP, ACT2_CAMP_SEEN_FLAG, ACT2_WENNA_CAMP_FLAG } from '../dialogue/content/act2/campScene.dialogue';
import { ACT2_DIALOGUE_STRINGS } from '../dialogue/content/act2';

const CARD_SEEN = 'codex.actEnding.a2.seen';

/** The ports read quest completion the way the plugin does: the quest state, or the `story.<id>.complete` flag. */
function rig(init: { quests?: Record<string, string>; flags?: Record<string, unknown> } = {}) {
  const quests: Record<string, string> = { ...init.quests };
  const flags = new Map<string, unknown>(Object.entries(init.flags ?? {}));
  const ended: unknown[] = [];
  const starts: number[] = [];
  const s = { busy: false, combat: false, refuse: false };
  const ports: Act2EndingPorts = {
    questState: (id) => endingQuestState(id, { state: (q) => quests[q] ?? 'inactive' }, (k) => flags.get(k)),
    getFlag: (k) => flags.get(k),
    setFlag: (k, v) => void flags.set(k, v),
    emitActEnded: (e) => void ended.push(e),
    busy: () => s.busy,
    inCombat: () => s.combat,
    startCamp: () => {
      if (s.refuse) return false;
      starts.push(1);
      return true;
    },
  };
  return { d: createAct2Ending(ports), quests, flags, ended, starts, s };
}

const done = { m22: 'completed', d04: 'completed' };

describe('Act 2 ending: the table row and the completion witnesses', () => {
  it('builds on the table row: m22 and d04, gate a3, the houses stand', () => {
    expect(ACT2_ENDING_QUESTS).toEqual(['m22', 'd04']);
    expect(ACT2_GATE_FLAG).toBe(actEnding(2)!.gateFlag);
    expect(ACT2_ENDING_ID).toBe('the-houses-stand');
    expect(ACT2_CAMP_DIALOGUE).toBe(actEnding(2)!.campDialogueId);
  });

  it('a quest counts as completed by its state or by its story.<id>.complete flag', () => {
    const f = (k: string) => (k === 'story.d04.complete' ? true : undefined);
    expect(endingQuestState('m22', { state: () => 'completed' }, f)).toBe('completed');
    expect(endingQuestState('d04', { state: () => 'active' }, f)).toBe('completed');
    expect(endingQuestState('m22', { state: () => 'active' }, f)).toBe('active');
    expect(endingQuestState('m22', undefined, f)).toBe('inactive');
    expect(questCompleteFlag('m22')).toBe('story.m22.complete');
  });
});

describe('Act 2 ending: the live ending', () => {
  it('fires once when the second of M22 and D04 completes: gate a3 set, act.ended emitted', () => {
    const r = rig({ quests: { d04: 'completed', m22: 'completed' } });
    r.d.onQuestCompleted('m22');
    expect(r.flags.get(ACT2_GATE_FLAG)).toBe(true);
    expect(r.ended).toEqual([{ act: 2, endingId: 'the-houses-stand' }]);
    r.d.onQuestCompleted('m22');
    r.d.onQuestCompleted('d04');
    expect(r.ended).toHaveLength(1);
  });

  it('works from the completion flags alone (story.m22.complete and story.d04.complete)', () => {
    const r = rig({ flags: { 'story.m22.complete': true, 'story.d04.complete': true } });
    r.d.onQuestCompleted('m22');
    expect(r.flags.get(ACT2_GATE_FLAG)).toBe(true);
    expect(r.ended).toHaveLength(1);
  });

  it('does not fire on one quest alone, nor on other quests, nor with the gate already set', () => {
    const r = rig({ quests: { d04: 'completed', m22: 'active' } });
    r.d.onQuestCompleted('d04');
    r.d.onQuestCompleted('m21');
    expect(r.ended).toEqual([]);
    expect(r.flags.has(ACT2_GATE_FLAG)).toBe(false);
    const g = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true } });
    g.d.onQuestCompleted('m22');
    expect(g.ended).toEqual([]);
  });

  it('never fires from the Act 1 completions or the Act 1 gate', () => {
    const r = rig({ quests: { m10: 'completed', d02: 'completed' }, flags: { 'story.gate.a2': true } });
    r.d.onQuestCompleted('d02');
    r.d.onLoaded();
    expect(r.ended).toEqual([]);
    expect(r.flags.has(ACT2_GATE_FLAG)).toBe(false);
  });
});

describe('Act 2 ending: the camp after the card', () => {
  it('arms on the card closing with the Act 2 ending id only, and starts from the tick (never in the handler)', () => {
    const r = rig({ quests: done });
    r.d.onQuestCompleted('d04');
    r.d.onCardClosed('smoke-over-harrowmark');
    r.d.tick();
    expect(r.starts).toEqual([]);
    r.d.onCardClosed(ACT2_ENDING_ID);
    expect(r.starts).toEqual([]);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });

  it('waits while busy or in combat, and retries a refused start', () => {
    const r = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT2_ENDING_ID);
    r.s.busy = true;
    r.d.tick();
    r.s.busy = false;
    r.s.combat = true;
    r.d.tick();
    r.s.combat = false;
    r.s.refuse = true;
    r.d.tick();
    expect(r.starts).toEqual([]);
    r.s.refuse = false;
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });

  it('re-arms a camp cut short, and stops for good once story.a2.campSeen is set', () => {
    const r = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT2_ENDING_ID);
    r.d.tick();
    r.d.onDialogueEnded(ACT2_CAMP_DIALOGUE);
    r.d.tick();
    expect(r.starts).toHaveLength(2);
    r.flags.set(ACT2_CAMP_SEEN_FLAG, true);
    r.d.onDialogueEnded(ACT2_CAMP_DIALOGUE);
    r.d.tick();
    expect(r.starts).toHaveLength(2);
  });
});

describe('Act 2 ending: the load table (never emits, never starts inside the handler)', () => {
  it('both quests done with the gate unset: sets the gate, emits nothing', () => {
    const r = rig({ quests: done });
    r.d.onLoaded();
    expect(r.flags.get(ACT2_GATE_FLAG)).toBe(true);
    expect(r.ended).toEqual([]);
    r.d.tick();
    expect(r.starts).toEqual([]);
  });

  it('a save before the end: nothing', () => {
    const r = rig({ quests: { d04: 'completed', m22: 'active' } });
    r.d.onLoaded();
    expect(r.flags.has(ACT2_GATE_FLAG)).toBe(false);
    expect(r.ended).toEqual([]);
  });

  it('gate set, card seen, camp not seen: arms the camp, which starts on the tick', () => {
    const r = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true, [CARD_SEEN]: true } });
    r.d.onLoaded();
    expect(r.starts).toEqual([]);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
    expect(r.ended).toEqual([]);
  });

  it('gate set, card not seen: waits for the card; camp seen: nothing at all', () => {
    const r = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true } });
    r.d.onLoaded();
    r.d.tick();
    expect(r.starts).toEqual([]);
    const s = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true, [CARD_SEEN]: true, [ACT2_CAMP_SEEN_FLAG]: true } });
    s.d.onLoaded();
    s.d.onCardClosed(ACT2_ENDING_ID);
    s.d.tick();
    expect(s.starts).toEqual([]);
    expect(s.ended).toEqual([]);
  });

  it('the Act 1 camp being seen does not count as the Act 2 camp', () => {
    const r = rig({ quests: done, flags: { [ACT2_GATE_FLAG]: true, [CARD_SEEN]: true, 'story.d02.campSeen': true } });
    r.d.onLoaded();
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });
});

describe('scene-act2-camp', () => {
  const def = dialogueDefs.find((d) => d.id === ACT2_CAMP_DIALOGUE)!;

  it('is registered with the dialogues and starts without conditions', () => {
    expect(def).toBeDefined();
    expect(SCENE_ACT2_CAMP.def).toBe(def);
  });

  it('every line has its string, and the scene ends on campSeen and Wenna at the camp, once', () => {
    for (const n of def.nodes) expect(ACT2_DIALOGUE_STRINGS[n.textKey], n.textKey).toBeTruthy();
    const withEffects = def.nodes.filter((n) => n.effects?.length);
    expect(withEffects).toHaveLength(1);
    const last = withEffects[0];
    expect(last.next).toBeNull();
    expect(last.effects).toContainEqual({ setFlag: ACT2_CAMP_SEEN_FLAG, value: true });
    expect(last.effects).toContainEqual({ setFlag: ACT2_WENNA_CAMP_FLAG, value: true });
    expect(def.nodes.some((n) => n.speaker === 'wenna')).toBe(true);
  });
});
