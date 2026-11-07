// The final ending director on fake ports (N12 PR 2, plan 9): step order, flags written only at the gate and after the
// credits, the save hold, a load mid-ending, and the stand-in data's three cards and speaker rule.
import { describe, expect, it, vi } from 'vitest';
import { FinalEndingDirector, type FinalEndingPorts } from './act5EndingDirector';
import { ACT5_ENDING_DATA, M56_CAEL_LIVES_FLAG, M56_CHOICE_FLAG, R30_VERSE_FLAG, TIE_SPEAKER } from './act5EndingData';
import { finalEnding } from './actEndings';
import { FAVOUR_TRACKS, snapshotFlag } from '../state/favour';

const DEF = finalEnding();

interface Gate {
  resolve(): void;
}

function fake(flags: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const pending: Gate[] = [];
  let busy = false;
  let holds = 0;
  let released = 0;
  const wait = (name: string) =>
    new Promise<void>((resolve) => {
      calls.push(name);
      pending.push({ resolve });
    });
  const ports: FinalEndingPorts = {
    getFlag: (k) => flags[k],
    setFlag: (k, v) => {
      calls.push(`set ${k}`);
      flags[k] = v;
    },
    emitActEnded: (e) => calls.push(`ended ${e.act} ${e.endingId}`),
    busy: () => busy,
    playScene: (id) => wait(`scene ${id}`),
    showTitle: (c) => wait(`title ${c.titleKey}${c.lineKey ? ` / ${c.lineKey}` : ''}`),
    showEpilogue: (d) => wait(`epilogue ${d.speaker}`),
    showCredits: (_d, onStep) => {
      onStep('verse1');
      onStep('chosen');
      onStep('last');
      return wait('credits');
    },
    music: {
      credits: (v, tie) => calls.push(`music credits ${v} ${tie}`),
      step: (s) => calls.push(`music ${s}`),
      stop: () => calls.push('music stop'),
    },
    wake: () => wait('wake'),
    suspendSaves: () => {
      holds++;
      calls.push('hold');
      return () => {
        released++;
        calls.push('release');
      };
    },
    save: async () => calls.push('save'),
    warn: vi.fn(),
  };
  const d = new FinalEndingDirector(DEF, ACT5_ENDING_DATA, ports);
  /** Resolves the oldest pending step and lets the director move on. */
  const next = async () => {
    pending.shift()?.resolve();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const settle = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { d, ports, flags, calls, next, settle, setBusy: (b: boolean) => (busy = b), holds: () => holds, released: () => released, pending };
}

const REKINDLE = { [M56_CHOICE_FLAG]: 'rekindle', [M56_CAEL_LIVES_FLAG]: true, [R30_VERSE_FLAG]: 'keepers' };

async function playThrough(f: ReturnType<typeof fake>) {
  f.d.tick();
  await f.settle();
  for (let i = 0; i < 6; i++) await f.next();
}

describe('the final ending director', () => {
  it('nothing before M56 completes: no gate, no steps', () => {
    const f = fake({ ...REKINDLE });
    f.d.tick();
    f.d.onQuestCompleted('m55');
    expect(f.calls).toEqual([]);
    expect(f.d.step).toBe('idle');
  });

  it('M56 complete: the gate once, then cutscene, card, epilogue, credits, after; flags only at the gate and after the credits', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true });
    f.d.holdSaves(); // N11 at the confirm
    f.d.onQuestCompleted('m56');
    f.d.onQuestCompleted('m56');
    await playThrough(f);
    expect(f.calls).toEqual([
      'hold',
      'set story.gate.end',
      'ended 5 embers-or-dawn',
      'scene scene-ending-rekindle',
      'title hud.ending.a5.lastEmber',
      `epilogue ${TIE_SPEAKER}`, // no M56 snapshot in these flags: the stand-in falls back to Tobb
      'music credits keepers false',
      'music verse1',
      'music chosen',
      'music last',
      'credits',
      'music stop',
      'set codex.actEnding.a5.seen',
      'set world.afterEnding',
      'wake',
      'release',
      'save',
    ]);
    expect(f.d.step).toBe('done');
    expect(f.d.log).toEqual(['cutscene', 'card', 'epilogue', 'credits', 'after', 'done']);
    expect(f.holds()).toBe(1);
    expect(f.released()).toBe(1);
    // a later tick and a repeated completion do nothing
    f.d.tick();
    f.d.onQuestCompleted('m56');
    expect(f.calls.filter((c) => c.startsWith('set story.gate.end'))).toHaveLength(1);
  });

  it('the hold is released only after the after-state is written and the wake resolved', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true });
    f.d.onQuestCompleted('m56');
    f.d.tick();
    await f.settle();
    for (let i = 0; i < 4; i++) await f.next();
    expect(f.flags['world.afterEnding']).toBe(true);
    expect(f.d.holding).toBe(true);
    expect(f.calls.at(-1)).toBe('wake');
    await f.next();
    expect(f.d.holding).toBe(false);
    expect(f.calls.slice(-2)).toEqual(['release', 'save']);
  });

  it('waits while busy (the aftermath dialogue, a modal)', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true });
    f.setBusy(true);
    f.d.onQuestCompleted('m56');
    f.d.tick();
    await f.settle();
    expect(f.calls.some((c) => c.startsWith('scene'))).toBe(false);
    f.setBusy(false);
    f.d.tick();
    await f.settle();
    expect(f.calls.at(-1)).toBe('scene scene-ending-rekindle');
  });

  it('Rekindle with Cael dead shows the last-bearer line; Let It Die the Long Dawn and its cutscene', async () => {
    const dies = fake({ ...REKINDLE, [M56_CAEL_LIVES_FLAG]: false, 'story.m56.complete': true });
    dies.d.tick();
    await dies.settle();
    await dies.next();
    expect(dies.calls).toContain('title hud.ending.a5.lastEmber / hud.ending.a5.lastBearer');
    const dawn = fake({ [M56_CHOICE_FLAG]: 'let-it-die', [M56_CAEL_LIVES_FLAG]: true, 'story.m56.complete': true });
    dawn.d.tick();
    await dawn.settle();
    await dawn.next();
    expect(dawn.calls).toContain('scene scene-ending-let-it-die');
    expect(dawn.calls).toContain('title hud.ending.a5.longDawn');
  });

  it('a load mid-ending drops the running steps and plays again from the cutscene; the gate and act.ended are not repeated', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true });
    f.d.tick();
    await f.settle();
    await f.next(); // cutscene done
    await f.next(); // card done: the epilogue is up
    expect(f.d.step).toBe('epilogue');
    f.d.onLoaded();
    expect(f.d.step).toBe('idle');
    await f.next(); // the stale epilogue closes: the stale run stops
    expect(f.calls).not.toContain('music credits keepers false');
    f.d.tick();
    await f.settle();
    expect(f.calls.filter((c) => c === 'scene scene-ending-rekindle')).toHaveLength(2);
    expect(f.calls.filter((c) => c.startsWith('ended'))).toHaveLength(1);
    expect(f.calls.filter((c) => c === 'set story.gate.end')).toHaveLength(1);
    // the hold stayed up through the load (the gate stands) and is released once, at the end
    for (let i = 0; i < 6; i++) await f.next();
    expect(f.d.step).toBe('done');
    expect(f.released()).toBe(1);
  });

  it('a load before the gate (before the confirm) releases N11\'s hold: the choice replays with saves free', () => {
    const f = fake({});
    f.d.holdSaves();
    expect(f.d.holding).toBe(true);
    f.d.onLoaded();
    expect(f.d.holding).toBe(false);
    expect(f.released()).toBe(1);
  });

  it('a load after the ending does nothing and takes no hold', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true, 'story.gate.end': true, 'world.afterEnding': true });
    f.d.onLoaded();
    f.d.tick();
    f.d.holdSaves();
    await f.settle();
    expect(f.calls).toEqual(['music stop']);
    expect(f.d.step).toBe('done');
  });

  it('an old save with M56 complete and no gate writes the gate on its first tick', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true });
    f.d.tick();
    await f.settle();
    expect(f.calls.slice(0, 4)).toEqual(['set story.gate.end', 'ended 5 embers-or-dawn', 'hold', 'scene scene-ending-rekindle']);
  });

  it('no choice flag with the gate: warns and plays the Rekindle cutscene (never stalls)', async () => {
    const f = fake({ 'story.m56.complete': true });
    f.d.tick();
    await f.settle();
    expect(f.ports.warn).toHaveBeenCalled();
    expect(f.calls).toContain('scene scene-ending-rekindle');
  });

  it('no wake port (N13 absent): the after-state, release and save still happen', async () => {
    const f = fake({ ...REKINDLE, 'story.m56.complete': true });
    delete (f.ports as { wake?: unknown }).wake;
    f.d.tick();
    await f.settle();
    for (let i = 0; i < 4; i++) await f.next();
    await f.settle();
    expect(f.calls.slice(-3)).toEqual(['set world.afterEnding', 'release', 'save']);
  });
});

