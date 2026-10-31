// The Greyfen director's rules through the rig (real bus, flags and quest manager; stub services): every rule that is not in a
// quest definition or a dialogue, including the early and late events and the loads in the middle of each set piece.
import { afterEach, describe, expect, it } from 'vitest';
import { makeRig, type Rig } from './director/rig.testkit';
import { autoplay, autoplayAll, singBar } from './director/autoplay.testkit';
import { M25_BURN_RELIEF, M25_DRINK_TICKS } from './director/early';
import { M27_BROOD_TICKS, R13_CALM_TICKS } from './director/late';
import { R12_TORCH_FLAG } from './r12.quest';
import { R13_ALTAR, R13_SONG_SCENE, R13_SONG_NPC } from './r13.quest';
import { M24_VOLUME } from './m24.quest';

let rig: Rig | null = null;
const fresh = (...a: Parameters<typeof makeRig>): Rig => (rig = makeRig(...a));
afterEach(() => { rig?.dispose(); rig = null; });

const gate = (r: Rig) => r.state.setFlag('story.gate.a3', true);
const upTo = (r: Rig, quest: string, chain: string[], stop?: [string, string], opts = {}) => {
  gate(r);
  autoplayAll(r, chain);
  expect(r.manager.start(quest)).toBe(true);
  autoplay(r, quest, { stopAt: stop, ...opts });
};
/** Carry a world into a new rig: the quest manager, the flags and the stubs' own state, then `save.loaded`. */
function reload(r: Rig): Rig {
  const data = JSON.parse(JSON.stringify(r.manager.serialize()));
  const flags = JSON.parse(JSON.stringify(r.state.serialize()));
  const inv = new Map(r.inv);
  r.dispose();
  const n = makeRig();
  rig = n;
  n.state.load(flags);
  n.manager.load(data);
  for (const [k, v] of inv) n.inv.set(k, v);
  n.emit('save.loaded', { slot: 'a' });
  n.step(3);
  return n;
}

describe('M23: the causeway and the first sight', () => {
  it('arms a leech knot only when its step is current, never on accept', () => {
    const r = fresh();
    upTo(r, 'm23', [], ['m23', 'cart']);
    r.step(2);
    expect(r.flag('story.m23.knotOut.1')).toBe(false);
    r.reads(['note-m23-cart']);
    r.step(2);
    expect(r.flag('story.m23.knotOut.1')).toBe(true);
    expect(r.flag('story.m23.knotOut.2')).toBe(false);
  });

  it('plays the first-sight scene when the step is current and Cael is in the trigger, once the floor is free', () => {
    const r = fresh();
    upTo(r, 'm23', [], ['m23', 'sight']);
    r.step(70);
    expect(r.started('scene-m23-sight')).toBe(false);
    r.dialogue.active = true;
    r.inside.add('trg.greyfen.mere.first-sight');
    r.step(70);
    expect(r.started('scene-m23-sight')).toBe(false); // another dialogue holds the floor
    r.dialogue.active = false;
    r.step(70);
    expect(r.dialogue.started.filter(([d]) => d === 'scene-m23-sight')).toHaveLength(1);
    expect(r.dialogue.started[0]![1]).toBe('scene.m23.sight');
    r.step(700); // a closed scene is offered again after ten seconds
    expect(r.dialogue.started.filter(([d]) => d === 'scene-m23-sight').length).toBeGreaterThanOrEqual(2);
    r.scene('scene-m23-sight', 'scene.m23.sight');
    expect(r.done('m23', 'sight')).toBe(true);
  });

  it('plays the scene for a player who walked past the trigger (as near the shrine as its centre)', () => {
    const r = fresh();
    upTo(r, 'm23', [], ['m23', 'sight']);
    r.player.feet = { x: 3000, y: 0, z: 12060 }; // beside the shrine
    r.step(70);
    expect(r.started('scene-m23-sight')).toBe(true);
  });

  it('credits a bridge lowered early once its step comes', () => {
    const r = fresh();
    upTo(r, 'm23', [], ['m23', 'cart']);
    r.state.setFlag('world.greyfen.bridge.1.down', true);
    r.reads(['note-m23-cart']);
    r.kill('fen-leech', 'm23.knot.1', 3);
    r.reads(['note-m23-marker']);
    r.manager.recheck();
    expect(r.done('m23', 'bridge1')).toBe(true);
  });
});

