import { describe, expect, it } from 'vitest';
import { SkarlBrain, type SkarlHooks, type SkarlSense } from './SkarlBrain';
import { BOLT, KICK, SKARL } from './tuning';

const TICK = 1 / 60;

function rig() {
  const log: string[] = [];
  const hooks: SkarlHooks = {
    telegraph: (a, k, s, lead) => log.push(`tg:${a}:${k}:${s}:${lead}`),
    cancelTelegraph: (s) => log.push(`cancel:${s}`),
    loose: (s, i, n, fan) => log.push(`loose:${s}:${i}/${n}:${fan}`),
    kick: (s) => log.push(`kick:${s}`),
    broken: () => log.push('broken'),
    restorePoise: () => log.push('poise'),
  };
  const brain = new SkarlBrain(hooks);
  let sense: SkarlSense = { dist: 14, onPostLane: false };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) brain.tick(TICK, sense);
  };
  const set = (s: Partial<SkarlSense>) => (sense = { ...sense, ...s });
  const looses = () => log.filter((l) => l.startsWith('loose:'));
  return { brain, log, run, set, looses };
}

describe('SkarlBrain', () => {
  it('idles until started; then reload, a 0.8 s yellow aim and one bolt in phase 1, round again', () => {
    const r = rig();
    r.run(5);
    expect(r.log).toEqual([]);
    r.brain.start();
    expect(r.brain.state).toBe('reload');
    expect(r.brain.moving).toBe('strafe');
    r.run(BOLT.reloadSeconds + TICK);
    expect(r.brain.state).toBe('aim');
    expect(r.brain.moving).toBe('hold');
    expect(r.log).toEqual([`tg:${BOLT.attackId}:block:1:${BOLT.aimSeconds}`]);
    r.run(BOLT.aimSeconds);
    expect(r.looses()).toEqual(['loose:1:0/1:false']);
    expect(r.brain.state).toBe('reload');
    r.run(BOLT.reloadSeconds + BOLT.aimSeconds + 2 * TICK);
    expect(r.looses()).toHaveLength(2);
  });

  it('phase 2 looses two bolts 0.5 s apart; phase 3 a fan of three at once', () => {
    const r = rig();
    r.brain.start();
    r.brain.onPhase(2);
    r.run(BOLT.reloadSeconds + BOLT.aimSeconds + 2 * TICK);
    expect(r.looses()).toEqual(['loose:1:0/2:false']);
    r.run(BOLT.burstGap);
    expect(r.looses()).toEqual(['loose:1:0/2:false', 'loose:1:1/2:false']);
    r.brain.onPhase(3);
    r.run(BOLT.reloadSeconds + BOLT.aimSeconds + 2 * TICK);
    expect(r.looses().slice(2)).toEqual(['loose:2:0/3:true', 'loose:2:1/3:true', 'loose:2:2/3:true']);
    r.brain.onPhase(2);
    expect(r.brain.phase).toBe(3);
  });

  it('close: a hop back (at most once every 3 s), then a 0.5 s kick if the player stays 1.5 s', () => {
    const r = rig();
    r.brain.start();
    r.set({ dist: 2 });
    r.run(TICK);
    expect(r.brain.state).toBe('backstep');
    expect(r.brain.moving).toBe('backstep');
    r.run(SKARL.backstepSeconds + TICK);
    expect(r.brain.state).toBe('reload');
    r.run(SKARL.closeKickSeconds - SKARL.backstepSeconds);
    expect(r.brain.state).toBe('kick');
    expect(r.log.some((l) => l.startsWith(`tg:${KICK.attackId}:block`))).toBe(true);
    r.run(KICK.windup + TICK);
    expect(r.log.filter((l) => l.startsWith('kick:'))).toHaveLength(1);
    r.run(KICK.recover);
    expect(r.brain.state).not.toBe('kick');
  });

  it('a kick in the aim cancels the aim telegraph', () => {
    const r = rig();
    r.brain.start();
    r.run(BOLT.reloadSeconds + TICK);
    expect(r.brain.state).toBe('aim');
    // Already hopped (cooldown), so the close player gets the kick.
    r.set({ dist: 2 });
    r.run(TICK);
    r.run(SKARL.backstepSeconds);
    r.run(SKARL.closeKickSeconds);
    expect(r.log).toContain('cancel:1');
  });

  it('on the post lane he clears it in the reload and the aim', () => {
    const r = rig();
    r.brain.start();
    r.set({ onPostLane: true });
    r.run(TICK);
    expect(r.brain.moving).toBe('clearLane');
    r.run(BOLT.reloadSeconds);
    expect(r.brain.state).toBe('aim');
    expect(r.brain.moving).toBe('clearLane');
    r.set({ onPostLane: false });
    r.run(TICK);
    expect(r.brain.moving).toBe('hold');
  });

  it('a break kneels him 3 s (cancelling an aim), restores poise and reloads; none while idle', () => {
    const r = rig();
    expect(r.brain.onBreak()).toBe(false);
    r.brain.start();
    r.run(BOLT.reloadSeconds + TICK);
    expect(r.brain.onBreak()).toBe(true);
    expect(r.log).toContain('cancel:1');
    expect(r.brain.state).toBe('broken');
    r.run(SKARL.breakSeconds - 0.1);
    expect(r.brain.state).toBe('broken');
    r.run(0.2);
    expect(r.log).toContain('poise');
    expect(r.brain.state).toBe('reload');
  });

  it('the Spare window holds him (no bolts, no kick, no break); a lapsed window lets him fight on; the outcome ends him', () => {
    const r = rig();
    r.brain.start();
    r.brain.onReleaseWindow(true);
    expect(r.brain.state).toBe('window');
    r.set({ dist: 1 });
    r.run(6);
    expect(r.looses()).toHaveLength(0);
    expect(r.log.some((l) => l.startsWith('kick:'))).toBe(false);
    expect(r.brain.onBreak()).toBe(false);
    r.brain.onReleaseWindow(false);
    expect(r.brain.state).toBe('reload');
    r.brain.onOutcome();
    expect(r.brain.state).toBe('dying');
    r.run(5);
    expect(r.brain.state).toBe('dying');
  });

  it('ignores bad input: NaN and negative dt, a NaN distance', () => {
    const r = rig();
    r.brain.start();
    r.brain.tick(NaN, { dist: 14, onPostLane: false });
    r.brain.tick(-1, { dist: 14, onPostLane: false });
    r.set({ dist: NaN });
    r.run(BOLT.reloadSeconds + BOLT.aimSeconds + 2 * TICK);
    expect(r.looses()).toHaveLength(1);
    expect(r.brain.state).toBe('reload');
  });
});
