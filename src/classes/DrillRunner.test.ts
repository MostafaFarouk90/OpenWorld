import { describe, expect, it, vi } from 'vitest';
import type { ClassId } from '../actors/classes';
import { DRILL_LEAVE_RADIUS, DrillRunner, type DrillPorts } from './DrillRunner';
import type { DrillOutcome, DrillStepDef } from './types';

function make(over: Partial<DrillPorts> = {}) {
  const counts: Record<string, number> = {};
  const s = {
    worn: 'warden' as ClassId | null,
    hasSkills: true,
    canBuy: true,
    bar: true,
    dist: 0 as number | null,
    strings: new Set<string>(),
  };
  const release = vi.fn();
  const shows: { mechanic: string; action: string; textKey: string; opts?: { force?: boolean } }[] = [];
  const hides: (string | undefined)[] = [];
  const alive = { n: 1 };
  const spawn = vi.fn((): readonly unknown[] => (alive.n > 0 ? ['spar'] : []));
  const despawn = vi.fn();
  const reset = vi.fn();
  const emitted: { classId: ClassId; outcome: DrillOutcome }[] = [];
  const ports: DrillPorts = {
    prompts: () => ({
      count: (m) => counts[m] ?? 0,
      show: (mechanic, action, textKey, opts) => void shows.push({ mechanic, action, textKey, opts }),
      hide: (m) => void hides.push(m),
    }),
    enemies: () => ({ spawnGroup: spawn, despawnGroup: despawn, reset, alive: () => Array.from({ length: alive.n }) }),
    pauseKillXp: vi.fn(() => release),
    wornClass: () => s.worn,
    hasSkills: () => s.hasSkills,
    canBuySkill: () => s.canBuy,
    hasBarAbility: () => s.bar,
    distanceFromYard: () => s.dist,
    hasString: (k) => s.strings.has(k),
    emit: (e) => void emitted.push(e),
    ...over,
  };
  const r = new DrillRunner(ports);
  const ends: [ClassId, DrillOutcome][] = [];
  r.onEnd((c, o) => void ends.push([c, o]));
  return { r, counts, s, release, shows, hides, spawn, despawn, reset, alive, emitted, ends, ports };
}

const step = (id: string, mechanic: DrillStepDef['mechanic'], count = 1, extra: Partial<DrillStepDef> = {}): DrillStepDef => ({
  id,
  mechanic,
  action: mechanic,
  count,
  ...extra,
});