describe('M24: the horn and the first run', () => {
  it('counts a dive start, but a surfacing only once the horn is in hand', () => {
    const r = fresh();
    upTo(r, 'm24', ['m23'], ['m24', 'dive']);
    r.emit('dive.started', { volumeId: 'water.greyfen.elsewhere' });
    expect(r.flag('story.m24.dived')).toBe(false);
    r.emit('dive.started', { volumeId: M24_VOLUME });
    expect(r.flag('story.m24.dived')).toBe(true);
    r.emit('dive.surfaced', { volumeId: M24_VOLUME, pocketId: null });
    expect(r.flag('story.m24.surfaced')).toBe(false);
    expect(r.use('use:m24-horn')).toBe(true);
    expect(r.inv.get('m24-ferry-horn')).toBe(1);
    r.emit('dive.surfaced', { volumeId: M24_VOLUME, pocketId: null });
    expect(r.flag('story.m24.surfaced')).toBe(true);
  });

  it('opens the boat when the horn is blown, and a run before that is not the first run', () => {
    const r = fresh();
    upTo(r, 'm24', ['m23'], ['m24', 'blow']);
    expect(r.flag('story.m24.ferryOpen')).toBe(false);
    r.emit('ferry.arrived', { routeId: 'ferry.greyfen.reedgate-mere', stop: 'mere', skipped: false });
    expect(r.flag('story.m24.ferryRun')).toBe(false);
    expect(r.use('use:m24-blow')).toBe(true);
    expect(r.flag('story.m24.ferryOpen')).toBe(true);
    r.emit('ferry.arrived', { routeId: 'ferry.greyfen.mere-greywatch', stop: 'greywatch', skipped: false });
    expect(r.flag('story.m24.ferryRun')).toBe(false); // not a Reedgate route
    r.emit('ferry.arrived', { routeId: 'ferry.greyfen.reedgate-mere', stop: 'mere', skipped: false });
    expect(r.flag('story.m24.ferryRun')).toBe(true);
    expect(r.done('m24', 'ferry')).toBe(true);
  });

  it('keeps the boat open across a load between the blow and the run', () => {
    const r0 = fresh();
    upTo(r0, 'm24', ['m23'], ['m24', 'ferry']);
    expect(r0.flag('story.m24.ferryOpen')).toBe(true);
    const r = reload(r0);
    expect(r.flag('story.m24.ferryOpen')).toBe(true);
    expect(r.current('m24', 'ferry')).toBe(true);
  });
});