describe('the ending data stand-ins (until N11 PR 2)', () => {
  const snap = (vals: number[]) => {
    const o: Record<string, unknown> = { [snapshotFlag('m56', 'taken')]: true };
    FAVOUR_TRACKS.forEach((t, i) => (o[snapshotFlag('m56', t)] = vals[i]));
    return o;
  };
  it('the speaker is the top track at M56; a tie is Tobb, and tie is set', () => {
    const top = ACT5_ENDING_DATA.epilogueFor((k) => snap([50, 10, 10, 10, 10])[k]);
    expect(top).toMatchObject({ speaker: 'Halvard', tie: false });
    const tie = ACT5_ENDING_DATA.epilogueFor((k) => snap([50, 50, 10, 10, 10])[k]);
    expect(tie).toMatchObject({ speaker: TIE_SPEAKER, tie: true });
  });
  it('the credits carry the three ballad steps, the chosen verse named or the fixed one', () => {
    const steps = (v: unknown) => ACT5_ENDING_DATA.creditsFor((k) => (k === R30_VERSE_FLAG ? v : undefined)).blocks.filter((b) => b.kind === 'verse');
    expect(steps('gaut').map((b) => (b as { step: string }).step)).toEqual(['verse1', 'chosen', 'last']);
    expect(JSON.stringify(steps(undefined))).toContain('fixed');
  });
});
