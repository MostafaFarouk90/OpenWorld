// The director's named behaviours on the rig (director/rig.testkit.ts): the R16 door, the M28 crag view, R15's carry resets,
// R17's light gate and R18's eggs, parents, failure and load.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, clearGroups, haulSled } from './director/autoplay.testkit';
import { M28_VIEW_TICKS, R15_HAUL_OUT, R15_STOOP_GROUPS, routeById } from './director/climb';
import { R18_PARENTS_GROUP } from './director/eggs';
import { R17_LEG_ROUTES, nextShrine } from './director/candles';
import { groupKindsMissing } from './director/generic';
import { DRAGONSPINE_QUEST_STRINGS } from './strings';
import { M28_CRAG_DOWN, M28_VIEW } from './m28.quest';
import { R15_HAULING, R15_HAUL_ID, R15_SLEDS, R15_SLED_FLAGS } from './r15.quest';
import { R16_ROCKFALL_CLEARED_FLAG, R16_STARTED_FLAG } from './r16.quest';
import { R17_BUNDLE_ITEM, R17_BUNDLE_LYING, R17_HELD, R17_TAKEN, r17LitFlag } from './r17.quest';
import {
  R18_EGGS_SET, R18_EGG_ITEM, R18_EGG_PROPS, R18_EGG_TAKEN, R18_FAIL_TOAST, R18_HOLDING, R18_NESTED, R18_NEST_FLAGS, R18_NEST_PROPS, R18_PARENTS_TAG,
} from './r18.quest';

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const fresh = (o: Parameters<typeof makeRig>[0] = {}): Rig => (rig = makeRig({ flags: { 'story.gate.a3': true }, ...o }));
const upTo = (r: Rig, quests: string[], q: string, at: string): void => {
  autoplayAll(r, quests);
  r.manager.start(q);
  autoplay(r, q, { stopAt: [q, at] });
  r.step(2);
};
const SPINE = ['m28', 'r15', 'm29', 'r16', 'm30', 'r17'];

describe('R16: the cave door and its rockfall are re-derived on a load', () => {
  it('accepting R16 opens the door gate; the rockfall flag is the interact prop\'s', () => {
    const r = fresh();
    autoplayAll(r, ['m28', 'm29']);
    let open = false;
    r.gates.flag(R16_STARTED_FLAG, (o) => { open = o; });
    expect(open).toBe(false);
    r.manager.start('r16');
    expect(r.flag(R16_STARTED_FLAG)).toBe(true);
    expect(open).toBe(true);
  });

  it('a save loaded with the quest active but the door state lost writes the flag again, and the gate opens', () => {
    const r = fresh();
    autoplayAll(r, ['m28', 'm29']);
    r.manager.start('r16');
    r.state.clearFlag(R16_STARTED_FLAG); // the door's flag is lost from the save
    const snap = r.snapshot();
    let open = true;
    r.gates.flag(R16_STARTED_FLAG, (o) => { open = o; });
    expect(open).toBe(false);
    r.restore(snap);
    expect(r.flag(R16_STARTED_FLAG)).toBe(true);
    expect(open).toBe(true);
  });

  it('a save loaded with story.r16.started kept the door open, and a finished R16 keeps it open too', () => {
    const r = fresh();
    autoplayAll(r, ['m28', 'm29', 'r16']);
    r.state.clearFlag(R16_STARTED_FLAG);
    r.saveLoad();
    expect(r.flag(R16_STARTED_FLAG)).toBe(true);
    // a world where the flag is present at load: the gate's own load pass reads it
    const b = makeRig({ flags: { 'story.gate.a3': true } });
    b.state.setFlag(R16_STARTED_FLAG, true);
    let open = false;
    b.gates.flag(R16_STARTED_FLAG, (o) => { open = o; });
    expect(open).toBe(true);
    b.dispose();
  });

  it('an unstarted R16 never writes the door flag on a load', () => {
    const r = fresh();
    autoplayAll(r, ['m28', 'm29']);
    r.saveLoad();
    expect(r.flag(R16_STARTED_FLAG)).toBe(false);
  });

  it('the rockfall prop sets the blocker flag K4 reads, only once the passage has been searched', () => {
    const r = fresh();
    upTo(r, ['m28', 'm29'], 'r16', 'passage');
    expect(r.use('use:r16-rockfall')).toBe(false);
    expect(r.flag(R16_ROCKFALL_CLEARED_FLAG)).toBe(false);
    autoplay(r, 'r16', { stopAt: ['r16', 'rockfall'] });
    expect(r.use('use:r16-rockfall')).toBe(true);
    expect(r.flag(R16_ROCKFALL_CLEARED_FLAG)).toBe(true);
    expect(r.toasts).toContain('dragonspine.q.r16.rockfall');
    r.saveLoad();
    expect(r.flag(R16_ROCKFALL_CLEARED_FLAG)).toBe(true);
  });
});