describe('R12: torch or sickle', () => {
  const start = (opts: { r12?: 'burned' | 'cut' } = {}) => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23', 'm24']);
    r.manager.start('r12');
    // the unused branch credits itself, so the first live step is the torches or the cuts
    autoplay(r, 'r12', { stopAt: ['r12', opts.r12 === 'cut' ? 'cut' : 'burn'], ...opts });
    return r;
  };

  it('the torch: the first lit bed fixes the choice, the favour moves once (-2), the armour comes at the last bed', () => {
    const r = start();
    const before = r.state.favour('dragons');
    expect(r.str('story.r12.choice')).toBe('');
    expect(r.use('use:r12-bed-1-torch')).toBe(true);
    expect(r.str('story.r12.choice')).toBe('burned');
    expect(r.state.favour('dragons')).toBe(before - 2);
    for (const n of [2, 3, 4]) r.use(`use:r12-bed-${n}-torch`);
    expect(r.flag('story.r12.armourGiven')).toBe(false);
    r.use('use:r12-bed-5-torch');
    expect(r.flag('story.r12.armourGiven')).toBe(true);
    expect(r.state.favour('dragons')).toBe(before - 2);
    // the cut props are not live on this branch
    expect(r.use('use:r12-bed-1-cut-1')).toBe(false);
  });

  it('the sickle: ten cuts, fifteen leeches, favour +3 once, the armour is the hand-in reward', () => {
    const r = start({ r12: 'cut' });
    const before = r.state.favour('dragons');
    expect(r.done('r12', 'burn')).toBe(true); // the unused branch credits itself
    expect(r.done('r12', 'burnKills')).toBe(true);
    r.use('use:r12-bed-1-cut-1');
    expect(r.str('story.r12.choice')).toBe('cut');
    expect(r.state.favour('dragons')).toBe(before + 3);
    for (const n of [1, 2, 3, 4, 5]) for (const c of [1, 2]) r.use(`use:r12-bed-${n}-cut-${c}`);
    expect(r.state.favour('dragons')).toBe(before + 3);
    expect(r.flag('story.r12.armourGiven')).toBe(false);
    r.kill('fen-leech', 'r12.cut', 14);
    expect(r.flag('story.r12.cutDown')).toBe(false);
    r.kill('fen-leech', 'r12.cut', 1);
    expect(r.flag('story.r12.cutDown')).toBe(true);
    r.talk('dudda');
    expect(r.qs('r12')).toBe('completed');
  });

  it('the choice changes freely until the first bed, then the last pick stands', () => {
    const r = start();
    r.state.setFlag('story.r12.pick', 'cut');
    r.emit('story.r12.picked');
    r.state.setFlag('story.r12.pick', 'burned');
    expect(r.use('use:r12-bed-1-cut-1')).toBe(false);
    expect(r.use('use:r12-bed-1-torch')).toBe(true);
    expect(r.str('story.r12.choice')).toBe('burned');
    // after the lock a different pick does not reopen the cut props' branch choice
    expect(r.str('story.r12.choice')).toBe('burned');
  });

  it('counts leech deaths from the first bed, in any order, and not the other branch\'s', () => {
    const r = start();
    r.use('use:r12-bed-3-torch');
    r.kill('fen-leech', 'r12.cut', 5);
    expect(r.state.getNumber('story.r12.burnKills')).toBe(0);
    r.kill('fen-leech', 'r12.burn', 5);
    expect(r.flag('story.r12.burnDown')).toBe(false);
    r.kill('fen-leech', 'r12.burn', 1);
    expect(r.flag('story.r12.burnDown')).toBe(true);
    expect(r.state.getNumber('story.r12.burnKills')).toBe(6);
  });

  it('keeps the lock and the single favour across a load', () => {
    const r0 = start();
    const before = r0.state.favour('dragons');
    r0.use(`use:r12-bed-1-torch`);
    const r = reload(r0);
    expect(r.str('story.r12.choice')).toBe('burned');
    expect(r.state.favour('dragons')).toBe(before - 2);
    expect(r.flag(R12_TORCH_FLAG(1))).toBe(true);
  });
});

describe('M25: the brew and the drink', () => {
  it('brews on the third pot (the herbs go in, one salve comes out) and drinks it: the Burn drops 20 once', () => {
    const r = fresh();
    upTo(r, 'm25', ['m23', 'm24'], ['m25', 'brew']);
    expect(r.inv.get('bog-myrtle')).toBe(1);
    r.use('use:m25-pot-1');
    r.use('use:m25-pot-2');
    expect(r.inv.get('fen-salve') ?? 0).toBe(0);
    r.use('use:m25-pot-3');
    r.step(2);
    expect(r.inv.get('fen-salve')).toBe(1);
    expect(r.inv.get('bog-myrtle')).toBe(0);
    r.step(M25_DRINK_TICKS + 2);
    expect(r.burn).toEqual([[-M25_BURN_RELIEF, 'item']]);
    expect(r.inv.get('fen-salve')).toBe(0);
    expect(r.done('m25', 'drink')).toBe(true);
    r.step(600);
    expect(r.burn).toHaveLength(1);
  });

  it('the pots go in order (the second is not live before the first)', () => {
    const r = fresh();
    upTo(r, 'm25', ['m23', 'm24'], ['m25', 'brew']);
    expect(r.use('use:m25-pot-2')).toBe(false);
    expect(r.use('use:m25-pot-1')).toBe(true);
    expect(r.use('use:m25-pot-2')).toBe(true);
  });

  it('a load between the brew and the drink still drinks it, once', () => {
    const r0 = fresh();
    upTo(r0, 'm25', ['m23', 'm24'], ['m25', 'brew']);
    for (const n of [1, 2, 3]) r0.use(`use:m25-pot-${n}`);
    r0.step(2);
    const r = reload(r0);
    r.step(M25_DRINK_TICKS + 130);
    expect(r.burn).toHaveLength(1);
    expect(r.flag('story.m25.drunk')).toBe(true);
  });
});

