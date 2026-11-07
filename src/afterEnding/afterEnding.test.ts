// Act 5 N13 (plans/act5-N13.md): the world after the ending at unit level. The flags, the gate holds, the posts going
// home, the waking, the look and the dragons, and that nothing rescales. The booted checks are the two e2e files here.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GameEvents } from '../core/events';
import { FlagGates } from '../state/FlagGates';
import { WorldState } from '../state/WorldState';
import { watchNortheastGate, watchRiverGate, watchSouthGate } from '../harrowmark/gate';
import { withOccupiedAbsent, OCCUPIED_ABSENT } from '../harrowmark/act4/absent';
import { benchPostFor, anvilPost } from '../companions/act4/benchPosts';
import { vendorAnchor } from '../economy/stock';
import { refugeShop, REFUGE_VENDORS } from '../economy/refugePosts.act4';
import { rimShop, RIM_MOVING_VENDORS } from '../economy/rimCamp.act5';
import { DEFAULT_KITS, trainerPlacement, trainerId } from '../classes/kits';
import { POST_RULES } from '../quests/posts';
import { regionChips } from '../map/regionLayer';
import { act5Level, ACT5_CAP_ABOVE_PLAYER, bandForRegion } from '../enemies/level';
import { REGION_IDS } from '../region/regions';
import { stormDarkMix, WASTE_STORM_DARK, ashfallScale, afterEnding, caelDied, endingChoice, AFTER_ENDING_FLAG, CAEL_LIVES_FLAG, M56_CHOICE_FLAG } from './flags';
import { HOME_AFTER_ENDING, KNIGHT_DESK_AFTER, liftsAfterEnding, ROOK_POST_AFTER } from './posts';
import { AfterEnding, WAKE_POINT, WAKE_YAW, wakeLines, type WakeHost } from './wake';
import { AFTER_FLIGHTS, AfterEndingLook, flightLoop, FLIGHT_POINTS, REKINDLE_GRADE, rekindleWeight, stormRegionBoxes } from './look';
import { STORM_EDGE } from '../weather/tuning';
import { engineBox } from '../region/regions';
import { RIM_CAMP } from '../caldera/calderaSites';
import { AFTER_ENDING_STRINGS_EN } from './strings.en';

const map = (o: Record<string, unknown>) => ({ getFlag: (k: string) => o[k] });
const OCC = 'story.m38.complete';
/** Every flag of a finished game up to the ending (the occupation, the refuge, the Rim Camp, the end gate). */
const LATE = { 'story.gate.a4': true, [OCC]: true, 'story.m39.complete': true, 'story.m41.complete': true, 'story.m43.complete': true, 'story.m47.complete': true, 'story.m49.complete': true, 'story.gate.a5': true, 'story.gate.end': true };
const AFTER = (choice: 'rekindle' | 'let-it-die' = 'rekindle', lives: unknown = true) => ({ ...LATE, [AFTER_ENDING_FLAG]: true, [M56_CHOICE_FLAG]: choice, [CAEL_LIVES_FLAG]: lives });

function live() {
  const events = new GameEvents(() => {});
  const state = new WorldState(events, () => {});
  const gates = new FlagGates(state, events, () => {});
  return { events, state, gates };
}

describe('flags', () => {
  it('afterEnding, endingChoice and caelDied read the flags (success)', () => {
    expect(afterEnding(map(AFTER()))).toBe(true);
    expect(endingChoice(map(AFTER('let-it-die')))).toBe('let-it-die');
    expect(caelDied(map(AFTER('rekindle', false)))).toBe(true);
    expect(caelDied(map(AFTER('rekindle', true)))).toBe(false);
  });
  it('before the ending nothing holds, whatever the choice says (failure)', () => {
    expect(afterEnding(map(LATE))).toBe(false);
    expect(endingChoice(map({ ...LATE, [M56_CHOICE_FLAG]: 'rekindle' }))).toBeNull();
    expect(caelDied(map({ ...LATE, [CAEL_LIVES_FLAG]: false }))).toBe(false);
  });
  it('an unset caelLives (an old save) is alive; a bad choice is no choice (edge)', () => {
    expect(caelDied(map(AFTER('rekindle', undefined)))).toBe(false);
    expect(endingChoice(map({ ...AFTER(), [M56_CHOICE_FLAG]: 'both' }))).toBeNull();
    expect(ashfallScale(map(AFTER('rekindle')))).toBe(0);
    expect(ashfallScale(map(AFTER('let-it-die')))).toBe(0.5);
    expect(ashfallScale(map(LATE))).toBe(1);
  });
});