describe('M28: the crag view comes only after the group is cleared', () => {
  const toView = (): Rig => {
    const r = fresh({ kindsDefined: true });
    r.manager.start('m28');
    autoplay(r, 'm28', { stopAt: ['m28', 'crag'] });
    r.at('dragonspine.m28.crag');
    r.step(2);
    return r;
  };

  it('does not fire while any member stands, and does fire after the last is gone', () => {
    const r = toView();
    expect(r.flag('story.m28.cragOut')).toBe(true);
    r.standing.set('dragonspine.q.m28.crag', ['h1', 'h2', 'ogre']);
    r.step(40);
    expect(r.current('m28', 'crag')).toBe(true);
    r.standing.set('dragonspine.q.m28.crag', ['ogre']);
    r.step(40);
    expect(r.flag(M28_CRAG_DOWN)).toBe(false);
    expect(r.camera.shots).toHaveLength(0);
    r.standing.set('dragonspine.q.m28.crag', []);
    r.step(40);
    expect(r.flag(M28_CRAG_DOWN)).toBe(true);
    expect(r.current('m28', 'view')).toBe(true);
    r.step(40);
    expect(r.camera.shots).toHaveLength(1);
    expect(r.flag(M28_VIEW)).toBe(false);
    r.step(M28_VIEW_TICKS + 10);
    expect(r.camera.released).toBe(1);
    expect(r.flag(M28_VIEW)).toBe(true);
    expect(r.done('m28', 'view')).toBe(true);
  });

  it('never mid-fight: a member standing at the poll holds the view back, however the flag came', () => {
    const r = toView();
    r.standing.set('dragonspine.q.m28.crag', ['late-arrival']);
    r.state.setFlag(M28_CRAG_DOWN, true); // the step is credited (a flag the group row wrote earlier, then a straggler came back)
    r.manager.recheck();
    expect(r.current('m28', 'view')).toBe(true);
    r.step(120);
    expect(r.camera.shots).toHaveLength(0);
    expect(r.flag(M28_VIEW)).toBe(false);
    r.standing.set('dragonspine.q.m28.crag', []);
    r.step(60);
    expect(r.camera.shots).toHaveLength(1);
  });

  it('waits for the player to be at the crag, and a load during the hold releases the camera and offers it again', () => {
    const r = toView();
    r.at('dragonspine.m28.trailhead');
    clearGroups(r, ['dragonspine.q.m28.crag']);
    r.step(60);
    expect(r.camera.shots).toHaveLength(0);
    r.at('dragonspine.m28.crag');
    r.step(40);
    expect(r.camera.shots).toHaveLength(1);
    r.saveLoad();
    expect(r.camera.released).toBe(1);
    expect(r.flag(M28_VIEW)).toBe(false);
    r.step(M28_VIEW_TICKS + 10);
    expect(r.camera.shots.length).toBeGreaterThanOrEqual(1);
    r.step(M28_VIEW_TICKS + 10);
    expect(r.flag(M28_VIEW)).toBe(true);
  });
});