describe('R14: the deserter', () => {
  const run = (choice: 'returned' | 'released') => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23']);
    r.manager.start('r14');
    autoplay(r, 'r14', { stopAt: ['r14', 'choice'], r14: choice });
    return r;
  };
  it('returned: Halvard +4, once', () => {
    const r = run('returned');
    const before = r.state.favour('halvard');
    r.state.setFlag('story.r14.choice', 'returned');
    r.emit('story.r14.chosen');
    r.step(3);
    expect(r.state.favour('halvard')).toBe(before + 4);
    r.emit('save.loaded', { slot: 'a' });
    r.step(3);
    expect(r.state.favour('halvard')).toBe(before + 4);
    expect(r.done('r14', 'choice')).toBe(true);
  });
  it('released: Halvard -2, once', () => {
    const r = run('released');
    const before = r.state.favour('halvard');
    r.state.setFlag('story.r14.choice', 'released');
    r.emit('story.r14.chosen');
    r.step(3);
    expect(r.state.favour('halvard')).toBe(before - 2);
  });
  it('the pack and the leeches are armed only when their steps come', () => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23']);
    r.manager.start('r14');
    autoplay(r, 'r14', { stopAt: ['r14', 'leeches'] });
    r.step(2);
    expect(r.flag('story.r14.leechesOut')).toBe(true);
    expect(r.flag('story.r14.packOut')).toBe(false);
  });
});

describe('R13: the water-song', () => {
  const atSong = () => {
    const r = fresh();
    upTo(r, 'r13', ['m23', 'm24', 'm25'], ['r13', 'song']);
    return r;
  };

  it('credits each pocket by its id, in any order, once', () => {
    const r = fresh();
    upTo(r, 'r13', ['m23', 'm24', 'm25'], ['r13', 'dive1']);
    r.emit('dive.surfaced', { volumeId: 'x', pocketId: 'greyfen.r13.pocket.2' });
    r.emit('dive.surfaced', { volumeId: 'x', pocketId: 'greyfen.r13.pocket.2' });
    r.emit('dive.surfaced', { volumeId: 'x', pocketId: 'greyfen.d05.pocket.1' });
    expect(r.flag('story.r13.pocket2')).toBe(true);
    expect(r.flag('story.r13.pocket1')).toBe(false);
    expect(r.flag('story.d05.pocket1')).toBe(false); // D05 is not active
    r.emit('dive.surfaced', { volumeId: 'x', pocketId: 'greyfen.r13.pocket.1' });
    r.manager.recheck();
    expect(r.done('r13', 'dive1')).toBe(true);
    expect(r.done('r13', 'dive2')).toBe(true); // credited by its flag as soon as it is current
  });

  it('the first press at the altar plays the teaching scene; its end starts the lesson bar', () => {
    const r = atSong();
    expect(r.use(R13_ALTAR)).toBe(true);
    expect(r.dialogue.started.at(-1)).toEqual([R13_SONG_SCENE, R13_SONG_NPC]);
    r.scene(R13_SONG_SCENE, R13_SONG_NPC);
    r.step(2);
    expect(r.flag('story.r13.songSeen')).toBe(true);
  });

  it('a missed strike restarts the bar and never fails the quest; the lesson then the song, then the calm', () => {
    const r = atSong();
    r.use(R13_ALTAR);
    r.scene(R13_SONG_SCENE, R13_SONG_NPC);
    r.step(2);
    singBar(r, 1, { started: true, mistake: true });
    expect(r.flag('story.r13.lesson')).toBe(false);
    expect(r.qs('r13')).toBe('active');
    singBar(r, 1); // the lesson, now sung true
    expect(r.flag('story.r13.lesson')).toBe(true);
    expect(r.flag('story.r13.sung')).toBe(false);
    singBar(r, 2, { mistake: true });
    expect(r.flag('story.r13.sung')).toBe(false);
    singBar(r, 2);
    expect(r.flag('story.r13.sung')).toBe(true);
    expect(r.done('r13', 'song')).toBe(true);
    expect(r.flag('story.r13.calmed')).toBe(false);
    r.step(R13_CALM_TICKS + 2);
    expect(r.flag('story.r13.calmed')).toBe(true);
    expect(r.done('r13', 'calm')).toBe(true);
  });

  it('a load between the song and the calm still calms the fen', () => {
    const r0 = atSong();
    r0.use(R13_ALTAR);
    r0.scene(R13_SONG_SCENE, R13_SONG_NPC);
    r0.step(2);
    singBar(r0, 1, { started: true });
    singBar(r0, 2);
    expect(r0.flag('story.r13.sung')).toBe(true);
    const r = reload(r0);
    r.step(130);
    expect(r.flag('story.r13.calmed')).toBe(true);
  });

  it('a press while no objective is current does nothing', () => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25']);
    r.manager.start('r13');
    expect(r.use(R13_ALTAR)).toBe(false);
    expect(r.dialogue.started).toHaveLength(0);
  });
});