describe('the gates reopen after the ending and re-derive on load', () => {
  const HELD = { closedWhen: OCC, reopenWhen: AFTER_ENDING_FLAG };
  it('the South, River and North-east gates: open before M38, shut while held, open after the ending', () => {
    const { state, gates } = live();
    const south: string[] = [];
    let river = false;
    let ne = false;
    watchSouthGate(gates, (s) => south.push(s), HELD);
    watchRiverGate(gates, (o) => (river = o), HELD);
    watchNortheastGate(gates, (o) => (ne = o), AFTER_ENDING_FLAG);
    for (const k of ['story.m06.started', 'story.m06.route', 'story.gate.a2', 'story.gate.a4']) state.setFlag(k, true);
    expect([south.at(-1), river, ne]).toEqual(['open', true, true]);
    state.setFlag(OCC, true);
    expect([south.at(-1), river, ne]).toEqual(['closed', false, false]);
    state.setFlag(AFTER_ENDING_FLAG, true);
    expect([south.at(-1), river, ne]).toEqual(['open', true, true]);
  });
  it('a load either way re-derives (no flag.changed on load)', () => {
    const { events, state, gates } = live();
    let river: boolean | null = null;
    watchRiverGate(gates, (o) => (river = o), HELD);
    state.load({ flags: { 'story.gate.a2': true, [OCC]: true } });
    events.emit('save.loaded', { slot: 'x' });
    expect(river).toBe(false);
    state.load({ flags: { 'story.gate.a2': true, [OCC]: true, [AFTER_ENDING_FLAG]: true } });
    events.emit('save.loaded', { slot: 'x' });
    expect(river).toBe(true);
  });
  it('without reopenWhen the hold is as shipped (Act 4 unchanged)', () => {
    const { state, gates } = live();
    let river = true;
    watchRiverGate(gates, (o) => (river = o), { closedWhen: OCC });
    state.setFlag('story.gate.a2', true);
    state.setFlag(OCC, true);
    state.setFlag(AFTER_ENDING_FLAG, true);
    expect(river).toBe(false);
  });
});

describe('the townsfolk come home', () => {
  it('each occupied-absent NPC keeps its absent flag and gains the after-ending lift', () => {
    const out = withOccupiedAbsent([{ id: 'aldith', post: 'p' }, { id: 'other', post: 'p' }]);
    expect(out[0]!.absentUnless).toEqual({ [OCC]: AFTER_ENDING_FLAG });
    expect(out[1]!.absentUnless).toBeUndefined();
    expect(OCCUPIED_ABSENT).toContain('whitlock');
  });
  it('benched companions wait at the Tilted Anvil again after the ending (and at the refuge before it)', () => {
    expect(benchPostFor('tobb', map(LATE))).not.toBe(anvilPost('tobb'));
    expect(benchPostFor('tobb', map(AFTER()))).toBe(anvilPost('tobb'));
    expect(benchPostFor('tobb', null)).toBe(anvilPost('tobb'));
  });
  it('the map reads Harrowmark retaken after the ending, held before it', () => {
    const label = (flags: Record<string, unknown>) => regionChips(['brightwater', 'harrowmark'], map(flags)).find((c) => c.id === 'harrowmark')!.labelKey;
    expect(label(LATE)).toBe('map.region.harrowmark.held');
    expect(label(AFTER())).toBe('map.region.harrowmark.retaken');
  });
});

