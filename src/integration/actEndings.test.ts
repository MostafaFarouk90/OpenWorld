import { describe, expect, it } from 'vitest';
import { SAVED_FLAG_ALIASES, WorldState } from '../state/WorldState';
import { ACT_ENDINGS, FLAG_ALIASES, actEnding, cardSeenFlags, directorDef, worldChangeFlag } from './actEndings';
import { ActEndingDirector } from './actEndingDirector';
import { ACT1_CARD_SEEN_FLAG, ACT1_ENDING_ID } from './act1Ending';

describe('act-ending table (v0.6)', () => {
  it('one row per act, unique ids and flags', () => {
    expect(ACT_ENDINGS.map((d) => d.act)).toEqual([1, 2, 3]);
    const flags = ACT_ENDINGS.flatMap((d) => [d.gateFlag, d.cardSeenFlag, d.campSeenFlag]);
    expect(new Set(flags).size).toBe(flags.length);
    expect(new Set(ACT_ENDINGS.map((d) => d.endingId)).size).toBe(3);
  });

  it('act 1 keeps its v0.5 ids and reads the legacy seen key', () => {
    const a1 = actEnding(1)!;
    expect(a1.endingId).toBe(ACT1_ENDING_ID);
    expect(a1.gateFlag).toBe('story.gate.a2');
    expect(cardSeenFlags(a1)).toEqual(['codex.actEnding.a1.seen', ACT1_CARD_SEEN_FLAG]);
  });

  it('act 2: The Houses Stand, gate a3, camp scene-act2-camp', () => {
    const a2 = actEnding(2)!;
    expect(a2).toMatchObject({
      endingId: 'the-houses-stand',
      requires: ['m22', 'd04'],
      gateFlag: 'story.gate.a3',
      cardSeenFlag: 'codex.actEnding.a2.seen',
      campDialogueId: 'scene-act2-camp',
      campSeenFlag: 'story.a2.campSeen',
    });
    expect(worldChangeFlag(a2)).toBe('story.gate.a3');
    expect(actEnding(4)).toBeUndefined();
  });

  it('the save aliases WorldState applies match the table', () => {
    expect(SAVED_FLAG_ALIASES).toEqual(FLAG_ALIASES);
  });
});

describe('WorldState.load alias', () => {
  const load = (flags: Record<string, unknown>) => {
    const ws = new WorldState({ emit: () => undefined } as never, () => undefined);
    ws.load({ flags });
    return ws;
  };
  it('a legacy true key also sets the v0.6 key', () => {
    const ws = load({ 'codex.actEndingSeen': true });
    expect(ws.getBool('codex.actEnding.a1.seen')).toBe(true);
    expect(ws.getBool('codex.actEndingSeen')).toBe(true);
  });
  it('a v0.6 key already saved is left as it is', () => {
    const ws = load({ 'codex.actEndingSeen': true, 'codex.actEnding.a1.seen': false });
    expect(ws.getFlag('codex.actEnding.a1.seen')).toBe(false);
  });
  it('no legacy key, no alias; a false legacy key does not alias', () => {
    expect(load({}).getFlag('codex.actEnding.a1.seen')).toBeUndefined();
    expect(load({ 'codex.actEndingSeen': false }).getFlag('codex.actEnding.a1.seen')).toBeUndefined();
  });
});

describe('ActEndingDirector for Act 2 (the generic director on the table row)', () => {
  function make() {
    const flags = new Map<string, unknown>();
    const quests = new Map<string, string>();
    const ended: { act: number; endingId: string }[] = [];
    let camps = 0;
    const d = new ActEndingDirector(directorDef(actEnding(2)!), {
      questState: (id) => quests.get(id) ?? 'inactive',
      getFlag: (k) => flags.get(k),
      setFlag: (k, v) => void flags.set(k, v),
      emitActEnded: (e) => void ended.push(e),
      busy: () => false,
      inCombat: () => false,
      startCamp: () => (camps++, true),
    });
    return { d, flags, quests, ended, camps: () => camps };
  }

  it('ends once on the second of m22 and d04, with act 2 and its id', () => {
    const t = make();
    t.quests.set('m22', 'completed');
    t.d.onQuestCompleted('m22');
    expect(t.ended).toEqual([]);
    t.quests.set('d04', 'completed');
    t.d.onQuestCompleted('d04');
    t.d.onQuestCompleted('d04');
    expect(t.ended).toEqual([{ act: 2, endingId: 'the-houses-stand' }]);
    expect(t.flags.get('story.gate.a3')).toBe(true);
    expect(t.flags.get('story.gate.a2')).toBeUndefined();
  });

  it("Act 1's completions and card do nothing to it", () => {
    const t = make();
    t.quests.set('m10', 'completed');
    t.quests.set('d02', 'completed');
    t.d.onQuestCompleted('d02');
    t.d.onCardClosed('smoke-over-harrowmark');
    expect(t.ended).toEqual([]);
    expect(t.d.pending).toBe(false);
  });

  it('card closed arms the camp; it runs once on the tick', () => {
    const t = make();
    t.flags.set('story.gate.a3', true);
    t.d.onCardClosed('the-houses-stand');
    t.d.tick();
    t.d.tick();
    expect(t.camps()).toBe(1);
  });

  it('a load with the a2 card seen and no camp arms the camp', () => {
    const t = make();
    t.flags.set('story.gate.a3', true);
    t.flags.set('codex.actEnding.a2.seen', true);
    t.d.onLoaded();
    expect(t.d.pending).toBe(true);
  });
});