describe('missing enemy kinds (K6b PR 2 not merged): a group is read as seen and gone, so the quests finish', () => {
  it('kinds missing for every group of the four rows; defined kinds are not', () => {
    expect(groupKindsMissing(['dragonspine.q.m28.crag'])).toBe(true);
    expect(groupKindsMissing(['dragonspine.q.m28.crag'], { 'rime-hawk': {}, 'crag-ogre': {} })).toBe(false);
    expect(groupKindsMissing(['dragonspine.q.m28.scout'], { 'hunter-spearman': {} })).toBe(false); // the shipped spearman is defined
    expect(groupKindsMissing(['nope'])).toBe(false);
  });

  it('with the kinds defined, nothing is credited until a member has been seen standing and is gone', () => {
    const r = fresh({ kindsDefined: true });
    upTo(r, ['m28', 'r15'], 'm29', 'hawks');
    r.step(200);
    expect(r.flag('story.m29.hawksDown')).toBe(false);
    clearGroups(r, ['dragonspine.q.m29.hawks']);
    expect(r.flag('story.m29.hawksDown')).toBe(true);
  });

  it('with the kinds missing it is credited a moment after the arm', () => {
    const r = fresh();
    upTo(r, ['m28', 'r15'], 'm29', 'hawks');
    r.step(80);
    expect(r.flag('story.m29.hawksDown')).toBe(true);
  });
});

