// The two Greyfen set pieces added after the real-game check (K12 follow-up): M26's framed wake and M27's brood flight home. Through the
// rig's stage fakes (camera rig, move modifier, cutscene context, scene graph, water service, a wake-capable Hathren, a dialogue that
// holds the floor): what starts them, what ends them, and that every exit leaves nothing held.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll } from './director/autoplay.testkit';
import { M26_WAKE_SCENE, M26_WOKE, M26_WAKE_SEEN } from './m26.quest';
import { M27_BROOD_SCENE, M27_BROOD_BACK } from './m27.quest';
import { M27_BROOD_TICKS, M27_BROOD_WADE_PATIENCE, M26_WAKE_DIALOGUE_GIVEUP } from './director/late';

let rig: Rig | null = null;
const fresh = (...a: Parameters<typeof makeRig>): Rig => (rig = makeRig(...a));
afterEach(() => { rig?.dispose(); rig = null; vi.restoreAllMocks(); });
const flush = async (): Promise<void> => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

const gate = (r: Rig) => r.state.setFlag('story.gate.a3', true);

/** M26 with its wake step current, Cael far from the shore, the stage fakes present and the dialogue holding the floor. */
function atWakeStep(opts: { stage?: boolean } = {}): Rig {
  const r = fresh({ stage: opts.stage ?? true });
  gate(r);
  autoplayAll(r, ['m23', 'm24', 'm25']);
  expect(r.manager.start('m26')).toBe(true);
  autoplay(r, 'm26', { stopAt: ['m26', 'wake'] });
  expect(r.current('m26', 'wake')).toBe(true);
  r.dialogue.hold = true;
  r.hath.selfRelease = false; // K12's own release is what these tests isolate
  r.step(2);
  return r;
}
const toShore = (r: Rig, d = 3): void => {
  const a = r.kit.ctx.anchors.find('greyfen.mere.shore')!;
  r.player.feet.x = a.position.x + d;
  r.player.feet.z = a.position.z;
};
const nothingHeld = (r: Rig): void => {
  expect(r.stage.freezes).toBe(0);
  expect(r.stage.cutscenes).toBe(0);
  expect(r.stage.cameras).toBe(0);
};
const hold = (r: Rig, ticks: number): void => {
  r.stage.menuDown = true;
  r.stage.menuPressed = true;
  r.step(1);
  r.stage.menuPressed = false;
  r.step(ticks);
  r.stage.menuDown = false;
};