describe('vendors, trainers and talk posts go home', () => {
  it('every moved shop is back at its shipped stall after the ending; at the Rim Camp just before it', () => {
    for (const v of RIM_MOVING_VENDORS) expect(vendorAnchor(v, map(LATE)), v).toBe(rimShop(v));
    for (const v of REFUGE_VENDORS) expect(vendorAnchor(v, map(AFTER())), v).toBe(`shop.${v}`);
    // Wulfhild goes back to the Walker Camp (her Act 4 row), not to a city stall
    expect(vendorAnchor('wulfhild', map(AFTER()))).toBe('waste.walker-camp.shop.wulfhild');
  });
  it('the Caldera keepers and Hild stay (failure path of the lift)', () => {
    expect(vendorAnchor('alric', map(AFTER()))).toBe(rimShop('alric'));
    expect(vendorAnchor('maud-rim', map(AFTER()))).toBe(rimShop('maud'));
    expect(vendorAnchor('hild', map(AFTER()))).toBe('ashgate.shop.hild');
    expect(liftsAfterEnding({ anchor: rimShop('alric'), who: 'alric' })).toBe(false);
    expect(liftsAfterEnding({ anchor: refugeShop('wystan'), who: 'wystan' })).toBe(true);
  });
  it('the trainers are at their Bastion desks, and Rook keeps the Knight desk at Gaut\'s (edge: Gaut is retired)', () => {
    for (const id of ['warden', 'emberwright', 'ashblade', 'pathfinder'] as const) {
      const kit = DEFAULT_KITS[id];
      expect(trainerPlacement(kit, map(AFTER())), id).toMatchObject({ npcId: kit.trainer.npcId, interactableId: trainerId(kit), moved: false });
    }
    expect(trainerPlacement(DEFAULT_KITS.knight, map(AFTER()))).toMatchObject({ npcId: 'rook', interactableId: 'trainer:rook', deskAnchor: KNIGHT_DESK_AFTER, moved: true });
    expect(trainerPlacement(DEFAULT_KITS.knight, map(LATE)).deskAnchor).toBe('caldera.camp.trainer.rook');
  });
  it('the movers\' first post row sends them home after the ending; Rook stands at Gaut\'s Bastion post', () => {
    for (const id of Object.keys(HOME_AFTER_ENDING)) {
      const rule = POST_RULES.find((r) => r.npcId === id);
      expect(rule, id).toBeDefined();
      expect(rule!.posts[0]).toEqual({ when: { flag: AFTER_ENDING_FLAG }, anchorId: HOME_AFTER_ENDING[id] ?? rule!.home });
    }
    expect(POST_RULES.find((r) => r.npcId === 'rook')!.posts[0]!.anchorId).toBe(ROOK_POST_AFTER);
  });
});

describe('no enemy rescales after the ending', () => {
  it('every region band is the same with and without the after-ending flags', () => {
    for (const id of REGION_IDS) expect(bandForRegion(id, map(AFTER('let-it-die'))), id).toEqual(bandForRegion(id, map(LATE)));
  });
  it('no Act 5 enemy rescales: the Caldera band and the P + 3 cap read no after-ending flag', () => {
    const band = bandForRegion('caldera', map(AFTER('rekindle')));
    expect(band).toEqual(bandForRegion('caldera', map(LATE)));
    expect(ACT5_CAP_ABOVE_PLAYER).toBe(3);
    // a level 36 Cael after the ending meets the Caldera's band rolled and capped exactly as before it
    for (const roll of [0, 0.5, 1]) expect(act5Level(band!, roll, 36)).toBeLessThanOrEqual(39);
  });
});

function host(flags: Record<string, unknown>, teleport: WakeHost['teleport'] = async () => ({ ok: true })) {
  const calls = { tint: [] as unknown[], shown: [] as string[], feet: [] as { x: number; y: number; z: number }[], warns: [] as string[] };
  const h: WakeHost = {
    flags: map(flags),
    groundAt: () => 300,
    teleport: async (feet, yaw) => {
      calls.feet.push(feet);
      expect(yaw).toBe(WAKE_YAW);
      return teleport(feet, yaw);
    },
    setTint: (c) => calls.tint.push(c),
    show: (k) => calls.shown.push(k),
    warn: (m) => calls.warns.push(m),
  };
  return { h, calls };
}