describe('DrillRunner flow', () => {
  it('runs every step, then ends done once', () => {
    const t = make();
    expect(t.r.start('warden', [step('a', 'attack1', 2), step('b', 'attack2')])).toBe(true);
    expect(t.ports.pauseKillXp).toHaveBeenCalledWith('classes.drill');
    t.r.tick();
    expect(t.shows).toEqual([{ mechanic: 'attack1', action: 'attack1', textKey: 'classes.drill.default.a', opts: { force: true } }]);
    expect(t.r.state()).toMatchObject({ step: 0, steps: 2, progress: 0, required: 2 });
    t.counts.attack1 = 1;
    expect(t.r.state()?.progress).toBe(1);
    t.r.tick();
    expect(t.hides).toEqual([]);
    t.counts.attack1 = 5;
    expect(t.r.state()?.progress).toBe(2);
    t.r.tick();
    expect(t.hides).toEqual(['attack1']);
    t.r.tick();
    expect(t.shows[1].mechanic).toBe('attack2');
    t.counts.attack2 = 1;
    t.r.tick();
    expect(t.r.running).toBe(false);
    expect(t.r.state()).toBeNull();
    expect(t.emitted).toEqual([{ classId: 'warden', outcome: 'done' }]);
    expect(t.ends).toEqual([['warden', 'done']]);
    expect(t.release).toHaveBeenCalledTimes(1);
    expect(t.hides).toEqual(['attack1', 'attack2']);
  });

  it('counts only the growth since the step began', () => {
    const t = make();
    t.counts.attack1 = 7;
    t.r.start('warden', [step('a', 'attack1', 2)]);
    t.r.tick();
    t.r.tick();
    expect(t.r.running).toBe(true);
    t.counts.attack1 = 9;
    t.r.tick();
    expect(t.r.running).toBe(false);
  });

  it('skip ends skipped and hides the prompt', () => {
    const t = make();
    t.r.start('warden', [step('a', 'attack1')]);
    t.r.tick();
    expect(t.r.skip()).toBe(true);
    expect(t.emitted).toEqual([{ classId: 'warden', outcome: 'skipped' }]);
    expect(t.ends).toEqual([['warden', 'skipped']]);
    expect(t.hides).toEqual(['attack1']);
    expect(t.release).toHaveBeenCalledTimes(1);
    expect(t.r.skip()).toBe(false);
    expect(t.emitted).toHaveLength(1);
  });

  it('walking beyond the leave radius skips; a null distance never ends it', () => {
    const t = make();
    t.r.start('warden', [step('a', 'attack1')]);
    t.s.dist = DRILL_LEAVE_RADIUS;
    t.r.tick();
    expect(t.r.running).toBe(true);
    t.s.dist = DRILL_LEAVE_RADIUS + 1;
    t.r.tick();
    expect(t.r.running).toBe(false);
    expect(t.emitted).toEqual([{ classId: 'warden', outcome: 'skipped' }]);

    const u = make();
    u.s.dist = null;
    u.r.start('warden', [step('a', 'attack1')]);
    for (let i = 0; i < 5; i++) u.r.tick();
    expect(u.r.running).toBe(true);
  });

  it('cancel(true) emits nothing but releases the xp pause; cancel() emits skipped', () => {
    const t = make();
    t.r.start('warden', [step('a', 'attack1')]);
    t.r.tick();
    t.r.cancel(true);
    expect(t.r.running).toBe(false);
    expect(t.emitted).toEqual([]);
    expect(t.ends).toEqual([]);
    expect(t.release).toHaveBeenCalledTimes(1);
    t.r.start('warden', [step('a', 'attack1')]);
    t.r.cancel();
    expect(t.emitted).toEqual([{ classId: 'warden', outcome: 'skipped' }]);
  });

  it('refuses to start while running or with no steps', () => {
    const t = make();
    expect(t.r.start('warden', [])).toBe(false);
    expect(t.ports.pauseKillXp).not.toHaveBeenCalled();
    expect(t.r.start('warden', [step('a', 'attack1')])).toBe(true);
    expect(t.r.start('ashblade', [step('a', 'attack1')])).toBe(false);
    expect(t.r.state()?.classId).toBe('warden');
  });

  it('a replay after done emits again', () => {
    const t = make();
    for (let i = 0; i < 2; i++) {
      t.r.start('warden', [step('a', 'attack1')]);
      t.r.tick();
      t.counts.attack1 = (t.counts.attack1 ?? 0) + 1;
      t.r.tick();
    }
    expect(t.emitted).toEqual([
      { classId: 'warden', outcome: 'done' },
      { classId: 'warden', outcome: 'done' },
    ]);
  });
});

describe('DrillRunner spars', () => {
  const spar = { spawnerId: 'sp.block', moves: ['soldier.chop'] };

  it('waits for the class kit to be worn, then spawns an aggro group and despawns it at step end', () => {
    const t = make();
    t.s.worn = 'knight';
    t.r.start('warden', [step('block', 'block', 1, { spar })]);
    t.r.tick();
    t.r.tick();
    expect(t.spawn).not.toHaveBeenCalled();
    expect(t.shows).toEqual([]);
    t.s.worn = 'warden';
    t.r.tick();
    expect(t.spawn).toHaveBeenCalledWith('sp.block', { moves: ['soldier.chop'], aggro: true });
    expect(t.shows).toHaveLength(1);
    expect(t.despawn).not.toHaveBeenCalled();
    t.counts.block = 1;
    t.r.tick();
    expect(t.despawn).toHaveBeenCalledWith('sp.block');
    expect(t.emitted[0].outcome).toBe('done');
  });

  it('despawns on skip', () => {
    const t = make();
    t.r.start('warden', [step('block', 'block', 1, { spar })]);
    t.r.tick();
    t.r.skip();
    expect(t.despawn).toHaveBeenCalledTimes(1);
    expect(t.despawn).toHaveBeenCalledWith('sp.block');
  });
});