describe('M26: the framed wake', () => {
  it('holds Hathren silent from the start of M26, so walking up cannot wake her out of frame', () => {
    const r = atWakeStep();
    expect(r.hath.held).toBe(true);
    r.step(100);
    expect(r.hath.wakes).toBe(0);
    expect(r.stage.cameras).toBe(0);
  });

  it('does not play far from the shore, with a dialogue open, or before the step is current', () => {
    const r = atWakeStep();
    toShore(r, 40);
    r.step(60);
    expect(r.hath.wakes).toBe(0);
    toShore(r, 3);
    r.dialogue.active = true;
    r.step(60);
    expect(r.hath.wakes).toBe(0);
    r.dialogue.active = false;
    r.step(30);
    expect(r.hath.wakes).toBe(1);
  });

  it('frames her: freezes Cael, pushes the cutscene context, holds the camera on her head, and does not credit the step on her first beat', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    expect(r.hath.wakes).toBe(1);
    expect(r.stage).toMatchObject({ freezes: 1, cutscenes: 1, cameras: 1 });
    const look = r.stage.shots[0]!.lookAt as () => { x: number; y: number; z: number };
    const head = r.hath.headPoint();
    expect(look()).toEqual({ x: head.x, y: head.y - 10, z: head.z }); // aimed under her head: she rides high in the frame, clear of the dialogue
    expect(r.flag(M26_WOKE)).toBe(false); // her own wake beat has fired inside wake(); only the scene's end credits
    expect(r.done('m26', 'wake')).toBe(false);
    expect(r.flag('story.m26.guardOut')).toBe(false);
  });

  it('plays the five-line scene on her spray beat and credits the step when both the wake and the scene are over', async () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    expect(r.started(M26_WAKE_SCENE)).toBe(false);
    r.emit('wyrm.hathren', { beat: 'spray' });
    r.step(2);
    expect(r.started(M26_WAKE_SCENE)).toBe(true);
    r.dialogue.finish();
    r.step(5);
    expect(r.done('m26', 'wake')).toBe(false); // her twelve seconds are not over
    expect(r.stage.cameras).toBe(1);
    r.hath.finishWake();
    await flush();
    r.step(5);
    expect(r.flag(M26_WOKE)).toBe(true);
    expect(r.flag(M26_WAKE_SEEN)).toBe(true);
    expect(r.done('m26', 'wake')).toBe(true);
    nothingHeld(r);
    expect(r.hath.held).toBe(false);
    r.step(5);
    expect(r.flag('story.m26.guardOut')).toBe(true);
    r.step(300);
    expect(r.hath.wakes).toBe(1); // played once
  });

  it('skipping at the first frame credits the wake at once, without waiting out her twelve seconds', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    expect(r.stage.cameras).toBe(1);
    hold(r, 80);
    r.step(3);
    expect(r.hath.skips).toBe(1);
    expect(r.flag(M26_WOKE)).toBe(true);
    expect(r.done('m26', 'wake')).toBe(true);
    nothingHeld(r);
    expect(r.hath.held).toBe(false);
  });

  it('skipping with the dialogue open closes it and credits at once', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    r.emit('wyrm.hathren', { beat: 'spray' });
    r.step(2);
    expect(r.dialogue.active).toBe(true);
    hold(r, 80);
    r.step(3);
    expect(r.dialogue.active).toBe(false);
    expect(r.done('m26', 'wake')).toBe(true);
    nothingHeld(r);
  });

  it('closing the scene dialogue early ends the whole scene and credits at once', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    r.emit('wyrm.hathren', { beat: 'spray' });
    r.step(2);
    r.dialogue.close('skip');
    r.step(3);
    expect(r.done('m26', 'wake')).toBe(true);
    expect(r.hath.skips).toBe(1);
    nothingHeld(r);
  });

  it('gives up on a scene that never opens (another modal held the floor) and still ends', async () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    r.hath.finishWake();
    await flush();
    r.emit('wyrm.hathren', { beat: 'spray' });
    r.dialogue.active = true; // somebody else's dialogue
    r.step(M26_WAKE_DIALOGUE_GIVEUP + 60);
    expect(r.done('m26', 'wake')).toBe(true);
    nothingHeld(r);
  });

  it('a load in the middle releases everything and credits the step (the wake is not saved)', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    expect(r.stage.cameras).toBe(1);
    r.emit('save.loaded', { slot: 'a' });
    r.step(3);
    nothingHeld(r);
    expect(r.done('m26', 'wake')).toBe(true);
    expect(r.hath.held).toBe(false);
  });

  it('reviewer repro: a load into an earlier save with the wake dialogue open leaves nothing locked; at the shore again the scene plays and the step credits', () => {
    const r = fresh({ stage: true });
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25']);
    const snap = JSON.parse(JSON.stringify(r.manager.serialize()));
    expect(r.manager.start('m26')).toBe(true);
    autoplay(r, 'm26', { stopAt: ['m26', 'wake'] });
    r.dialogue.hold = true;
    r.hath.selfRelease = false;
    r.step(2);
    toShore(r, 3);
    r.step(30);
    r.emit('wyrm.hathren', { beat: 'spray' });
    r.step(2);
    expect(r.dialogue.active).toBe(true);
    r.manager.load(JSON.parse(JSON.stringify(snap))); // the earlier save: M26 not started
    r.state.clearFlag(M26_WOKE);
    r.emit('save.loaded', { slot: 'a' });
    r.step(5);
    nothingHeld(r);
    expect(r.flag(M26_WOKE)).toBe(false);
    expect(r.hath.held).toBe(false); // M26 is not active in the loaded world
    // play on to the wake step again
    r.hath.awake = false;
    r.player.feet.x += 200;
    r.dialogue.hold = false;
    expect(r.manager.start('m26')).toBe(true);
    autoplay(r, 'm26', { stopAt: ['m26', 'wake'] });
    r.dialogue.hold = true;
    r.step(40);
    expect(r.hath.held).toBe(true);
    const wakes = r.hath.wakes;
    toShore(r, 3);
    r.step(40);
    expect(r.hath.wakes).toBe(wakes + 1);
    expect(r.stage.cameras).toBe(1);
    r.emit('wyrm.hathren', { beat: 'spray' });
    r.step(2);
    r.dialogue.close('skip');
    r.step(3);
    expect(r.done('m26', 'wake')).toBe(true);
    nothingHeld(r);
  });

  it('plays from 30 m, not from further away; not while diving; not with a living hostile within 15 m', () => {
    const r = atWakeStep();
    toShore(r, 45);
    r.step(60);
    expect(r.hath.wakes).toBe(0);
    toShore(r, 25);
    r.water.state = 'diving';
    r.step(60);
    expect(r.hath.wakes).toBe(0);
    r.water.state = 'dry';
    (r.kit.ctx as unknown as { actors: unknown }).actors = { all: () => [{ team: 'hostile', dead: false, position: { x: r.player.feet.x + 5, y: 0, z: r.player.feet.z } }] };
    r.step(60);
    expect(r.hath.wakes).toBe(0);
    (r.kit.ctx as unknown as { actors: unknown }).actors = { all: () => [{ team: 'hostile', dead: true, position: { x: r.player.feet.x + 5, y: 0, z: r.player.feet.z } }] };
    r.step(40);
    expect(r.hath.wakes).toBe(1);
  });

  it('a skip fires her remaining beats (spray, thrash) re-entering the beat handler without harm, and her own self-release is no problem', () => {
    const r = atWakeStep();
    r.hath.selfRelease = true;
    toShore(r, 3);
    r.step(30);
    hold(r, 80);
    r.step(3);
    expect(r.done('m26', 'wake')).toBe(true);
    expect(r.started(M26_WAKE_SCENE)).toBe(false);
    nothingHeld(r);
  });

  it('releases Hathren and the stage when M26 fails mid-scene', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    r.manager.fail('m26');
    r.step(5);
    nothingHeld(r);
    expect(r.hath.held).toBe(false);
    expect(r.flag(M26_WOKE)).toBe(false);
  });

  it('releases Hathren when M26 is abandoned or fails before the scene, so she wakes for a player who returns', () => {
    const r = atWakeStep();
    expect(r.hath.held).toBe(true);
    r.manager.fail('m26');
    r.step(40);
    expect(r.hath.held).toBe(false);
    const r2 = atWakeStep();
    expect(r2.hath.held).toBe(true);
    vi.spyOn(r2.manager, 'state').mockImplementation(((q: string) => (q === 'm26' ? 'inactive' : 'completed')) as never); // abandoned by script: no event at all
    r2.step(40);
    expect(r2.hath.held).toBe(false);
  });

  it('an abandoned M26 mid-scene ends the scene and lets her go', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    vi.spyOn(r.manager, 'state').mockImplementation(((q: string) => (q === 'm26' ? 'inactive' : 'completed')) as never);
    r.step(5);
    nothingHeld(r);
    expect(r.hath.held).toBe(false);
    expect(r.flag(M26_WOKE)).toBe(false);
  });

  it('a completed M26 mid-scene releases everything', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    vi.spyOn(r.manager, 'state').mockImplementation(((q: string) => (q === 'm26' ? 'completed' : 'completed')) as never);
    r.emit('quest.completed', { questId: 'm26' });
    r.step(3);
    nothingHeld(r);
    expect(r.hath.held).toBe(false);
  });

  it('tearing the plugin down mid-scene releases the stage and her hold', () => {
    const r = atWakeStep();
    toShore(r, 3);
    r.step(30);
    expect(r.stage.cameras).toBe(1);
    r.dispose();
    nothingHeld(r);
    expect(r.hath.held).toBe(false);
  });

  it('if she cannot wake in frame the step is credited and nothing stays held', () => {
    const r = atWakeStep();
    r.hath.canWake = false;
    toShore(r, 3);
    r.step(30);
    expect(r.done('m26', 'wake')).toBe(true);
    nothingHeld(r);
  });

  it('without a camera rig (a reduced boot) her own beat credits the step and she is never held', () => {
    const r = atWakeStep({ stage: false });
    expect(r.hath.held).toBe(false);
    r.emit('wyrm.hathren', { beat: 'wake' });
    expect(r.done('m26', 'wake')).toBe(true);
  });
});

