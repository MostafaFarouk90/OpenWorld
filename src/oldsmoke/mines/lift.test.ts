import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { InteriorError } from '../../interiors/InteriorController';
import { createFakeCore } from '../../region/testing/fakeCore';
import { MINE_DOOR_IDS, MINE_IDS, MINE_LANDINGS } from './kit';
import { LIFT_STRINGS_EN, MINE_DOOR_LOCKS, registerLift, rideTo, SURFACE_LIFT_ANCHOR, type LiftCtx } from './lift';
import { LiftMenuModel } from './liftMenu';
import { LIFT_ARMED_FLAG, LIFT_STOPS, stopById } from './liftStops';

function fakeInteriors(start: string | null = null, fail: Partial<Record<'enter' | 'exit' | 'transfer', string>> = {}, withTransfer = false) {
  const calls: string[] = [];
  const svc = {
    current: start as string | null,
    transitioning: false,
    async exit(door?: string) {
      calls.push(`exit:${door}`);
      if (fail.exit) throw new InteriorError(fail.exit as never);
      svc.current = null;
    },
    async enter(id: string, door: string) {
      calls.push(`enter:${id}:${door}`);
      if (fail.enter) throw new InteriorError(fail.enter as never);
      svc.current = id;
    },
    ...(withTransfer
      ? {
          async transfer(id: string, door: string) {
            calls.push(`transfer:${id}:${door}`);
            if (fail.transfer) throw new InteriorError(fail.transfer as never);
            svc.current = id;
          },
        }
      : {}),
  };
  return { svc, calls };
}

function setup(opts: { current?: string | null; fail?: Partial<Record<'enter' | 'exit', string>>; quests?: Record<string, string> } = {}) {
  const fc = createFakeCore();
  const { svc, calls } = fakeInteriors(opts.current ?? null, opts.fail);
  fc.services.set('interiors', svc);
  fc.services.set('quests', { state: (id: string) => opts.quests?.[id] ?? 'inactive', objectiveDone: () => false });
  fc.ctx.strings.register('en', LIFT_STRINGS_EN);
  const ctx = { ...fc.ctx, hud: { openModal: () => () => {}, mount: () => () => {} }, input: {} } as unknown as LiftCtx;
  const menus: Array<{ rows: { id: string; locked: boolean }[]; choose: (id: string) => void }> = [];
  const off = registerLift(ctx, { heightAt: () => 0, openMenu: (rows, choose) => (menus.push({ rows: [...rows], choose }), () => {}) });
  return { fc, ctx, off, svc, calls, menus };
}
const anchor = (fc: ReturnType<typeof createFakeCore>, id: string) => fc.anchors.set(id, { id, position: { x: 1, y: 0, z: 2 }, yaw: 0 } as never);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('lift constants', () => {
  it('locks every mine door behind the armed flag', () => {
    expect(Object.keys(MINE_DOOR_LOCKS).sort()).toEqual(Object.values(MINE_DOOR_IDS).sort());
    expect(new Set(Object.values(MINE_DOOR_LOCKS))).toEqual(new Set([LIFT_ARMED_FLAG]));
  });
  it('has a string for every stop label and lock reason', () => {
    for (const s of LIFT_STOPS) {
      expect(LIFT_STRINGS_EN[s.labelKey]).toBeTruthy();
      expect(LIFT_STRINGS_EN[s.lockedKey]).toBeTruthy();
    }
  });
  it('moves the menu cursor over unlocked rows first and wraps', () => {
    const m = new LiftMenuModel([{ id: 'a', label: 'a', locked: true }, { id: 'b', label: 'b', locked: false }, { id: 'c', label: 'c', locked: false }]);
    expect(m.selected?.id).toBe('b');
    m.move(1);
    m.move(1);
    expect(m.selected?.id).toBe('a');
    m.move(-1);
    expect(m.selected?.id).toBe('c');
  });
});