describe('R15: sled hauls, the stoops and every carry reset', () => {
  const toHauls = (): Rig => {
    const r = fresh();
    upTo(r, ['m28'], 'r15', 'hauls');
    return r;
  };

  it('the three sleds stand while R15 is active; taking one starts the stoops; delivering at the cache credits the haul', () => {
    const r = toHauls();
    expect(r.sleds.ids().sort()).toEqual([...R15_SLEDS]);
    const route = routeById(R15_SLEDS[0])!;
    r.player.feet = { ...route.checkpoints[0]! };
    expect(r.sleds.take(R15_SLEDS[0])).toBe(true);
    expect(r.flag(R15_HAULING)).toBe(true);
    expect(r.str(R15_HAUL_ID)).toBe(R15_SLEDS[0]);
    expect(r.flag(R15_HAUL_OUT)).toBe(true);
    r.sleds.drop();
    r.step(2);
    expect(r.flag(R15_HAULING)).toBe(false);
    haulSled(r, 1);
    expect(r.flag(R15_SLED_FLAGS[0])).toBe(true);
  });

  it('three deliveries finish the step, remove the sleds, clear the haul and stand the hawks down', () => {
    const r = toHauls();
    [1, 2, 3].forEach((n) => haulSled(r, n));
    r.step(300);
    expect(R15_SLED_FLAGS.every((f) => r.flag(f))).toBe(true);
    expect(r.done('r15', 'hauls')).toBe(true);
    expect(r.toasts.filter((t) => t === 'dragonspine.q.r15.delivered')).toHaveLength(3);
    expect(r.sleds.ids()).toEqual([]);
    expect(r.flag(R15_HAULING)).toBe(false);
    expect(r.str(R15_HAUL_ID)).toBe('');
    expect(r.flag(R15_HAUL_OUT)).toBe(false);
    for (const g of R15_STOOP_GROUPS) expect(r.enemyCalls).toContain(`reset ${g}`);
  });

  it('a sled dropped away from the cache is not delivered and can be taken again', () => {
    const r = toHauls();
    const route = routeById(R15_SLEDS[1])!;
    r.player.feet = { ...route.checkpoints[0]! };
    r.sleds.take(R15_SLEDS[1]);
    r.player.feet = { ...route.checkpoints[Math.floor(route.checkpoints.length / 2)]! };
    r.sleds.fixedUpdate();
    r.sleds.drop();
    r.step(2);
    expect(r.flag(R15_SLED_FLAGS[1])).toBe(false);
    expect(r.flag(R15_HAULING)).toBe(false);
    expect(r.str(R15_HAUL_ID)).toBe(R15_SLEDS[1]); // still out: "reset haul" can send it back
    haulSled(r, 2);
    expect(r.flag(R15_SLED_FLAGS[1])).toBe(true);
  });

  type Reason = 'offRoute' | 'tooLow' | 'deepWater' | 'closed' | 'asked' | 'travel';
  const CAUSE: Record<Reason, (r: Rig) => void> = {
    offRoute: (r) => { r.player.feet = { x: r.player.feet.x + 400, y: r.player.feet.y, z: r.player.feet.z + 400 }; },
    tooLow: (r) => { r.env.drop = 40; },
    deepWater: (r) => { r.env.deep = true; },
    closed: (r) => { r.env.open = false; },
    asked: (r) => { r.carry.reset(r.str(R15_HAUL_ID)); },
    travel: (r) => { r.resets.onTravel(); },
  };
  it.each(Object.keys(CAUSE) as Reason[])('reset reason %s: the sled goes back, the hawks stand down, and the quest still finishes', (reason) => {
    const r = toHauls();
    const reasons: string[] = [];
    r.events.on('carry.reset' as never, ((e: { id: string; reason: string }) => void (e.id === R15_SLEDS[0] && reasons.push(e.reason))) as never);
    const route = routeById(R15_SLEDS[0])!;
    r.player.feet = { ...route.checkpoints[0]! };
    r.sleds.take(R15_SLEDS[0]);
    r.player.feet = { ...route.checkpoints[2]! };
    r.carrySeconds(1);
    CAUSE[reason](r);
    // K7 checks every half second and fades; run until the reset has happened, then lift the cause
    for (let i = 0; i < 300 && reasons.length === 0; i++) r.carrySeconds(1 / 60);
    r.env.deep = false; r.env.open = true; r.env.drop = 0;
    r.carrySeconds(2);
    expect(reasons).toEqual([reason]);
    expect(r.sleds.held).toBeNull();
    expect(r.flag(R15_HAULING)).toBe(false);
    expect(r.done('r15', 'hauls')).toBe(false);
    r.step(240);
    for (const g of R15_STOOP_GROUPS) expect(r.enemyCalls).toContain(`reset ${g}`);
    [1, 2, 3].forEach((n) => haulSled(r, n));
    expect(r.done('r15', 'hauls')).toBe(true);
    autoplay(r, 'r15');
    expect(r.qs('r15')).toBe('completed');
  });

  it('"reset haul" mid-haul (Thorgar\'s dialogue event) sends the sled out back to its last reset point; the haul goes on', () => {
    const r = toHauls();
    const route = routeById(R15_SLEDS[2])!;
    r.player.feet = { ...route.checkpoints[0]! };
    r.sleds.take(R15_SLEDS[2]);
    r.player.feet = { ...route.checkpoints[3]! };
    r.carrySeconds(1);
    r.emit('npc.carry.resetHaul', { id: r.str(R15_HAUL_ID) });
    r.carrySeconds(1);
    expect(r.sleds.held).toBeNull();
    const at = r.sleds.position(R15_SLEDS[2])!;
    const back = r.carry.checkpoint(R15_SLEDS[2])!;
    expect(Math.hypot(at.x - back.x, at.z - back.z)).toBeLessThan(0.01);
    expect(r.flag(R15_HAULING)).toBe(false);
    haulSled(r, 3);
    expect(r.flag(R15_SLED_FLAGS[2])).toBe(true);
  });

  it('a load mid-haul puts nothing in hand: the hawks stand down and the haul id clears; the sleds stand where they lay', () => {
    const r = toHauls();
    const route = routeById(R15_SLEDS[0])!;
    r.player.feet = { ...route.checkpoints[0]! };
    r.sleds.take(R15_SLEDS[0]);
    r.player.feet = { ...route.checkpoints[2]! };
    r.carrySeconds(1);
    r.saveLoad();
    expect(r.flag(R15_HAULING)).toBe(false);
    expect(r.str(R15_HAUL_ID)).toBe('');
    expect(r.sleds.ids().sort()).toEqual([...R15_SLEDS]);
    [1, 2, 3].forEach((n) => haulSled(r, n));
    expect(r.done('r15', 'hauls')).toBe(true);
  });
});