describe('M27: the brood flight home', () => {
  const sceneChildren = (r: Rig): number => r.sceneGraph.children.length;
  /** The third cage has just been opened; the 240-tick wait is running. */
  function atCages(): Rig {
    const r = fresh({ stage: true });
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25', 'm26'], { r14: 'released' });
    r.manager.start('r14');
    autoplay(r, 'r14', { r14: 'released' });
    r.manager.start('m27');
    r.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    r.dialogue.hold = false;
    autoplay(r, 'm27', { stopAt: ['m27', 'free'], r14: 'released' });
    r.dialogue.hold = true;
    r.step(2);
    return r;
  }
  const openCages = (r: Rig): void => { ['use:m27-free-1', 'use:m27-free-2', 'use:m27-free-3'].forEach((id) => r.use(id)); r.step(1); };
  const flightEnds = (r: Rig): void => { for (let i = 0; i < 1500 && !r.started(M27_BROOD_SCENE); i++) r.step(1); };

  it('does nothing until the wait is over, then lifts three hatchlings and holds the camera and the player', () => {
    const r = atCages();
    const before = sceneChildren(r);
    openCages(r);
    r.step(M27_BROOD_TICKS - 20);
    expect(r.stage.cameras).toBe(0);
    expect(sceneChildren(r)).toBe(before);
    r.step(60);
    expect(r.stage).toMatchObject({ freezes: 1, cutscenes: 1, cameras: 1 });
    expect(sceneChildren(r)).toBe(before + 6); // three rigs and three splash rings
    expect(r.flag(M27_BROOD_BACK)).toBe(false);
  });

  it('flies, dives, plays Leofa\'s two lines, writes the flag at the end and leaves nothing behind', () => {
    const r = atCages();
    const before = sceneChildren(r);
    openCages(r);
    r.step(M27_BROOD_TICKS + 30);
    flightEnds(r);
    expect(r.started(M27_BROOD_SCENE)).toBe(true);
    expect(r.flag(M27_BROOD_BACK)).toBe(false);
    expect(r.stage.cameras).toBe(1);
    r.dialogue.finish();
    r.step(3);
    expect(r.flag(M27_BROOD_BACK)).toBe(true);
    expect(r.done('m27', 'brood')).toBe(true);
    nothingHeld(r);
    expect(sceneChildren(r)).toBe(before);
  });

  it('skip: holding the key ends it at once, writes the flag and disposes the rigs', () => {
    const r = atCages();
    const before = sceneChildren(r);
    openCages(r);
    r.step(M27_BROOD_TICKS + 60);
    expect(r.stage.cameras).toBe(1);
    hold(r, 80);
    r.step(3);
    expect(r.flag(M27_BROOD_BACK)).toBe(true);
    nothingHeld(r);
    expect(sceneChildren(r)).toBe(before);
  });

  it('a load in the middle disposes the rigs and the camera, and the three freed flags complete the step (no replay)', () => {
    const r = atCages();
    const before = sceneChildren(r);
    openCages(r);
    r.step(M27_BROOD_TICKS + 60);
    expect(r.stage.cameras).toBe(1);
    r.emit('save.loaded', { slot: 'a' });
    r.step(3);
    nothingHeld(r);
    expect(sceneChildren(r)).toBe(before);
    expect(r.flag(M27_BROOD_BACK)).toBe(true);
    r.step(M27_BROOD_TICKS * 3);
    expect(r.stage.cameras).toBe(0);
    expect(r.started(M27_BROOD_SCENE)).toBe(false);
  });

  it('a load with Leofa\'s lines open (the dialogue closes with reason load first) does not credit a world whose cages are not all open', () => {
    const r = atCages();
    openCages(r);
    r.step(M27_BROOD_TICKS + 30);
    flightEnds(r);
    expect(r.dialogue.active).toBe(true);
    for (const f of ['story.m27.freed.1', 'story.m27.freed.2', 'story.m27.freed.3']) r.state.clearFlag(f); // the loaded save: no cage opened yet
    r.emit('save.loaded', { slot: 'a' });
    r.step(5);
    expect(r.flag(M27_BROOD_BACK)).toBe(false);
    nothingHeld(r);
  });

  it('a load with the lines open and all three cages freed in the loaded world completes the step once, no replay', () => {
    const r = atCages();
    openCages(r);
    r.step(M27_BROOD_TICKS + 30);
    flightEnds(r);
    r.emit('save.loaded', { slot: 'a' });
    r.step(5);
    expect(r.flag(M27_BROOD_BACK)).toBe(true);
    nothingHeld(r);
  });

  it('a load in the wait (before the scene) replays the wait and then the scene', () => {
    const r = atCages();
    openCages(r);
    r.step(60);
    r.emit('save.loaded', { slot: 'a' });
    r.step(M27_BROOD_TICKS + 60);
    expect(r.stage.cameras).toBe(1);
    expect(r.flag(M27_BROOD_BACK)).toBe(false);
  });

  it('M27 completing or failing mid-scene releases everything', () => {
    const r = atCages();
    const before = sceneChildren(r);
    openCages(r);
    r.step(M27_BROOD_TICKS + 60);
    r.manager.fail('m27');
    r.step(3);
    nothingHeld(r);
    expect(sceneChildren(r)).toBe(before);
    expect(r.flag(M27_BROOD_BACK)).toBe(false);
  });

  it('tearing the plugin down mid-scene releases everything', () => {
    const r = atCages();
    const before = sceneChildren(r);
    openCages(r);
    r.step(M27_BROOD_TICKS + 60);
    r.dispose();
    nothingHeld(r);
    expect(sceneChildren(r)).toBe(before);
  });

  it('waits while Cael is diving, and for a while when he is wading, before the camera takes him', () => {
    const r = atCages();
    openCages(r);
    r.water.state = 'diving';
    r.step(M27_BROOD_TICKS + M27_BROOD_WADE_PATIENCE + 300);
    expect(r.stage.cameras).toBe(0);
    expect(r.stage.freezes).toBe(0);
    r.water.state = 'dry';
    r.step(40);
    expect(r.stage.cameras).toBe(1);
  });

  it('a wading Cael holds the scene back until he is on foot, or until the patience runs out', () => {
    const a = atCages();
    openCages(a);
    a.water.state = 'wading';
    a.step(M27_BROOD_TICKS + 200);
    expect(a.stage.cameras).toBe(0);
    a.water.state = 'dry';
    a.step(40);
    expect(a.stage.cameras).toBe(1);
    a.dispose();
    const b = atCages();
    openCages(b);
    b.water.state = 'wading';
    b.step(M27_BROOD_TICKS + M27_BROOD_WADE_PATIENCE + 60);
    // patience out, still wading: the flight plays in the world with no camera override and no freeze
    expect(b.stage).toMatchObject({ freezes: 0, cutscenes: 0, cameras: 0 });
    expect(b.sceneGraph.children.some((c) => c.name.startsWith('brood-hatchling'))).toBe(true);
    flightEnds(b);
    expect(b.started(M27_BROOD_SCENE)).toBe(true);
    expect(b.stage).toMatchObject({ freezes: 0, cutscenes: 0, cameras: 0 });
    expect(b.flag(M27_BROOD_BACK)).toBe(false);
    b.dialogue.finish();
    b.step(3);
    expect(b.flag(M27_BROOD_BACK)).toBe(true);
    expect(b.sceneGraph.children.some((c) => c.name.startsWith('brood-hatchling'))).toBe(false);
  });

  it('not while a dialogue is open', () => {
    const r = atCages();
    openCages(r);
    r.dialogue.active = true;
    r.step(M27_BROOD_TICKS + 200);
    expect(r.stage.cameras).toBe(0);
    r.dialogue.active = false;
    r.step(40);
    expect(r.stage.cameras).toBe(1);
  });

  it('spawns and leaves no actors: the scene graph gains only its own meshes, and they are gone at the end', () => {
    const r = atCages();
    const names = (): string[] => r.sceneGraph.children.map((c) => c.name).sort();
    const before = names();
    openCages(r);
    r.step(M27_BROOD_TICKS + 60);
    expect(names().filter((n) => n.startsWith('brood-')).length).toBe(6);
    hold(r, 80);
    r.step(3);
    expect(names()).toEqual(before);
  });

  it('without a camera rig (a reduced boot) the flag and the toast stand in after the wait', () => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25', 'm26'], { r14: 'released' });
    r.manager.start('r14');
    autoplay(r, 'r14', { r14: 'released' });
    r.manager.start('m27');
    r.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    autoplay(r, 'm27', { stopAt: ['m27', 'brood'], r14: 'released' });
    r.step(M27_BROOD_TICKS + 30);
    expect(r.flag(M27_BROOD_BACK)).toBe(true);
  });
});

describe('the scene frame', () => {
  it('ends even when the skip widget cannot be unmounted', async () => {
    const { SetPiece } = await import('./director/scenes');
    const r = fresh({ stage: true });
    (r.kit.ctx as unknown as { hud: unknown }).hud = { modalOpen: null, mount: () => () => { throw new Error('torn down'); } };
    (globalThis as { document?: unknown }).document = { createElement: () => ({ style: {}, appendChild() {}, remove() {} }) };
    try {
      let ended = '';
      const p = new SetPiece(r.kit, 'test', (why) => { ended = why; });
      expect(p.begin({ position: { x: 0, y: 0, z: 0 }, lookAt: { x: 0, y: 0, z: 1 } })).toBe(true);
      p.end('teardown');
      expect(ended).toBe('teardown');
      nothingHeld(r);
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });
});