describe('rideTo sequencing', () => {
  it('surface to a mine is a single enter', async () => {
    const { svc, calls } = fakeInteriors(null);
    expect(await rideTo(svc, stopById('old'), vi.fn())).toBe(true);
    expect(calls).toEqual([`enter:${MINE_IDS.old}:${MINE_DOOR_IDS.old}`]);
  });
  it('mine to mine exits first, then enters', async () => {
    const { svc, calls } = fakeInteriors(MINE_IDS.shaft);
    expect(await rideTo(svc, stopById('bellows'), vi.fn())).toBe(true);
    expect(calls).toEqual([`exit:${MINE_DOOR_IDS.shaft}`, `enter:${MINE_IDS.bellows}:${MINE_DOOR_IDS.bellows}`]);
    expect(svc.current).toBe(MINE_IDS.bellows);
  });
  it('riding up is just exit', async () => {
    const { svc, calls } = fakeInteriors(MINE_IDS.lower);
    expect(await rideTo(svc, stopById('surface'), vi.fn())).toBe(true);
    expect(calls).toEqual([`exit:${MINE_DOOR_IDS.lower}`]);
    expect(svc.current).toBeNull();
  });
  it('a refused exit leaves the player in the mine and never enters', async () => {
    const { svc, calls } = fakeInteriors(MINE_IDS.old, { exit: 'aggro' });
    const refused = vi.fn();
    expect(await rideTo(svc, stopById('lower'), refused)).toBe(false);
    expect(calls).toEqual([`exit:${MINE_DOOR_IDS.old}`]);
    expect(svc.current).toBe(MINE_IDS.old);
    expect(refused).toHaveBeenCalledOnce();
  });
  it('a refused enter from the surface changes nothing', async () => {
    const { svc } = fakeInteriors(null, { enter: 'locked' });
    const refused = vi.fn();
    expect(await rideTo(svc, stopById('shaft'), refused)).toBe(false);
    expect(svc.current).toBeNull();
    expect((refused.mock.calls[0][0] as InteriorError).reason).toBe('locked');
  });
  it('refuses a mine-to-mine ride under aggro before it exits, so nobody is left on the surface', async () => {
    const { svc, calls } = fakeInteriors(MINE_IDS.old);
    const refused = vi.fn();
    expect(await rideTo({ ...svc, hostileAggro: () => true } as never, stopById('lower'), refused)).toBe(false);
    expect(calls).toEqual([]);
    expect((refused.mock.calls[0][0] as InteriorError).reason).toBe('aggro');
  });
  it('mine to mine is a single transfer when the service offers one, never an exit or enter', async () => {
    const { svc, calls } = fakeInteriors(MINE_IDS.shaft, {}, true);
    expect(await rideTo(svc, stopById('bellows'), vi.fn())).toBe(true);
    expect(calls).toEqual([`transfer:${MINE_IDS.bellows}:${MINE_DOOR_IDS.bellows}`]);
    expect(svc.current).toBe(MINE_IDS.bellows);
  });
  it('with transfer available, riding up is still a plain exit and the surface ride down is still an enter', async () => {
    const up = fakeInteriors(MINE_IDS.lower, {}, true);
    expect(await rideTo(up.svc, stopById('surface'), vi.fn())).toBe(true);
    expect(up.calls).toEqual([`exit:${MINE_DOOR_IDS.lower}`]);
    const down = fakeInteriors(null, {}, true);
    expect(await rideTo(down.svc, stopById('old'), vi.fn())).toBe(true);
    expect(down.calls).toEqual([`enter:${MINE_IDS.old}:${MINE_DOOR_IDS.old}`]);
  });
  it('a refused transfer is reported and leaves the player in the mine', async () => {
    const { svc } = fakeInteriors(MINE_IDS.old, { transfer: 'locked' }, true);
    const refused = vi.fn();
    expect(await rideTo(svc, stopById('lower'), refused)).toBe(false);
    expect(svc.current).toBe(MINE_IDS.old);
    expect((refused.mock.calls[0][0] as InteriorError).reason).toBe('locked');
  });
  it('aggro refuses mine-to-mine and surface-to-mine rides but not a ride up the shaft', async () => {
    const aggro = () => true;
    const mm = fakeInteriors(MINE_IDS.old, {}, true);
    const r1 = vi.fn();
    expect(await rideTo({ ...mm.svc, hostileAggro: aggro } as never, stopById('lower'), r1)).toBe(false);
    expect((r1.mock.calls[0][0] as InteriorError).reason).toBe('aggro');
    const sm = fakeInteriors(null, {}, true);
    const r2 = vi.fn();
    expect(await rideTo({ ...sm.svc, hostileAggro: aggro } as never, stopById('old'), r2)).toBe(false);
    expect((r2.mock.calls[0][0] as InteriorError).reason).toBe('aggro');
    expect([...mm.calls, ...sm.calls]).toEqual([]);
    const up = fakeInteriors(MINE_IDS.old, {}, true);
    const r3 = vi.fn();
    expect(await rideTo({ ...up.svc, hostileAggro: aggro } as never, stopById('surface'), r3)).toBe(true);
    expect(up.calls).toEqual([`exit:${MINE_DOOR_IDS.old}`]);
    expect(r3).not.toHaveBeenCalled();
  });
  it('refuses while a transition runs, and to the stop it is at', async () => {
    const { svc, calls } = fakeInteriors(MINE_IDS.old);
    const refused = vi.fn();
    svc.transitioning = true;
    expect(await rideTo(svc, stopById('lower'), refused)).toBe(false);
    svc.transitioning = false;
    expect(await rideTo(svc, stopById('old'), refused)).toBe(false);
    expect(calls).toEqual([]);
    expect(refused).toHaveBeenCalledOnce();
  });
});