describe('DrillRunner pass-overs and text', () => {
  it('passes over the skills step without class skills or a buyable skill', () => {
    for (const k of ['hasSkills', 'canBuy'] as const) {
      const t = make();
      t.s[k] = false;
      t.r.start('warden', [step('skills', 'skills'), step('a', 'attack1')]);
      t.r.tick();
      expect(t.shows.map((x) => x.mechanic)).toEqual(['attack1']);
      expect(t.r.state()?.step).toBe(1);
    }
    const ok = make();
    ok.r.start('warden', [step('skills', 'skills')]);
    ok.r.tick();
    expect(ok.shows.map((x) => x.mechanic)).toEqual(['skills']);
  });

  it('passes over the ability step without a bar ability, and ends done when only such steps remain', () => {
    const t = make();
    t.s.bar = false;
    t.r.start('warden', [step('ability', 'ability')]);
    t.r.tick();
    expect(t.shows).toEqual([]);
    expect(t.emitted).toEqual([{ classId: 'warden', outcome: 'done' }]);
  });

  it('uses the class text key when the string exists, the default otherwise, an explicit key first', () => {
    const t = make();
    t.s.strings.add('classes.drill.warden.a');
    t.r.start('warden', [step('a', 'attack1'), step('b', 'attack2'), step('c', 'block', 1, { textKey: 'my.key' })]);
    expect(t.r.state()?.textKey).toBe('classes.drill.warden.a');
    t.r.tick();
    t.counts.attack1 = 1;
    t.r.tick();
    expect(t.r.state()?.textKey).toBe('classes.drill.default.b');
    expect(t.shows.map((x) => x.textKey)).toEqual(['classes.drill.warden.a']);
  });

  it('an explicit textKey wins', () => {
    const t = make();
    t.s.strings.add('classes.drill.warden.c');
    t.r.start('warden', [step('c', 'attack1', 1, { textKey: 'my.key' })]);
    expect(t.r.state()?.textKey).toBe('my.key');
  });
});

describe('DrillRunner spars after review', () => {
  const spar = { spawnerId: 'classes.drill.blocker', moves: ['soldier.chop'] };

  it('resets the group before spawning and respawns a spar killed before the step is done', () => {
    const t = make();
    t.r.start('warden', [step('block', 'block', 2, { spar })]);
    t.r.tick();
    expect(t.reset).toHaveBeenCalledWith('classes.drill.blocker');
    expect(t.spawn).toHaveBeenCalledTimes(1);
    t.alive.n = 0;
    t.r.tick();
    // Nothing alive: reset and spawn again (the fake still returns [] while alive is 0).
    expect(t.spawn).toHaveBeenCalledTimes(2);
    expect(t.reset).toHaveBeenCalledTimes(2);
  });

  it('passes over a spar step whose group does not spawn, with a warning', () => {
    const warn = vi.fn();
    const t = make({ warn });
    t.alive.n = 0;
    t.r.start('warden', [step('block', 'block', 2, { spar }), step('a', 'attack1')]);
    t.r.tick();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('classes.drill.blocker'));
    t.r.tick();
    expect(t.r.state()?.step).toBe(1);
  });

  it('runs spar steps with the worn avatar once the kit failed to load', () => {
    const t = make();
    t.s.worn = 'knight';
    t.r.start('warden', [step('block', 'block', 1, { spar })]);
    t.r.tick();
    expect(t.spawn).not.toHaveBeenCalled();
    t.r.kitFailed('warden');
    t.r.tick();
    expect(t.spawn).toHaveBeenCalledTimes(1);
  });
});