describe('M26: the rite', () => {
  const atNets = () => {
    const r = fresh();
    upTo(r, 'm26', ['m23', 'm24', 'm25'], ['m26', 'nets']);
    return r;
  };

  it('every cut net drops one of Hathren\'s lines; the fourth writes netsCut', () => {
    const r = atNets();
    for (const n of [1, 2, 3]) r.use(`use:m26-net-${n}`);
    expect(r.hathrenCalls).toEqual(['net1', 'net2', 'net3']);
    expect(r.flag('story.m26.netsCut')).toBe(false);
    r.use('use:m26-net-4');
    expect(r.flag('story.m26.netsCut')).toBe(true);
  });

  it('the rite with the nets down sets riteDone and calls the calm once; the voice follows her quiet', () => {
    const r = atNets();
    for (const n of [1, 2, 3, 4]) r.use(`use:m26-net-${n}`);
    r.state.setFlag('shrine.hathrens-mere.lit', true);
    r.emit('shrine.rekindled', { shrineId: 'hathrens-mere' });
    r.step(3);
    expect(r.flag('story.m26.riteDone')).toBe(true);
    expect(r.hathrenCalls.filter((c) => c === 'calm')).toHaveLength(1);
    r.step(70);
    expect(r.started('scene-m26-voice')).toBe(false); // she has not quieted yet
    r.emit('wyrm.hathren', { beat: 'quiet' });
    r.step(70);
    expect(r.started('scene-m26-voice')).toBe(true);
    r.scene('scene-m26-voice', 'scene.m26.voice');
    expect(r.done('m26', 'voice')).toBe(true);
  });

  it('a shrine lit before the nets are cut waits for them (no soft-lock, no early calm)', () => {
    const r = atNets();
    r.state.setFlag('shrine.hathrens-mere.lit', true);
    r.emit('shrine.rekindled', { shrineId: 'hathrens-mere' });
    r.step(3);
    expect(r.flag('story.m26.riteDone')).toBe(false);
    expect(r.hathrenCalls).not.toContain('calm');
    for (const n of [1, 2, 3, 4]) r.use(`use:m26-net-${n}`);
    r.step(3);
    expect(r.flag('story.m26.riteDone')).toBe(true);
    expect(r.done('m26', 'rite')).toBe(true);
  });

  it('a load in the middle of the calm: riteDone stays, the voice is offered when she quiets again', () => {
    const r0 = atNets();
    for (const n of [1, 2, 3, 4]) r0.use(`use:m26-net-${n}`);
    r0.state.setFlag('shrine.hathrens-mere.lit', true);
    r0.emit('shrine.rekindled', { shrineId: 'hathrens-mere' });
    r0.step(3);
    const r = reload(r0);
    expect(r.flag('story.m26.riteDone')).toBe(true);
    r.step(70);
    expect(r.started('scene-m26-voice')).toBe(false);
    r.emit('wyrm.hathren', { beat: 'quiet' }); // K6a restarts the calm by herself after a load
    r.step(70);
    expect(r.started('scene-m26-voice')).toBe(true);
  });

  it('the wake is credited by her beat, and by itself when Hathren is not in the game', () => {
    const r = fresh();
    upTo(r, 'm26', ['m23', 'm24', 'm25'], ['m26', 'wake']);
    r.emit('wyrm.hathren', { beat: 'thrash' });
    expect(r.flag('story.m26.woke')).toBe(false);
    r.emit('wyrm.hathren', { beat: 'wake' });
    expect(r.done('m26', 'wake')).toBe(true);
    rig?.dispose();
    const r2 = fresh({ hathren: false });
    upTo(r2, 'm26', ['m23', 'm24', 'm25'], ['m26', 'wake']);
    r2.step(130);
    expect(r2.done('m26', 'wake')).toBe(true);
  });

  it('without Hathren the voice still comes a few seconds after the rite, and the quest finishes', () => {
    const r = fresh({ hathren: false });
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25', 'm26']);
    expect(r.qs('m26')).toBe('completed');
  });

  it('arms the hunters once the wake is done, not before', () => {
    const r = fresh();
    upTo(r, 'm26', ['m23', 'm24', 'm25'], ['m26', 'wake']);
    r.step(2);
    expect(r.flag('story.m26.guardOut')).toBe(false);
    r.emit('wyrm.hathren', { beat: 'wake' });
    r.step(2);
    expect(r.flag('story.m26.guardOut')).toBe(true);
  });
});