describe('the waking', () => {
  it('lands at the Rim Camp rest point on the ground, tints and shows the line by choice', async () => {
    const { h, calls } = host(AFTER('let-it-die'));
    const s = new AfterEnding(h);
    await s.wake();
    expect(calls.feet).toEqual([{ x: WAKE_POINT.x, y: 300.05, z: WAKE_POINT.z }]);
    expect([WAKE_POINT.x, WAKE_POINT.z]).toEqual([...RIM_CAMP.rest]);
    expect(calls.tint).toEqual(['let-it-die']);
    expect(calls.shown).toEqual(['afterEnding.wake.let-it-die']);
    expect(s.woken).toBe(true);
    for (const k of calls.shown) expect(AFTER_ENDING_STRINGS_EN[k]).toBeTruthy();
  });
  it('a Cael who died gets the ballad line; unset or alive does not', () => {
    expect(wakeLines(map(AFTER('rekindle', false)))).toEqual(['afterEnding.wake.rekindle', 'afterEnding.wake.ballad']);
    expect(wakeLines(map(AFTER('rekindle', true)))).toEqual(['afterEnding.wake.rekindle']);
    expect(wakeLines(map(AFTER('rekindle', undefined)))).toEqual(['afterEnding.wake.rekindle']);
  });
  it('a second wake does nothing; a refused teleport still tints and shows (failure)', async () => {
    const { h, calls } = host(AFTER('rekindle'), async () => ({ ok: false }));
    const s = new AfterEnding(h);
    await Promise.all([s.wake(), s.wake()]);
    await s.wake();
    expect(calls.feet).toHaveLength(1);
    expect(calls.tint).toEqual(['rekindle']);
    expect(calls.warns.some((w) => w.includes('refused'))).toBe(true);
  });
  it('a load resets the waking (a replayed ending wakes again); a throwing step never rejects (failure)', async () => {
    const { h, calls } = host(AFTER('rekindle'));
    const s = new AfterEnding(h);
    await s.wake();
    s.reset();
    expect(s.woken).toBe(false);
    await s.wake();
    expect(calls.feet).toHaveLength(2);
    const bad = host(AFTER('rekindle'));
    bad.h.setTint = () => {
      throw new Error('no tint');
    };
    const t = new AfterEnding(bad.h);
    await expect(t.wake()).resolves.toBeUndefined();
    expect(t.woken).toBe(true);
    expect(bad.calls.warns.some((w) => w.includes('no tint'))).toBe(true);
  });
  it('woken before the flags were set: warns and wakes without a tint (edge)', async () => {
    const { h, calls } = host(LATE);
    await new AfterEnding(h).wake();
    expect(calls.tint).toEqual([null]);
    expect(calls.shown).toEqual([]);
    expect(calls.warns.length).toBeGreaterThan(0);
  });
  it('faces the fire from the rest point (yaw 0 faces -Z)', () => {
    const fwd = { x: -Math.sin(WAKE_YAW), z: -Math.cos(WAKE_YAW) };
    const to = { x: RIM_CAMP.fire[0] - WAKE_POINT.x, z: RIM_CAMP.fire[1] - WAKE_POINT.z };
    const len = Math.hypot(to.x, to.z);
    expect(fwd.x * (to.x / len) + fwd.z * (to.z / len)).toBeCloseTo(1, 6);
  });
});

function lookScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x808080, 10, 100);
  scene.background = new THREE.Color(0x808080);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
  scene.add(sun, hemi);
  return { scene, sun, hemi };
}