describe('R17: the candle bundle, the light gate and a reset between shrines', () => {
  const toCandles = (): Rig => {
    const r = fresh();
    upTo(r, SPINE.slice(0, 5), 'r17', 'take');
    return r;
  };
  const lying = (r: Rig) => {
    const out = { x: 0, y: 0, z: 0 };
    r.registered.get(R17_BUNDLE_LYING)!.position(out);
    return out;
  };

  it('no shrine lights without the bundle; the first pick-up is the quest prop\'s; only the next shrine on the road lights', () => {
    const r = toCandles();
    r.manager.recheck();
    expect(r.wayside.light(3)).toBe(false);
    expect(r.use('use:r17-bundle')).toBe(true);
    expect(r.flag(R17_TAKEN)).toBe(true);
    expect(r.flag(R17_HELD)).toBe(true);
    expect(r.inventory.has(R17_BUNDLE_ITEM)).toBe(true);
    expect(r.resets.isTracked(R17_LEG_ROUTES.down)).toBe(true);
    expect(r.wayside.light(2)).toBe(false);
    expect(r.wayside.light(4)).toBe(false);
    expect(r.wayside.light(3)).toBe(true);
    expect(nextShrine((n) => r.flag(r17LitFlag(n)))).toBe(2);
  });

  it('every carry reset reason puts the bundle down at the last shrine passed, takes it from the hands, and the quest goes on', () => {
    const r = toCandles();
    r.use('use:r17-bundle');
    r.at('dragonspine.wayside.3');
    r.carrySeconds(1);
    expect(r.wayside.light(3)).toBe(true);
    const checkpoint = r.carry.checkpoint(R17_LEG_ROUTES.down)!;
    r.player.feet = { x: checkpoint.x + 5, y: checkpoint.y, z: checkpoint.z + 700 }; // far off the road
    r.carrySeconds(2);
    expect(r.flag(R17_HELD)).toBe(false);
    expect(r.inventory.has(R17_BUNDLE_ITEM)).toBe(false);
    expect(r.toasts).toContain('dragonspine.q.r17.lost');
    const at = lying(r);
    expect(Math.hypot(at.x - checkpoint.x, at.z - checkpoint.z)).toBeLessThan(0.01);
    // while it lies, nothing lights
    r.at('dragonspine.wayside.2');
    expect(r.wayside.light(2)).toBe(false);
    // the lying bundle is picked up again at the shrine it went back to
    const prop = r.registered.get(R17_BUNDLE_LYING)!;
    expect(prop.enabled()).toBe(true);
    prop.onInteract();
    expect(r.flag(R17_HELD)).toBe(true);
    expect(r.inventory.has(R17_BUNDLE_ITEM)).toBe(true);
    expect(prop.enabled()).toBe(false);
    expect(r.wayside.light(2)).toBe(true);
  });

  it('shrine 1 switches the bundle to the up route with the toast; the whole road lights in order and the quest finishes', () => {
    const r = toCandles();
    r.use('use:r17-bundle');
    for (const n of [3, 2, 1]) { r.at(`dragonspine.wayside.${n}`); expect(r.wayside.light(n)).toBe(true); r.step(2); }
    expect(r.toasts).toContain('dragonspine.q.r17.switch');
    expect(r.resets.isTracked(R17_LEG_ROUTES.down)).toBe(false);
    expect(r.resets.isTracked(R17_LEG_ROUTES.up)).toBe(true);
    for (const n of [4, 5, 6]) { r.at(`dragonspine.wayside.${n}`); expect(r.wayside.light(n)).toBe(true); r.step(2); }
    expect(r.resets.isTracked(R17_LEG_ROUTES.up)).toBe(true);
    autoplay(r, 'r17');
    expect(r.qs('r17')).toBe('completed');
    expect(r.flag(R17_HELD)).toBe(false);
    expect(r.inventory.has(R17_BUNDLE_ITEM)).toBe(false);
    expect(r.resets.isTracked(R17_LEG_ROUTES.up)).toBe(false);
  });

  it('travelling away with the bundle in hand puts it down; a load puts it back in the hands', () => {
    const r = toCandles();
    r.use('use:r17-bundle');
    r.at('dragonspine.wayside.3');
    r.carrySeconds(1);
    r.resets.onTravel();
    expect(r.flag(R17_HELD)).toBe(false);
    expect(r.registered.get(R17_BUNDLE_LYING)!.enabled()).toBe(true);
    r.saveLoad();
    expect(r.flag(R17_HELD)).toBe(true);
    expect(r.inventory.has(R17_BUNDLE_ITEM)).toBe(true);
    expect(r.registered.get(R17_BUNDLE_LYING)!.enabled()).toBe(false);
    expect(r.wayside.light(3)).toBe(true);
  });

  it('the hawks of the second shrine down and the second shrine up are armed by those steps, not before', () => {
    const r = toCandles();
    expect(r.flag('story.r17.hawksA')).toBe(false);
    r.use('use:r17-bundle');
    r.at('dragonspine.wayside.3'); r.wayside.light(3); r.step(5);
    expect(r.flag('story.r17.hawksA')).toBe(true);
    expect(r.flag('story.r17.hawksB')).toBe(false);
  });
});

