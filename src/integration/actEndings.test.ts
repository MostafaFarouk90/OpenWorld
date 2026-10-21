import { describe, expect, it } from 'vitest';
import { SAVED_FLAG_ALIASES, WorldState } from '../state/WorldState';
import { ACT_ENDINGS, FLAG_ALIASES, actEnding, cardSeenFlags, worldChangeFlag } from './actEndings';
import { ACT1_CARD_SEEN_FLAG, ACT1_ENDING_ID } from './act1Ending';

describe('act-ending table (v0.6)', () => {
  it('one row per act, unique ids and flags', () => {
    expect(ACT_ENDINGS.map((d) => d.act)).toEqual([1, 2]);
    const flags = ACT_ENDINGS.flatMap((d) => [d.gateFlag, d.cardSeenFlag, d.campSeenFlag]);
    expect(new Set(flags).size).toBe(flags.length);
    expect(new Set(ACT_ENDINGS.map((d) => d.endingId)).size).toBe(2);
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
    expect(actEnding(3)).toBeUndefined();
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