describe('registerLift', () => {
  it('registers the surface interactable now and each mine call point as its anchor appears', () => {
    const { fc, off } = setup();
    expect([...fc.interactables.keys()]).toEqual([]);
    anchor(fc, SURFACE_LIFT_ANCHOR);
    fc.tick('rules');
    expect([...fc.interactables.keys()]).toEqual(['use:lift']);
    anchor(fc, `${MINE_LANDINGS.old}.call`);
    anchor(fc, `${MINE_LANDINGS.deepdelve}.call`);
    fc.tick('rules');
    expect([...fc.interactables.keys()].sort()).toEqual(['use:lift', 'use:lift-deepdelve', 'use:lift-old']);
    off();
    expect(fc.interactables.size).toBe(0);
  });

  it('a dead lift prompts that it is dead and does nothing', () => {
    const { fc, menus, calls } = setup();
    anchor(fc, SURFACE_LIFT_ANCHOR);
    fc.tick('rules');
    const it = fc.interactables.get('use:lift')!;
    expect(it.promptKey).toBe('oldsmoke.lift.dead');
    it.onInteract({} as never);
    expect(menus).toHaveLength(0);
    expect(calls).toEqual([]);
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    expect(it.promptKey).toBe('oldsmoke.lift.use');
  });

  it('the lock reason follows the mended flag: the winch text only while the winch is broken', () => {
    const { fc, menus } = setup();
    anchor(fc, SURFACE_LIFT_ANCHOR);
    fc.tick('rules');
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    // Mended, but no errand takes him down yet: shaft and old stay locked, and neither says the winch needs mending.
    fc.interactables.get('use:lift')!.onInteract({} as never);
    const reasons = Object.fromEntries((menus[0].rows as unknown as Array<{ id: string; reason?: string }>).map((r) => [r.id, r.reason]));
    expect(reasons.old).toBe(LIFT_STRINGS_EN['oldsmoke.lift.locked.old.mended']);
    expect(reasons.shaft).toBe(LIFT_STRINGS_EN['oldsmoke.lift.locked.shaft.mended']);
    for (const r of Object.values(reasons)) expect(r).not.toMatch(/winch|dead|mend/);
  });

  it('opens a picker without the current stop, locked stops marked, and rides on a choice', async () => {
    const { fc, menus, calls } = setup();
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    fc.ctx.state.setFlag('story.m17.started', true);
    fc.ctx.state.setFlag('story.r08.started', true);
    anchor(fc, SURFACE_LIFT_ANCHOR);
    fc.tick('rules');
    fc.interactables.get('use:lift')!.onInteract({} as never);
    expect(menus).toHaveLength(1);
    expect(menus[0].rows.map((r) => [r.id, r.locked])).toEqual([['shaft', false], ['old', false], ['lower', true], ['bellows', true], ['deepdelve', true]]);
    menus[0].choose('old');
    await flush();
    expect(calls).toEqual([`enter:${MINE_IDS.old}:${MINE_DOOR_IDS.old}`]);
  });

  it('a locked choice rides nowhere', async () => {
    const { fc, menus, calls } = setup();
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    anchor(fc, SURFACE_LIFT_ANCHOR);
    fc.tick('rules');
    fc.interactables.get('use:lift')!.onInteract({} as never);
    menus[0].choose('deepdelve');
    await flush();
    expect(calls).toEqual([]);
  });

  it('from inside a mine the picker offers the surface and the other stops, and rides exit then enter', async () => {
    const { fc, menus, calls } = setup({ current: MINE_IDS.shaft });
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    fc.ctx.state.setFlag('story.r08.started', true);
    anchor(fc, `${MINE_LANDINGS.shaft}.call`);
    fc.tick('rules');
    fc.interactables.get('use:lift-shaft')!.onInteract({} as never);
    expect(menus[0].rows.map((r) => r.id)).toEqual(['surface', 'old', 'lower', 'bellows', 'deepdelve']);
    menus[0].choose('old');
    await flush();
    expect(calls).toEqual([`exit:${MINE_DOOR_IDS.shaft}`, `enter:${MINE_IDS.old}:${MINE_DOOR_IDS.old}`]);
  });

  it('a load inside a mine needs no lift state: the next pick starts from the interior the service reports', async () => {
    const { fc, menus, calls, svc } = setup({ current: null });
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    anchor(fc, `${MINE_LANDINGS.lower}.call`);
    svc.current = MINE_IDS.lower; // what save.loaded leaves behind
    fc.fire('save.loaded');
    fc.tick('rules');
    fc.interactables.get('use:lift-lower')!.onInteract({} as never);
    expect(menus[0].rows.map((r) => r.id)).not.toContain('lower');
    menus[0].choose('surface');
    await flush();
    expect(calls).toEqual([`exit:${MINE_DOOR_IDS.lower}`]);
  });

  it('shows the open cage only while the lift is armed, on flag change and on load', () => {
    const { fc, off } = setup();
    const cage = () => fc.scene.getObjectByName('lift-cage') as THREE.Object3D;
    expect(cage().visible).toBe(false);
    fc.ctx.state.setFlag(LIFT_ARMED_FLAG, true);
    expect(cage().visible).toBe(true);
    fc.flags.delete(LIFT_ARMED_FLAG);
    fc.fire('save.loaded');
    expect(cage().visible).toBe(false);
    fc.flags.set(LIFT_ARMED_FLAG, true);
    fc.fire('save.loaded');
    expect(cage().visible).toBe(true);
    off();
    expect(fc.scene.getObjectByName('lift-cage')).toBeUndefined();
  });
});