describe('R18: the eggs, the parents, the failure and the load', () => {
  const toNest = (): Rig => {
    const r = fresh();
    upTo(r, ['m28'], 'r18', 'nested');
    r.step(40);
    return r;
  };
  const setEgg = (r: Rig, egg: number, nest: number): void => {
    expect(r.use(R18_EGG_PROPS[egg])).toBe(true);
    expect(r.use(R18_NEST_PROPS[nest])).toBe(true);
  };

  it('the parents are spawned when the step is current and despawned when it is done', () => {
    const r = toNest();
    expect(r.enemyCalls).toContain(`spawn ${R18_PARENTS_GROUP}`);
    expect(r.enemyCalls.filter((c) => c === `spawn ${R18_PARENTS_GROUP}`)).toHaveLength(1);
    [0, 1, 2].forEach((i) => setEgg(r, i, i));
    r.step(40);
    expect(r.flag(R18_NESTED)).toBe(true);
    expect(r.enemyCalls).toContain(`despawn ${R18_PARENTS_GROUP}`);
    expect(r.toasts.filter((t) => /r18\.set/.test(t))).toEqual(['dragonspine.q.r18.set1', 'dragonspine.q.r18.set2', 'dragonspine.q.r18.set3']);
  });

  it('one egg at a time, any egg into any place, in any order', () => {
    const r = toNest();
    expect(r.use(R18_NEST_PROPS[0])).toBe(false); // nothing in hand
    expect(r.use(R18_EGG_PROPS[1])).toBe(true);
    expect(r.use(R18_EGG_PROPS[0])).toBe(false); // an egg is in hand already
    expect(r.use(R18_NEST_PROPS[2])).toBe(true);
    expect(r.use(R18_NEST_PROPS[2])).toBe(false);
    expect(r.num(R18_EGGS_SET)).toBe(1);
    expect(r.flag(R18_HOLDING)).toBe(false);
    expect(r.inventory.has(R18_EGG_ITEM)).toBe(false);
    setEgg(r, 2, 0);
    setEgg(r, 0, 1);
    expect(r.num(R18_EGGS_SET)).toBe(3);
    r.step(5);
    autoplay(r, 'r18');
    expect(r.qs('r18')).toBe('completed');
  });

  it('a parent dies: every egg goes back to the camp with the exact toast, the parents are reset, and the step is retried', () => {
    const r = toNest();
    setEgg(r, 0, 0);
    setEgg(r, 1, 1);
    expect(r.use(R18_EGG_PROPS[2])).toBe(true); // the third is in hand
    expect(r.flag(R18_HOLDING)).toBe(true);
    r.kill('rime-hawk', R18_PARENTS_TAG);
    r.step(5);
    expect(r.toasts).toContain(R18_FAIL_TOAST);
    expect(DRAGONSPINE_QUEST_STRINGS[R18_FAIL_TOAST === 'r18.failed' ? 'dragonspine.q.r18.failed' : R18_FAIL_TOAST]).toBe('The parents took the eggs back to the camp.');
    expect(r.num(R18_EGGS_SET)).toBe(0);
    expect(R18_NEST_FLAGS.some((f) => r.flag(f))).toBe(false);
    expect(R18_EGG_TAKEN.some((f) => r.flag(f))).toBe(false);
    expect(r.flag(R18_HOLDING)).toBe(false);
    expect(r.inventory.count(R18_EGG_ITEM)).toBe(0);
    expect(r.enemyCalls).toContain(`reset ${R18_PARENTS_GROUP}`);
    expect(r.current('r18', 'nested')).toBe(true);
    // the retry: three eggs again, then the quest completes
    r.step(40);
    expect(r.enemyCalls.filter((c) => c === `spawn ${R18_PARENTS_GROUP}`).length).toBeGreaterThanOrEqual(2);
    [0, 1, 2].forEach((i) => setEgg(r, i, i));
    r.step(5);
    expect(r.flag(R18_NESTED)).toBe(true);
    autoplay(r, 'r18');
    expect(r.qs('r18')).toBe('completed');
  });

  it('the toast key resolves to the exact text', () => {
    expect(DRAGONSPINE_QUEST_STRINGS['dragonspine.q.r18.failed']).toBe('The parents took the eggs back to the camp.');
  });

  it('out of order: a parent dying before the step is current, or after it is done, changes nothing', () => {
    const r = fresh();
    upTo(r, ['m28'], 'r18', 'thief');
    r.kill('rime-hawk', R18_PARENTS_TAG);
    r.step(5);
    expect(r.toasts).not.toContain(R18_FAIL_TOAST);
    autoplay(r, 'r18', { stopAt: ['r18', 'report'] });
    r.kill('rime-hawk', R18_PARENTS_TAG);
    r.step(5);
    expect(r.toasts).not.toContain(R18_FAIL_TOAST);
    expect(r.flag(R18_NESTED)).toBe(true);
    autoplay(r, 'r18');
    expect(r.qs('r18')).toBe('completed');
  });

  it('out of order: eggs fetched and nest places used before the step are refused (the props are not live)', () => {
    const r = fresh();
    upTo(r, ['m28'], 'r18', 'brief');
    expect(r.use(R18_EGG_PROPS[0])).toBe(false);
    expect(r.use(R18_NEST_PROPS[0])).toBe(false);
    expect(r.flag(R18_HOLDING)).toBe(false);
    expect(r.enemyCalls).not.toContain(`spawn ${R18_PARENTS_GROUP}`);
    autoplay(r, 'r18');
    expect(r.qs('r18')).toBe('completed');
  });

  it('a carry reset sends the egg in hand back to the camp (each reason), and the other eggs stay where they are', () => {
    const r = toNest();
    setEgg(r, 0, 0);
    r.use(R18_EGG_PROPS[1]);
    expect(r.resets.isTracked('egg.r18.2')).toBe(true);
    r.at('dragonspine.hawk.camp');
    r.carrySeconds(1);
    r.carry.reset('egg.r18.2');
    r.carrySeconds(2);
    expect(r.flag(R18_HOLDING)).toBe(false);
    expect(r.inventory.count(R18_EGG_ITEM)).toBe(0);
    expect(r.flag(R18_EGG_TAKEN[1])).toBe(false);
    expect(r.flag(R18_NEST_FLAGS[0])).toBe(true);
    expect(r.flag(R18_EGG_TAKEN[0])).toBe(true);
    expect(r.toasts).toContain('dragonspine.q.r18.back');
    expect(r.resets.isTracked('egg.r18.2')).toBe(false);
    // and a fast travel does the same
    r.use(R18_EGG_PROPS[1]);
    r.resets.onTravel();
    expect(r.flag(R18_HOLDING)).toBe(false);
    [1, 2].forEach((i) => setEgg(r, i, i));
    expect(r.flag(R18_NESTED)).toBe(true);
  });

  it('a load with an egg in hand puts it back in the camp; set eggs stay set; the parents are spawned again', () => {
    const r = toNest();
    setEgg(r, 0, 0);
    r.use(R18_EGG_PROPS[1]);
    r.saveLoad();
    r.step(40);
    expect(r.flag(R18_HOLDING)).toBe(false);
    expect(r.inventory.count(R18_EGG_ITEM)).toBe(0);
    expect(r.flag(R18_NEST_FLAGS[0])).toBe(true);
    expect(r.flag(R18_EGG_TAKEN[1])).toBe(false);
    expect(r.enemyCalls.filter((c) => c === `spawn ${R18_PARENTS_GROUP}`).length).toBeGreaterThanOrEqual(2);
    [1, 2].forEach((i) => setEgg(r, i, i));
    expect(r.flag(R18_NESTED)).toBe(true);
  });
});