describe('the look', () => {
  const cam = { x: 8500, y: 50, z: 2000 };
  const mk = (scene: THREE.Scene, opts: { indoors?: () => boolean; at?: { x: number; y: number; z: number } } = {}) => {
    const flyby = vi.fn();
    const look = new AfterEndingLook({ scene, camera: () => opts.at ?? cam, indoors: opts.indoors ?? (() => false), groundAt: () => 0, flyby });
    return { look, flyby };
  };
  it('Rekindle warms the lights and the sky outdoors, and hands everything back', () => {
    const { scene, sun, hemi } = lookScene();
    const { look } = mk(scene);
    look.set('rekindle');
    look.step(1 / 60);
    expect(sun.intensity).toBeCloseTo(REKINDLE_GRADE.intensity, 5);
    expect(hemi.intensity).toBeCloseTo(0.5 * REKINDLE_GRADE.intensity, 5);
    expect((scene.fog as THREE.Fog).color.getHex()).not.toBe(0x808080);
    expect(sun.color.getHex()).not.toBe(0xffffff);
    look.dispose();
    expect(sun.intensity).toBe(1);
    expect((scene.fog as THREE.Fog).color.getHex()).toBe(0x808080);
    expect(sun.color.getHex()).toBe(0xffffff);
    expect(look.flights).toHaveLength(0);
  });
  it('Let It Die keeps the grey outside the Waste, and none or null changes nothing (failure)', () => {
    const { scene, sun } = lookScene();
    const { look } = mk(scene);
    look.set('let-it-die');
    look.step(1 / 60);
    expect(sun.intensity).toBe(1);
    expect((scene.fog as THREE.Fog).color.getHex()).toBe(0x808080);
    look.set(null);
    look.step(1 / 60);
    expect(sun.intensity).toBe(1);
  });
  it('indoors the look holds and writes nothing; inside the Caldera Rekindle fades out (edge)', () => {
    const { scene, sun } = lookScene();
    let inside = true;
    const { look } = mk(scene, { indoors: () => inside });
    look.set('rekindle');
    look.step(1 / 60);
    expect(sun.intensity).toBe(1);
    inside = false;
    look.step(1 / 60);
    expect(sun.intensity).toBeGreaterThan(1);
    const storms = stormRegionBoxes();
    expect(storms.length, "the Waste (the Caldera sits inside it)").toBeGreaterThanOrEqual(1);
    for (const id of ['caldera', 'ashen-waste'] as const) {
      const b = engineBox(id);
      expect(rekindleWeight(storms, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2), id).toBe(0);
    }
    const w = engineBox('ashen-waste');
    // just outside the Waste, inside the storm look's outside band: still off (no two blenders on the fog at once)
    expect(rekindleWeight(storms, w.x0 - STORM_EDGE.outside / 2, (w.z0 + w.z1) / 2)).toBe(0);
    expect(rekindleWeight(storms, cam.x, cam.z)).toBe(1);
  });
  it('Let It Die flies three dragons (not actors) on closed loops; they land when the tint goes', () => {
    const { scene } = lookScene();
    const { look, flyby } = mk(scene, { at: { x: AFTER_FLIGHTS[0]!.centre.x + AFTER_FLIGHTS[0]!.radius.x, y: AFTER_FLIGHTS[0]!.altitude, z: AFTER_FLIGHTS[0]!.centre.z } });
    look.set('let-it-die');
    expect(look.flights.map((d) => d.id)).toEqual(AFTER_FLIGHTS.map((f) => f.dragon));
    for (let i = 0; i < 30; i++) look.step(1 / 30);
    expect(look.flights.every((d) => Number.isFinite(d.position.x))).toBe(true);
    expect(scene.getObjectByName('after-dragon-ysmeryth')).toBeTruthy();
    expect(flyby).toHaveBeenCalledWith('after-dragon-ysmeryth', true);
    look.set('rekindle');
    expect(look.flights).toHaveLength(0);
    expect(scene.getObjectByName('after-dragon-ysmeryth')).toBeUndefined();
    expect(flyby).toHaveBeenLastCalledWith('after-dragon-ysmeryth', false);
  });
  it('a flight loop has its points at the altitude above the ground', () => {
    const f = AFTER_FLIGHTS[1]!;
    const loop = flightLoop(f, (x) => x / 100);
    expect(loop).toHaveLength(FLIGHT_POINTS);
    for (const p of loop) expect(p.y).toBeCloseTo(p.x / 100 + f.altitude, 6);
  });
});

describe('the Waste storm under Let It Die (N13, T6)', () => {
  it('the storm target darkens 30% only under Let It Die after the ending', () => {
    const st = new WorldState(new GameEvents(), () => {});
    expect(stormDarkMix(st)).toBe(0);
    st.setFlag(M56_CHOICE_FLAG, 'let-it-die');
    expect(stormDarkMix(st), 'the choice alone, before the ending').toBe(0);
    st.setFlag(AFTER_ENDING_FLAG, true);
    expect(stormDarkMix(st)).toBe(0.3);
    st.setFlag(M56_CHOICE_FLAG, 'rekindle');
    expect(stormDarkMix(st)).toBe(0);
    expect(WASTE_STORM_DARK).toBe(0x4a4642);
  });
});