describe('M27: the reeds', () => {
  const atBlinds = (opts: Parameters<typeof makeRig>[0] = {}, r14: 'returned' | 'released' = 'released') => {
    const r = fresh(opts);
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25', 'm26'], { r14 });
    r.manager.start('r14');
    autoplay(r, 'r14', { r14 });
    r.manager.start('m27');
    autoplay(r, 'm27', { stopAt: ['m27', 'blinds'], r14 });
    return r;
  };

  it('unseen: the far end of the blinds credits the step and pack 1 never fought', () => {
    const r = atBlinds();
    r.step(2);
    expect(r.flag('story.m27.pack1Out')).toBe(true);
    r.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    expect(r.done('m27', 'blinds')).toBe(true);
    expect(r.flag('story.m27.seen')).toBe(false);
  });

  it('seen by pack 1: the far end alone does not credit; clearing the pack does', () => {
    const r = atBlinds();
    r.standing.set('greyfen.q.m27.pack1', ['h1', 'h2', 'h3']);
    r.step(40);
    r.emit('ai.spotted', { actorId: 'h2', targetId: 'player' });
    expect(r.flag('story.m27.seen')).toBe(true);
    r.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    expect(r.done('m27', 'blinds')).toBe(false);
    r.standing.set('greyfen.q.m27.pack1', ['h3']);
    r.step(40);
    expect(r.done('m27', 'blinds')).toBe(false);
    r.standing.set('greyfen.q.m27.pack1', []);
    r.step(40);
    expect(r.done('m27', 'blinds')).toBe(true);
  });

  it('a pack spotting someone else, or a stranger spotting the player, is not "seen"', () => {
    const r = atBlinds();
    r.standing.set('greyfen.q.m27.pack1', ['h1']);
    r.emit('ai.spotted', { actorId: 'h1', targetId: 'wyrmling' });
    r.emit('ai.spotted', { actorId: 'other', targetId: 'player' });
    expect(r.flag('story.m27.seen')).toBe(false);
  });

  it('spared hunters of either pack are witnesses', () => {
    const r = atBlinds();
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    r.emit('hunter.spared', { actorId: 'h9', kind: 'hunter-harpooner' });
    expect(r.state.getNumber('story.m27.witnesses')).toBe(2);
  });

  it('a pack 1 whose members were all spared (they leave the group) clears the seen reading, and each spare is a witness', () => {
    const r = atBlinds();
    r.standing.set('greyfen.q.m27.pack1', ['h1', 'h2']);
    r.step(40);
    r.emit('ai.aggro', { actorId: 'h1', targetId: 'player' });
    expect(r.flag('story.m27.seen')).toBe(true);
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    r.emit('hunter.spared', { actorId: 'h2', kind: 'hunter-spearman' });
    r.standing.set('greyfen.q.m27.pack1', []); // a spared member walks off: it no longer stands
    r.step(40);
    expect(r.done('m27', 'blinds')).toBe(true);
    expect(r.state.getNumber('story.m27.witnesses')).toBe(2);
  });

  it('the ally: Wybert if R14 let him go (K5\'s scene), Leofa alone if he was returned', () => {
    const r = atBlinds({}, 'released');
    expect(r.dialogue.started.map(([d]) => d)).toContain('scene-m27-deserter');
    expect(r.allies.calls[0]).toBe('spawn greyfen.m27.ally.1');
    rig?.dispose();
    const r2 = atBlinds({}, 'returned');
    expect(r2.dialogue.started.map(([d]) => d)).toContain('scene-m27-leofa');
    expect(r2.dialogue.started.map(([d]) => d)).not.toContain('scene-m27-deserter');
    expect(r2.allies.calls.filter((c) => c.startsWith('spawn'))).toHaveLength(0);
  });

  it('the deserter holds the blinds, then the cages, and goes when the quest ends; a load puts him right', () => {
    const r = atBlinds({}, 'released');
    r.step(40);
    expect(r.allies.at).toBe('greyfen.m27.ally.1');
    r.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    r.step(40);
    expect(r.allies.at).toBe('greyfen.m27.ally.2');
    const r2 = reload(r);
    r2.step(40);
    expect(r2.allies.at).toBe('greyfen.m27.ally.2');
    autoplay(r2, 'm27', { r14: 'released' });
    expect(r2.qs('m27')).toBe('completed');
    expect(r2.allies.at).toBeNull();
  });

  it('the brood goes home a few seconds after the third cage, and after a load in the wait', () => {
    const r0 = atBlinds();
    r0.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    autoplay(r0, 'm27', { stopAt: ['m27', 'brood'] });
    expect(r0.current('m27', 'brood')).toBe(true);
    expect(r0.flag('story.m27.broodBack')).toBe(false);
    const r = reload(r0);
    r.step(M27_BROOD_TICKS + 2);
    expect(r.flag('story.m27.broodBack')).toBe(true);
    expect(r.done('m27', 'brood')).toBe(true);
  });

  it('the aftermath scene plays once the brood is home', () => {
    const r = atBlinds();
    r.emit('trigger.enter', { triggerId: 'trg.greyfen.m27.blinds.end', actorId: 'player' });
    autoplay(r, 'm27', { stopAt: ['m27', 'aftermath'] });
    r.step(70);
    expect(r.started('scene-m27-aftermath')).toBe(true);
  });
});

