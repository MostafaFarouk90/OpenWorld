// M52 on the real quest manager with N4's siege service stubbed: the snapshot is taken once at the start (a later favour change
// does not move it), the gate talk and the stairs, the siege started at the start point, the waves from N4's events, the household
// guard (two fallen, or wave 4 cleared without them), wave4Held per wave's breach, sparedAny on M52's spawn tag only, the gate
// holds, the stood flags from the roster, the named allies stepping out while the siege runs, and Wystan's report.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './rig.testkit';
import { M52_OUT } from './siege';
import { snapshotFlag } from '../../../../../state/favour';
import { HARROWMARK_NPCS } from '../../../../../harrowmark/harrowmark.layout';
import { WASTE_A4_NPCS } from '../../../act4/waste/npcs';
import { M52_OUT_NPCS } from './siege';
import {
  M52_GATE_HELD, M52_GUARD_EVENT, M52_SPARED_ANY, M52_SPAWN_TAG, M52_START_TRIGGER, M52_STAIRS, M52_STOOD, M52_WAVE, M52_WAVE4_HELD, M52_WOUNDED,
} from '../m52.quest';

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const settle = (r: Rig): void => r.step(35);

function ready(flags: Record<string, boolean | number | string> = {}): Rig {
  const r = (rig = makeRig({ flags: { 'story.gate.a5': true, ...flags } }));
  r.complete('m47', 'm48', 'm49', 'm50', 'm51', 'r26');
  return r;
}

function toStart(r: Rig): void {
  r.begin('m52', 'wystan');
  r.talk('wystan');
  settle(r);
  expect(r.flag(M52_STAIRS), 'the stairs scene').toBe(true);
  r.enter(M52_START_TRIGGER);
  settle(r);
  expect(r.done('m52', 'start')).toBe(true);
}

const cleared = (r: Rig, n: number, breached = false): void => { r.emit('siege.wave.cleared', { siegeId: 'm52', n, breached }); r.step(2); };

