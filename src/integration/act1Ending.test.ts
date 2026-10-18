import { describe, expect, it } from 'vitest';
import {
  Act1Ending, ACT1_CAMP_SEEN_FLAG, ACT1_CARD_SEEN_FLAG, ACT1_ENDING_ID, ACT1_GATE_FLAG, type Act1EndingPorts,
} from './act1Ending';

function rig(init: { quests?: Record<string, string>; flags?: Record<string, unknown> } = {}) {
  const quests: Record<string, string> = { m10: 'inactive', d02: 'inactive', ...init.quests };
  const flags = new Map<string, unknown>(Object.entries(init.flags ?? {}));
  const ended: unknown[] = [];
  const starts: number[] = [];
  const s = { busy: false, combat: false, refuse: false };
  const ports: Act1EndingPorts = {
    questState: (id) => quests[id] ?? 'inactive',
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
  const d = new Act1Ending(ports);
  return { d, quests, flags, ended, starts, s };
}

const done = { m10: 'completed', d02: 'completed' };

describe('Act1Ending: the live ending', () => {
  it('fires once when D02 completes after M10: gate set, act.ended emitted', () => {
    const r = rig({ quests: done });
    r.d.onQuestCompleted('d02');
    expect(r.flags.get(ACT1_GATE_FLAG)).toBe(true);
    expect(r.ended).toEqual([{ act: 1, endingId: ACT1_ENDING_ID }]);
    r.d.onQuestCompleted('d02');
    r.d.onQuestCompleted('m10');
    expect(r.ended).toHaveLength(1);
  });

  it('does not fire on M10 alone, nor on other quests', () => {
    const r = rig({ quests: { m10: 'completed', d02: 'active' } });
    r.d.onQuestCompleted('m10');
    r.d.onQuestCompleted('d01');
    expect(r.ended).toEqual([]);
    expect(r.flags.has(ACT1_GATE_FLAG)).toBe(false);
  });

  it('ignores the completion of an unrelated quest even with both done', () => {
    const r = rig({ quests: done });
    r.d.onQuestCompleted('r04');
    expect(r.ended).toEqual([]);
  });

  it('does not fire again when the gate is already set', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onQuestCompleted('d02');
    expect(r.ended).toEqual([]);
  });
});

describe('Act1Ending: the camp after the card', () => {
  it('arms on closed with the right id and starts from the tick', () => {
    const r = rig({ quests: done });
    r.d.onQuestCompleted('d02');
    r.d.tick();
    expect(r.starts).toHaveLength(0); // the card is still up
    r.d.onCardClosed(ACT1_ENDING_ID);
    expect(r.starts).toHaveLength(0); // never inside the event
    r.d.tick();
    expect(r.starts).toHaveLength(1);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });

  it('ignores closed with another ending id, or before the gate', () => {
    const r = rig({ quests: done });
    r.d.onCardClosed(ACT1_ENDING_ID); // gate unset
    r.d.onQuestCompleted('d02');
    r.d.onCardClosed('the-houses-stand');
    r.d.tick();
    expect(r.starts).toEqual([]);
  });

  it('waits while a modal or dialogue is open, in combat, or the start is refused', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.s.busy = true;
    r.d.tick();
    r.s.busy = false;
    r.s.combat = true;
    r.d.tick();
    r.s.combat = false;
    r.s.refuse = true;
    r.d.tick();
    expect(r.starts).toEqual([]);
    expect(r.d.pending).toBe(true);
    r.s.refuse = false;
    r.d.tick();
    expect(r.starts).toHaveLength(1);
    expect(r.d.pending).toBe(false);
  });

  it('re-arms a camp cut short, and stops for good once campSeen is set', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.d.tick();
    r.d.onDialogueEnded('scene-act1-camp'); // closed early (death, script)
    expect(r.d.pending).toBe(true);
    r.d.tick();
    expect(r.starts).toHaveLength(2);
    r.flags.set(ACT1_CAMP_SEEN_FLAG, true);
    r.d.onDialogueEnded('scene-act1-camp');
    expect(r.d.pending).toBe(false);
    r.d.tick();
    expect(r.starts).toHaveLength(2);
  });

  it('ignores other dialogues ending', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.d.tick();
    r.d.onDialogueEnded('npc-rook');
    expect(r.d.pending).toBe(false);
  });

  it('drops a pending camp when campSeen appears by other means', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.flags.set(ACT1_CAMP_SEEN_FLAG, true);
    r.d.tick();
    expect(r.starts).toEqual([]);
    expect(r.d.pending).toBe(false);
  });
});

describe('Act1Ending: the load table', () => {
  it('m10 and d02 completed with the gate unset: sets the gate, emits nothing, starts nothing', () => {
    const r = rig({ quests: done });
    r.d.onLoaded();
    expect(r.flags.get(ACT1_GATE_FLAG)).toBe(true);
    expect(r.ended).toEqual([]);
    r.d.tick();
    expect(r.starts).toEqual([]); // the HUD shows the card; its closed arms the camp
  });

  it('a save before the end: nothing', () => {
    const r = rig({ quests: { m10: 'completed', d02: 'active' } });
    r.d.onLoaded();
    expect(r.flags.has(ACT1_GATE_FLAG)).toBe(false);
  });

  it('gate set, card re-shown by the HUD on this load (marked seen before this handler runs): busy holds the camp until the close', () => {
    // The real order: FlagGates' save.loaded runs first, the card shows and sets codex.actEndingSeen, then onLoaded.
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true, [ACT1_CARD_SEEN_FLAG]: true } });
    r.s.busy = true; // the card is up (actEndingCard.active)
    r.d.onLoaded();
    r.d.tick();
    r.d.tick();
    expect(r.starts).toEqual([]);
    r.s.busy = false;
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });

  it('gate set, card not seen (director alone): waits for the card', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onLoaded();
    r.d.tick();
    expect(r.starts).toEqual([]);
    r.flags.set(ACT1_CARD_SEEN_FLAG, true);
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });

  it('gate set, card seen, camp not seen (quit during the card or mid-camp): arms, starts on the tick, not in the handler', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true, [ACT1_CARD_SEEN_FLAG]: true } });
    r.d.onLoaded();
    expect(r.starts).toEqual([]);
    expect(r.d.pending).toBe(true);
    r.d.tick();
    expect(r.starts).toHaveLength(1);
  });

  it('camp seen: nothing, ever', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true, [ACT1_CARD_SEEN_FLAG]: true, [ACT1_CAMP_SEEN_FLAG]: true } });
    r.d.onLoaded();
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.d.tick();
    expect(r.starts).toEqual([]);
    expect(r.ended).toEqual([]);
  });

  it('a load while the camp runs forgets it and re-derives (the dialogue plugin closes it on load)', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true, [ACT1_CARD_SEEN_FLAG]: true } });
    r.d.onLoaded();
    r.d.tick();
    r.d.onLoaded();
    r.d.onDialogueEnded('scene-act1-camp'); // the close the load caused arrives after
    r.d.tick();
    expect(r.starts).toHaveLength(2);
  });

  it('a load of a save from before the end clears a pending camp', () => {
    const r = rig({ quests: done, flags: { [ACT1_GATE_FLAG]: true } });
    r.d.onCardClosed(ACT1_ENDING_ID);
    r.flags.clear();
    r.quests.d02 = 'active';
    r.d.onLoaded();
    r.d.tick();
    expect(r.starts).toEqual([]);
  });
});