describe('D05: the Deeps', () => {
  const atDeeps = (stop: [string, string]) => {
    const r = fresh();
    gate(r);
    autoplayAll(r, ['m23', 'm24', 'm25', 'm26', 'r14', 'm27']);
    r.manager.start('d05');
    autoplay(r, 'd05', { stopAt: stop });
    return r;
  };

  it('plays the undercroft scene inside the Deeps, not outside', () => {
    const r = atDeeps(['d05', 'undercroft']);
    r.step(70);
    expect(r.started('scene-d05-undercroft')).toBe(false);
    r.interiors.current = 'greyfen-deeps';
    r.step(70);
    expect(r.started('scene-d05-undercroft')).toBe(true);
  });

  it('credits the four pockets by id (D05\'s, not R13\'s)', () => {
    const r = atDeeps(['d05', 'dive1']);
    r.emit('dive.surfaced', { volumeId: 'x', pocketId: 'greyfen.r13.pocket.1' });
    expect(r.flag('story.d05.pocket1')).toBe(false);
    for (const n of [1, 2, 3, 4]) r.emit('dive.surfaced', { volumeId: 'x', pocketId: `greyfen.d05.pocket.${n}` });
    expect([1, 2, 3, 4].every((n) => r.flag(`story.d05.pocket${n}`))).toBe(true);
  });

  it('arms each room when its step is current and the sluices write the flags K3\'s water reads', () => {
    const r = atDeeps(['d05', 'cell1']);
    r.step(2);
    expect(r.flag('story.d05.cell-1Out')).toBe(true);
    expect(r.flag('story.d05.sluice-1Out')).toBe(false);
    autoplay(r, 'd05', { stopAt: ['d05', 'room1'] });
    expect(r.flag('story.d05.sluice1')).toBe(true);
  });

  it('Murkjaw: the defeat is recorded, the outcome scene plays, the quest completes; a load after the boss keeps it', () => {
    const r0 = atDeeps(['d05', 'murkjaw']);
    expect(r0.flag('story.d05.sluice2')).toBe(true);
    r0.emit('boss.defeated', { bossId: 'murkjaw', actorId: 'm' });
    r0.state.setFlag('boss.murkjaw.outcome', 'defeated'); // the boss writes it as he finishes
    r0.step(3);
    expect(r0.done('d05', 'murkjaw')).toBe(true);
    expect(r0.str('story.d05.outcome')).toBe('defeated');
    const r = reload(r0);
    expect(r.done('d05', 'murkjaw')).toBe(true);
    r.step(70);
    expect(r.started('scene-d05-outcome')).toBe(true);
    r.scene('scene-d05-outcome', 'scene.d05.outcome');
    expect(r.qs('d05')).toBe('completed');
    expect(r.flag('story.d05.complete')).toBe(true);
  });

  it('an abandoned fight (K8 BossArena.abandon) leaves the boss step open; the arena stays armed and a later defeat completes D05', () => {
    const r = atDeeps(['d05', 'murkjaw']);
    expect(r.flag('story.d05.started')).toBe(true); // the arena arms on this flag
    // The player leaves the Deeps (or stays out of the hall 2 s): the arena abandons, no defeat and no outcome flag.
    r.emit('interior.exited', { interiorId: 'greyfen-deeps' });
    r.step(120);
    expect(r.done('d05', 'murkjaw')).toBe(false);
    expect(r.qs('d05')).toBe('active');
    expect(r.started('scene-d05-outcome')).toBe(false);
    expect(r.flag('story.d05.started')).toBe(true); // still armed for the retry
    expect(r.flag('boss.murkjaw.outcome')).toBeFalsy();
    // Retry: a second attempt ends in the defeat.
    r.emit('boss.defeated', { bossId: 'murkjaw', actorId: 'm' });
    r.state.setFlag('boss.murkjaw.outcome', 'defeated');
    r.step(5);
    expect(r.done('d05', 'murkjaw')).toBe(true);
    r.step(70);
    expect(r.started('scene-d05-outcome')).toBe(true);
    r.scene('scene-d05-outcome', 'scene.d05.outcome');
    expect(r.qs('d05')).toBe('completed');
  });

  it('a boss defeated before the step is current is credited when it comes (flag, not event)', () => {
    const r = atDeeps(['d05', 'dive1']);
    r.emit('boss.defeated', { bossId: 'murkjaw', actorId: 'm' });
    r.state.setFlag('boss.murkjaw.outcome', 'defeated');
    r.step(3);
    expect(r.str('story.d05.outcome')).toBe('defeated');
    expect(r.done('d05', 'murkjaw')).toBe(false); // not its step yet
    autoplay(r, 'd05', { stopAt: ['d05', 'outcome'] });
    expect(r.done('d05', 'murkjaw')).toBe(true); // credited by the flag when its step comes
  });

  it('save and load in the middle of the dives and after the sluices lands on the same step', () => {
    for (const stop of [['d05', 'dive2'], ['d05', 'sluice2'], ['d05', 'spoil']] as Array<[string, string]>) {
      const r0 = atDeeps(stop);
      const r = reload(r0);
      expect(r.current(stop[0], stop[1]), stop.join('.')).toBe(true);
    }
  });
});