describe('M52', () => {
  it('is held until each of M47 to M51 and R26 is done; R29 does not hold it', () => {
    for (const missing of ['m47', 'm48', 'm49', 'm50', 'm51', 'r26']) {
      const r = makeRig({ flags: { 'story.gate.a5': true } });
      r.complete(...['m47', 'm48', 'm49', 'm50', 'm51', 'r26'].filter((q) => q !== missing));
      expect(r.manager.start('m52'), `without ${missing}`).toBe(false);
      r.dispose();
    }
    const r = ready();
    expect(r.manager.start('m52')).toBe(true);
  });

  it('takes the snapshot once at the start; a later favour change and a load do not move it', () => {
    const r = ready();
    r.state.addFavour('halvard', 30, 'script' as never);
    const at = r.state.favour('halvard');
    r.begin('m52', 'wystan');
    expect(r.state.getFlag(snapshotFlag('m52', 'taken'))).toBe(true);
    expect(r.state.getFlag(snapshotFlag('m52', 'halvard'))).toBe(at);
    r.state.addFavour('halvard', -20, 'script' as never);
    r.saveLoad();
    expect(r.state.getFlag(snapshotFlag('m52', 'halvard'))).toBe(at);
  });

  it('plays to completion: the siege starts at the start point, four waves, the guard, the gate holds, Wystan', () => {
    const r = ready({ 'story.r24.choice': 'all' });
    toStart(r);
    r.step(16);
    expect(r.siege.starts).toEqual(['m52']);
    expect(r.flag(M52_OUT('rook'))).toBe(true);
    expect(r.flag(M52_OUT('edric'))).toBe(true);
    expect(r.flag(M52_OUT('wulfhild')), 'F8 All: her squad stands').toBe(true);
    for (const n of [1, 2, 3]) cleared(r, n);
    expect(r.current('m52', 'guard')).toBe(true);
    r.emit(M52_GUARD_EVENT, { siegeId: 'm52', actorId: 'g1' });
    r.emit(M52_GUARD_EVENT, { siegeId: 'm52', actorId: 'g1' });
    r.step(1);
    expect(r.done('m52', 'guard'), 'one guard twice is one').toBe(false);
    r.emit(M52_GUARD_EVENT, { siegeId: 'r27', actorId: 'g2' });
    r.emit(M52_GUARD_EVENT, { siegeId: 'm52', actorId: 'g2' });
    r.step(1);
    expect(r.done('m52', 'guard')).toBe(true);
    cleared(r, 4);
    expect(r.flag(M52_WAVE4_HELD)).toBe(true);
    r.siege.finish();
    r.emit('siege.completed', { siegeId: 'm52' });
    settle(r);
    expect(r.flag(M52_GATE_HELD)).toBe(true);
    expect(r.flag(M52_STOOD('ashwalker'))).toBe(true);
    r.step(16);
    for (const id of ['rook', 'edric', 'wulfhild'] as const) expect(r.flag(M52_OUT(id)), id).toBe(false);
    r.talk('wystan');
    r.step(2);
    expect(r.qs('m52')).toBe('completed');
    expect(r.flag('story.m52.complete')).toBe(true);
  });

  it('a spared guard never stalls: wave 4 cleared closes the guard step; a breach in wave 4 is not held', () => {
    const r = ready();
    toStart(r);
    r.step(16);
    expect(r.flag(M52_OUT('wulfhild')), 'no F8 All: she stays at the camp').toBe(false);
    for (const n of [1, 2, 3]) cleared(r, n);
    r.emit(M52_GUARD_EVENT, { siegeId: 'm52', actorId: 'g1' });
    cleared(r, 4, true);
    settle(r);
    expect(r.done('m52', 'guard')).toBe(true);
    expect(r.done('m52', 'wave4')).toBe(true);
    expect(r.flag(M52_WAVE4_HELD)).toBe(false);
  });

  it('an earlier wave\'s breach does not spoil wave 4', () => {
    const r = ready();
    toStart(r);
    cleared(r, 1, true);
    cleared(r, 2);
    cleared(r, 3, true);
    cleared(r, 4, false);
    expect(r.flag(M52_WAVE4_HELD)).toBe(true);
  });

  it('sparedAny: only a soldier of the siege, only while it runs', () => {
    const r = ready();
    r.actorTag.set('a1', 'm51.scouts');
    r.actorTag.set('a2', M52_SPAWN_TAG);
    r.emit('mercy', { verb: 'spare', tier: 'normal', track: 'halvard', creature: 'warhost-soldier', actorId: 'a2' });
    expect(r.flag(M52_SPARED_ANY), 'before the siege').toBe(false);
    toStart(r);
    r.emit('mercy', { verb: 'spare', tier: 'normal', track: 'halvard', creature: 'warhost-soldier', actorId: 'a1' });
    expect(r.flag(M52_SPARED_ANY), 'another tag').toBe(false);
    r.emit('mercy', { verb: 'spare', tier: 'normal', track: 'halvard', creature: 'warhost-soldier', actorId: 'a2' });
    expect(r.flag(M52_SPARED_ANY)).toBe(true);
  });

  it('a load in the siege waits for N4 to rebuild before restarting a missing run', () => {
    const r = ready();
    toStart(r);
    r.step(16);
    expect(r.siege.starts.length).toBe(1);
    r.siege.running = false; // the save came back with no run
    r.saveLoad();
    r.step(30);
    expect(r.siege.starts.length).toBe(1);
    r.step(60);
    expect(r.siege.starts.length).toBe(2);
  });

  it('a finished siege closes every wave even if the clears were missed (a load after the last clear)', () => {
    const r = ready();
    toStart(r);
    r.siege.finish();
    r.step(16);
    for (const n of [1, 2, 3, 4]) expect(r.flag(M52_WAVE(n)), `wave ${n}`).toBe(true);
    settle(r);
    expect(r.done('m52', 'wave4')).toBe(true);
  });

  it('the wounded talk is optional: the report does not wait for it', () => {
    const r = ready();
    toStart(r);
    for (const n of [1, 2, 3, 4]) cleared(r, n);
    r.state.setFlag(M52_WOUNDED, 'hrolf');
    r.siege.finish();
    r.emit('siege.completed', { siegeId: 'm52' });
    settle(r);
    expect(r.current('m52', 'wounded')).toBe(true);
    expect(r.current('m52', 'report')).toBe(true);
    r.talk('wystan');
    r.step(2);
    expect(r.qs('m52')).toBe('completed');
  });

  it('the named allies\' shipped specs step out on the flags the director writes', () => {
    const specs = [...HARROWMARK_NPCS, ...WASTE_A4_NPCS];
    for (const id of M52_OUT_NPCS) expect(specs.find((n) => n.id === id)?.absentWhen, id).toBe(M52_OUT(id));
  });
});
