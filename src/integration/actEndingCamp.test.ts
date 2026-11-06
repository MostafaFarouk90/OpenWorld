import { describe, expect, it, vi } from 'vitest';
import { ACT_ENDINGS, actEnding, directorDef } from './actEndings';
import { ActEndingDirector, MOVE_RETRY_TICKS, MOVE_TRIES, type ActEndingPorts } from './actEndingDirector';
import { HUD_STRINGS_EN } from '../hud/strings.en';

function make(act: number, moveTo?: ActEndingPorts['moveTo']) {
  const flags: Record<string, unknown> = {};
  const def = actEnding(act)!;
  const startCamp = vi.fn(() => true);
  const ports: ActEndingPorts = {
    questState: () => 'completed',
    getFlag: (k) => flags[k],
    setFlag: (k) => void (flags[k] = true),
    emitActEnded: () => undefined,
    busy: () => false,
    inCombat: () => false,
    startCamp,
    ...(moveTo ? { moveTo } : {}),
  };
  const d = new ActEndingDirector(directorDef(def), ports);
  d.onQuestCompleted(def.requires[0]);
  d.onCardClosed(def.endingId);
  return { d, startCamp, flags };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('act 3 ending row', () => {
  it('matches plan item 18', () => {
    expect(ACT_ENDINGS.find((d) => d.act === 3)).toEqual({
      act: 3,
      endingId: 'the-coal-mothers-oath',
      requires: ['m34', 'd06'],
      gateFlag: 'story.gate.a4',
      cardKey: 'hud.ending.a3.title',
      cardSeenFlag: 'codex.actEnding.a3.seen',
      campDialogueId: 'scene-act3-camp',
      campSeenFlag: 'story.a3.campSeen',
      campAnchorId: 'dragonspine.wyrmwatch.hearth',
    });
    expect(HUD_STRINGS_EN['hud.ending.a3.title']).toBe("The Coal-Mother's Oath");
    expect(actEnding(1)!.campAnchorId).toBeUndefined();
    expect(actEnding(2)!.campAnchorId).toBeUndefined();
    expect(directorDef(actEnding(1)!)).not.toHaveProperty('campAnchorId');
    expect(directorDef(actEnding(3)!).campAnchorId).toBe('dragonspine.wyrmwatch.hearth');
  });
});

describe('camp anchor', () => {
  it('without an anchor (acts 1 and 2) the camp starts at once and moveTo is never called', () => {
    for (const act of [1, 2]) {
      const moveTo = vi.fn(() => true);
      const t = make(act, moveTo);
      t.d.tick();
      expect(t.startCamp).toHaveBeenCalledTimes(1);
      expect(moveTo).not.toHaveBeenCalled();
    }
  });
  it('with an anchor, moves once and starts the camp only after it resolves true', async () => {
    let resolve!: (v: boolean) => void;
    const moveTo = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const t = make(3, moveTo);
    t.d.tick();
    t.d.tick();
    expect(moveTo).toHaveBeenCalledTimes(1);
    expect(moveTo).toHaveBeenCalledWith('dragonspine.wyrmwatch.hearth');
    expect(t.startCamp).not.toHaveBeenCalled();
    resolve(true);
    await flush();
    t.d.tick();
    expect(t.startCamp).toHaveBeenCalledTimes(1);
    expect(moveTo).toHaveBeenCalledTimes(1);
  });
  it('a synchronous true moves and the next tick starts the camp', () => {
    const moveTo = vi.fn(() => true);
    const t = make(3, moveTo);
    t.d.tick();
    t.d.tick();
    expect(t.startCamp).toHaveBeenCalledTimes(1);
  });
  it('on false, a throw, a rejection or a missing port: tried MOVE_TRIES times, then warns once and starts the camp where the player stands', async () => {
    const cases: (ActEndingPorts['moveTo'] | undefined)[] = [
      () => false,
      () => {
        throw new Error('x');
      },
      () => Promise.reject(new Error('x')),
      undefined,
    ];
    for (const moveTo of cases) {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const spy = moveTo ? vi.fn(moveTo) : undefined;
      const t = make(3, spy);
      for (let i = 0; i < MOVE_TRIES * (MOVE_RETRY_TICKS + 2) && t.startCamp.mock.calls.length === 0; i++) {
        t.d.tick();
        await flush();
      }
      expect(t.startCamp).toHaveBeenCalledTimes(1);
      if (spy) expect(spy).toHaveBeenCalledTimes(MOVE_TRIES);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    }
  });
  it('a load while the move is in flight re-derives and moves again', async () => {
    let resolve!: (v: boolean) => void;
    const moveTo = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    const t = make(3, moveTo);
    t.d.tick();
    t.flags['codex.actEnding.a3.seen'] = true;
    t.d.onLoaded();
    resolve(true);
    await flush();
    t.d.tick();
    expect(t.startCamp).not.toHaveBeenCalled();
    t.d.tick();
    expect(moveTo).toHaveBeenCalledTimes(2);
  });
  it('a move started before a load that answers after the new move began never finishes the new one', async () => {
    const resolvers: Array<(v: boolean) => void> = [];
    const moveTo = vi.fn(() => new Promise<boolean>((r) => resolvers.push(r)));
    const t = make(3, moveTo);
    t.d.tick();
    t.flags['codex.actEnding.a3.seen'] = true;
    t.d.onLoaded();
    t.d.tick(); // the second move begins
    expect(moveTo).toHaveBeenCalledTimes(2);
    resolvers[0]!(true); // the first, stale answer
    await flush();
    t.d.tick();
    expect(t.startCamp).not.toHaveBeenCalled();
    resolvers[1]!(true);
    await flush();
    t.d.tick();
    expect(t.startCamp).toHaveBeenCalledTimes(1);
  });
  it('a refused move (a teleport still fading) waits and is tried again; the camp starts after the move that lands', async () => {
    const answers = [false, true];
    const moveTo = vi.fn(() => answers.shift() ?? true);
    const t = make(3, moveTo);
    t.d.tick();
    expect(moveTo).toHaveBeenCalledTimes(1);
    for (let i = 0; i < MOVE_RETRY_TICKS; i++) t.d.tick();
    expect(moveTo).toHaveBeenCalledTimes(1);
    expect(t.startCamp).not.toHaveBeenCalled();
    t.d.tick();
    expect(moveTo).toHaveBeenCalledTimes(2);
    t.d.tick();
    expect(t.startCamp).toHaveBeenCalledTimes(1);
  });
});

describe('act 4 ending row (v0.8 item 14)', () => {
  it('builds a director def that ends on M46 and D08 at the Rimfoot fire', () => {
    const d = directorDef(actEnding(4)!);
    expect(d.endingId).toBe('the-road-to-the-rim');
    expect(d.requires).toEqual(['m46', 'd08']);
    expect(d.gateFlag).toBe('story.gate.a5');
    expect(d.campAnchorId).toBe('waste.rimfoot.fire');
  });
});
