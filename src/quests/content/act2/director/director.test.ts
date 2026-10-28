// The Cinderreach director against stub services on the real event bus and the real flag store: each rule fires from the
// event the game raises, writes what the other threads read, and rebuilds itself from the flags on a load.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../core/EventBus';
import type { GameContext } from '../../../../core/Game';
import type { GameEventMap } from '../../../../core/events';
import { Services } from '../../../../core/Services';
import { WorldState } from '../../../../state/WorldState';
import type { QuestState } from '../../../types';
import { SPEECH_NPC } from './m11';
import plugin, { ACT2_QUEST_IDS } from './cinderreachDirector.plugin';
import { MURAL_NPC } from './m14m15';

type Fn = (...a: any[]) => any;

interface Rig {
  events: EventBus<GameEventMap>;
  state: WorldState;
  calls: Array<[string, ...unknown[]]>;
  quest: Map<string, QuestState>;
  done: Set<string>;
  current: Set<string>;
  progress: Map<string, number>;
  alive: Map<string, string[]>;
  /** Triggers the player stands inside (`ctx.triggers.isInside`). */
  inside: Set<string>;
  stubs: Record<string, any>;
  step(n?: number): void;
  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void;
  named(name: string): void;
  active(...ids: string[]): void;
  warn: ReturnType<typeof vi.spyOn>;
  dispose(): void;
}

function rig(opts: { classId?: string; dialogueOpen?: boolean; coreMercy?: boolean } = {}): Rig {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  // core.plugin's own listeners, set up before every other plugin: the creature-mercy credit and its release on despawn.
  if (opts.coreMercy) {
    events.on('mercy', (e) => void state.recordMercy(e));
    events.on('actor.despawned', (e) => state.forgetMercy(e.actorId));
  }
  const inside = new Set<string>();
  const services = new Services();
  const calls: Rig['calls'] = [];
  const rec = (name: string, ret: unknown = true): Fn => (...a) => {
    calls.push([name, ...a]);
    return typeof ret === 'function' ? (ret as Fn)(...a) : ret;
  };
  const quest = new Map<string, QuestState>();
  const done = new Set<string>();
  const current = new Set<string>();
  const progress = new Map<string, number>();
  const alive = new Map<string, string[]>();
  let escortActive: { id: string; phase: string } | null = null;
  const stubs: Record<string, any> = {
    quests: {
      state: (id: string) => quest.get(id) ?? 'inactive',
      objectiveDone: (q: string, o: string) => done.has(`${q}.${o}`),
      isObjectiveCurrent: (q: string, o: string) => current.has(`${q}.${o}`),
      objectives: (q: string) => [...progress.entries()].filter(([k]) => k.startsWith(`${q}.`)).map(([k, p]) => ({ def: { id: k.split('.')[1] }, progress: p, done: false, current: false })),
    },
    dialogue: { start: rec('dialogue.start', () => !opts.dialogueOpen) },
    escort: {
      start: rec('escort.start', (o: { id: string }) => { escortActive = { id: o.id, phase: 'riding' }; return true; }),
      active: () => escortActive,
      dismount: rec('escort.dismount', () => { if (escortActive) escortActive.phase = 'dismounting'; return Promise.resolve(); }),
      stop: rec('escort.stop', () => { escortActive = null; return true; }),
    },
    enemies: {
      spawnGroup: rec('enemies.spawnGroup', (id: string) => { alive.set(id, [`${id}#1`, `${id}#2`, `${id}#3`]); return alive.get(id)!; }),
      despawnGroup: rec('enemies.despawnGroup', (id: string) => void alive.delete(id)),
      alive: (id: string) => alive.get(id) ?? [],
    },
    waves: { start: rec('waves.start', true) },
    classes: { current: () => opts.classId ?? 'knight' },
    herd: { start: rec('herd.start'), follow: rec('herd.follow'), stop: rec('herd.stop'), count: vi.fn(() => 0) },
    foxes: { guide: rec('foxes.guide') },
    trials: { start: rec('trials.start') },
    wyrms: { tether: rec('wyrms.tether', (id: string) => () => void calls.push(['wyrms.untether', id])), unchain: rec('wyrms.unchain'), flyAway: rec('wyrms.flyAway') },
    foxFire: { apply: rec('foxFire.apply') },
    inventory: { add: rec('inventory.add', 1) },
  };
  for (const [k, v] of Object.entries(stubs)) services.provide(k as never, v as never);
  let tickSystem: { fixedUpdate(dt: number): void } | null = null;
  const ctx = {
    events, state, services,
    anchors: { find: () => undefined },
    triggers: { add: () => () => {}, isInside: (id: string) => inside.has(id) },
    player: { feet: { x: 0, y: 7, z: 0 }, actor: { id: 'player' } },
    systems: { add: (s: { fixedUpdate(dt: number): void }) => { tickSystem = s; return () => {}; } },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  plugin.setup(ctx);
  return {
    events, state, calls, quest, done, current, progress, alive, inside, stubs, warn,
    step: (n = 1) => { for (let i = 0; i < n; i++) tickSystem!.fixedUpdate(1 / 60); },
    emit: (type, payload) => events.emit(type, payload),
    named: (name) => events.emit(name as keyof GameEventMap, {} as never),
    active: (...ids) => ids.forEach((id) => quest.set(id, 'active')),
    dispose: () => plugin.dispose?.(),
  };
}

const called = (r: Rig, name: string): unknown[][] => r.calls.filter((c) => c[0] === name).map((c) => c.slice(1));
let r: Rig;
beforeEach(() => {
  vi.restoreAllMocks();
});
const objective = (q: string, o: string) => ({ questId: q, objectiveId: o, progress: 1, required: 1, done: true });

describe('director: every quest', () => {
  it('writes story.<id>.complete when one of the ten completes, and only for them', () => {
    r = rig();
    for (const id of ACT2_QUEST_IDS) {
      expect(r.state.getBool(`story.${id}.complete`)).toBe(false);
      r.emit('quest.completed', { questId: id });
      expect(r.state.getBool(`story.${id}.complete`), id).toBe(true);
    }
    r.emit('quest.completed', { questId: 'm10' });
    expect(r.state.getFlag('story.m10.complete')).toBeUndefined();
    r.dispose();
  });

  it('re-derives the complete flags on a load (a flag lost, a quest completed)', () => {
    r = rig();
    r.quest.set('r05', 'completed');
    r.emit('save.loaded', { slot: 'a' });
    expect(r.state.getBool('story.r05.complete')).toBe(true);
    expect(r.state.getBool('story.r06.complete')).toBe(false);
    r.dispose();
  });

  it('the Fox-Fire Ember lights the Dell fire; another item does not', () => {
    r = rig();
    r.emit('item.used', { itemId: 'maud-remedy' });
    expect(called(r, 'foxFire.apply')).toHaveLength(0);
    r.emit('item.used', { itemId: 'fox-fire-ember' });
    expect(called(r, 'foxFire.apply')).toHaveLength(1);
    r.dispose();
  });

  it('dispose removes every listener', () => {
    r = rig();
    r.dispose();
    r.emit('quest.completed', { questId: 'm11' });
    expect(r.state.getBool('story.m11.complete')).toBe(false);
  });
});

describe('director: M11 Road of Cinders', () => {
  it('the banner starts the ride-out dialogue and the escort with two riders on a road route', () => {
    r = rig();
    r.active('m11');
    r.emit('quest.objective', objective('m11', 'banner'));
    r.step();
    expect(r.state.getBool('story.m11.rideout')).toBe(true);
    expect(called(r, 'dialogue.start')).toEqual([['npc-gaut', 'gaut']]);
    const [opts] = called(r, 'escort.start')[0] as [{ id: string; riders: number; route: Array<{ x: number; y: number; z: number }> }];
    expect(opts.id).toBe('m11');
    expect(opts.riders).toBe(2);
    expect(opts.route.length).toBeGreaterThan(10);
    expect(opts.route.every((p) => p.y === 7)).toBe(true);
    r.dispose();
  });

  it('ignores other objectives, other quests and an escort already running', () => {
    r = rig();
    r.active('m11');
    r.emit('quest.objective', objective('m11', 'brief'));
    r.emit('quest.objective', objective('m12', 'banner'));
    r.step();
    expect(called(r, 'escort.start')).toHaveLength(0);
    r.emit('quest.objective', objective('m11', 'banner'));
    r.step();
    r.done.add('m11.banner');
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'escort.start')).toHaveLength(1); // still riding: no second start
    r.dispose();
  });

  it('a load on the road restarts the escort; after the ring it does not', () => {
    r = rig();
    r.active('m11');
    r.done.add('m11.banner');
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'escort.start')).toHaveLength(1);
    r.dispose();
    r = rig();
    r.active('m11');
    r.done.add('m11.banner');
    r.done.add('m11.ring');
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'escort.start')).toHaveLength(0);
    r.dispose();
  });

  it('banters once per stage, in order, only on the ride', () => {
    r = rig();
    r.active('m11');
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.stage.1', actorId: 'player' });
    r.step();
    expect(called(r, 'dialogue.start')).toHaveLength(0); // no escort running
    r.emit('quest.objective', objective('m11', 'banner'));
    r.step();
    const before = called(r, 'dialogue.start').length;
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.stage.2', actorId: 'player' });
    r.step();
    expect(r.state.getFlag('story.m11.stage')).toBe(2);
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.stage.1', actorId: 'player' });
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.stage.2', actorId: 'player' });
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.stage.3', actorId: 'someone-else' });
    r.step();
    expect(called(r, 'dialogue.start')).toHaveLength(before + 1);
    expect(r.state.getFlag('story.m11.stageSeen')).toBe(2);
    r.dispose();
  });

  it('retries the banter when another dialogue is open', () => {
    r = rig({ dialogueOpen: true });
    r.active('m11');
    r.emit('quest.objective', objective('m11', 'banner'));
    r.step(2);
    expect(called(r, 'dialogue.start').length).toBeGreaterThanOrEqual(2); // asked, then asked again next tick
    r.dispose();
  });

  it('the ring dismounts the column once, then the first Footmen group comes out; the second after three kills', () => {
    r = rig();
    r.active('m11');
    r.emit('quest.objective', objective('m11', 'banner'));
    r.step();
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.ring', actorId: 'player' });
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.m11.ring', actorId: 'player' });
    expect(called(r, 'escort.dismount')).toHaveLength(1); // the second entry finds the column already dismounting
    r.emit('escort.dismounted', { escortId: 'm11' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.m11.ambush-1']]);
    r.progress.set('m11.ambush', 3);
    r.alive.delete('q12.m11.ambush-1');
    r.emit('actor.died', { actorId: 'x', killerId: 'player', kind: 'blighted-soldier', team: 'foe', level: 1, spawnTag: 'm11.ambush' } as never);
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.m11.ambush-1'], ['q12.m11.ambush-2']]);
    r.dispose();
  });

  it('does not bring the second group while the first still stands, or after the sixth kill', () => {
    r = rig();
    r.active('m11');
    r.alive.set('q12.m11.ambush-1', ['a']);
    r.progress.set('m11.ambush', 3);
    r.emit('actor.died', { actorId: 'x', spawnTag: 'm11.ambush' } as never);
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(0);
    r.alive.clear();
    r.progress.set('m11.ambush', 6);
    r.emit('actor.died', { actorId: 'x', spawnTag: 'm11.ambush' } as never);
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(0);
    r.dispose();
  });

  it('a load mid-ambush refills the group the kill count says', () => {
    r = rig();
    r.active('m11');
    r.done.add('m11.ring');
    r.progress.set('m11.ambush', 1);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.m11.ambush-1']]);
    r.progress.set('m11.ambush', 4);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.m11.ambush-2']);
    r.dispose();
  });

  it('the first bloom wakes the wraiths, and the end of the quest stops the escort', () => {
    r = rig();
    r.active('m11');
    r.emit('interact', { interactableId: 'use:m11-bloom-2', kind: 'prop', actorId: 'player', action: 'interact' });
    expect(r.state.getBool('story.m11.bloomHit')).toBe(true);
    r.emit('quest.completed', { questId: 'm11' });
    expect(called(r, 'escort.stop')).toHaveLength(1);
    r.dispose();
  });

  describe('the stone speech (review-fixes-review F1, F5)', () => {
    const speech = [['npc-gaut', SPEECH_NPC]];
    const lit = (): void => {
      r.state.setFlag('waystone.cinder-road.lit', true);
      r.emit('waystone.rekindled', { waystoneId: 'cinder-road', cause: 'player' });
    };

    it('lit after the ambush: plays at once, under its own npc id, not as gaut', () => {
      r = rig();
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step();
      expect(r.state.getBool('story.m11.speech')).toBe(true);
      expect(called(r, 'dialogue.start')).toEqual(speech);
      expect(SPEECH_NPC).not.toBe('gaut');
      r.dispose();
    });

    it('lit during the ambush: silent mid-fight, plays when the ambush is done', () => {
      r = rig();
      r.active('m11');
      lit();
      r.step(3);
      expect(called(r, 'dialogue.start')).toHaveLength(0);
      expect(r.state.getFlag('story.m11.speech')).toBeUndefined();
      r.done.add('m11.ambush');
      r.emit('quest.objective', objective('m11', 'ambush'));
      r.step();
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.dispose();
    });

    it('lit before M11 started: plays once the ambush is done', () => {
      r = rig();
      r.state.setFlag('waystone.cinder-road.lit', true);
      r.active('m11');
      r.step(3);
      expect(called(r, 'dialogue.start')).toHaveLength(0);
      r.done.add('m11.ambush');
      r.emit('quest.objective', objective('m11', 'ambush'));
      r.step();
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.dispose();
    });

    it('plays once only, also across a load, and leaves the report talk to gaut', () => {
      r = rig();
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step();
      r.state.clearFlag('story.m11.speech'); // the last line's effect
      r.emit('save.loaded', { slot: 'a' });
      lit();
      r.emit('quest.objective', objective('m11', 'ambush'));
      r.step(3);
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.dispose();
    });

    it('a load in the middle of the speech plays it again', () => {
      r = rig();
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step();
      r.emit('save.loaded', { slot: 'a' }); // flag still set: the speech never finished
      r.step(2);
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.dispose();
    });

    it('a speech cut short by death does not reopen over the body, then plays once after the respawn (review finding 1)', () => {
      r = rig();
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step();
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.emit('dialogue.ended', { dialogueId: 'npc-gaut', npcId: SPEECH_NPC, reason: 'death' });
      r.step(30);
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.emit('ui.modal', { id: 'journal', open: false }); // other wake-ups stay quiet too
      r.step(2);
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.emit('player.respawned', { source: 'test' });
      r.step(3);
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.emit('player.respawned', { source: 'test' });
      r.step(3);
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.dispose();
    });

    it('a speech closed by a script re-arms at once; a completed one does not replay', () => {
      r = rig();
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step();
      r.emit('dialogue.ended', { dialogueId: 'npc-gaut', npcId: SPEECH_NPC, reason: 'script' });
      r.step(2);
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.emit('dialogue.ended', { dialogueId: 'npc-gaut', npcId: SPEECH_NPC, reason: 'completed' });
      r.step(5);
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.dispose();
    });

    it('a load close leaves the loaded save alone (review finding 3)', () => {
      r = rig();
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step();
      r.state.clearFlag('story.m11.speech'); // the loaded save: played to the end, flag cleared by its last line
      r.emit('save.loaded', { slot: 'a' });
      r.emit('dialogue.ended', { dialogueId: 'npc-gaut', npcId: SPEECH_NPC, reason: 'load' });
      r.step(3);
      expect(r.state.getBool('story.m11.speechDone')).toBe(true);
      expect(called(r, 'dialogue.start')).toEqual(speech);
      r.dispose();
    });

    it('a start refused by a menu retries when the menu closes (review F2)', () => {
      const o = { dialogueOpen: true };
      r = rig(o);
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step(30);
      expect(called(r, 'dialogue.start')).toHaveLength(1);
      o.dialogueOpen = false;
      r.emit('ui.modal', { id: 'journal', open: true });
      r.step(2);
      expect(called(r, 'dialogue.start')).toHaveLength(1);
      r.emit('ui.modal', { id: 'journal', open: false });
      r.step(2);
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.dispose();
    });

    it('waits for another dialogue to end, then plays', () => {
      const o = { dialogueOpen: true };
      r = rig(o);
      r.active('m11');
      r.done.add('m11.ambush');
      lit();
      r.step(30);
      expect(called(r, 'dialogue.start')).toHaveLength(1); // refused, and not hammered every tick
      expect(r.state.getFlag('story.m11.speech')).toBeFalsy();
      o.dialogueOpen = false;
      r.emit('dialogue.ended', { dialogueId: 'x', npcId: 'y' });
      r.step();
      expect(called(r, 'dialogue.start')).toEqual([...speech, ...speech]);
      r.dispose();
    });
  });

  it('a different waystone, a mercy on a bloom or an inactive quest does nothing', () => {
    r = rig();
    r.emit('interact', { interactableId: 'use:m11-bloom-1', kind: 'prop', actorId: 'player', action: 'interact' });
    r.emit('waystone.rekindled', { waystoneId: 'cinderford', cause: 'player' });
    r.step();
    expect(r.state.getFlag('story.m11.bloomHit')).toBeUndefined();
    expect(r.state.getFlag('story.m11.speech')).toBeUndefined();
    r.dispose();
  });
});

describe('director: M12 Cinderford Under Siege', () => {
  it('starts the raid when prep is done, once per completion event', () => {
    r = rig();
    r.active('m12');
    r.emit('quest.objective', objective('m12', 'prep'));
    r.step();
    expect(called(r, 'waves.start')).toEqual([['cinderford-raid']]);
    r.dispose();
  });

  it('ignores other objectives and a prep reported undone, and does not start on a load', () => {
    r = rig();
    r.emit('quest.objective', objective('m12', 'raid'));
    r.emit('quest.objective', { ...objective('m12', 'prep'), done: false });
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'waves.start')).toHaveLength(0);
    r.dispose();
  });

  it('warns once when A7 refuses (already running or done)', () => {
    r = rig();
    r.stubs.waves.start = () => false;
    r.emit('quest.objective', objective('m12', 'prep'));
    r.step();
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('raid'));
    r.dispose();
  });
});

describe('director: R06 The Cinderford Well', () => {
  it('mirrors the Emberwright class as a flag, now and on a class change', () => {
    r = rig({ classId: 'emberwright' });
    expect(r.state.getBool('story.r06.emberwright')).toBe(true);
    r.stubs.classes.current = () => 'warden';
    r.emit('class.changed', { classId: 'warden', previous: 'emberwright', free: true, cost: 0 });
    expect(r.state.getBool('story.r06.emberwright')).toBe(false);
    r.stubs.classes.current = () => 'emberwright';
    r.emit('save.loaded', { slot: 'a' });
    expect(r.state.getBool('story.r06.emberwright')).toBe(true);
    r.dispose();
  });

  it('runs the rite as two waves, the second after the first is down, then raises riteDone and clears the hold', () => {
    r = rig();
    r.active('r06');
    r.state.setFlag('story.r06.riteStarted', true);
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.named('story.r06.riteStart');
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.r06.rite-1']]);
    r.alive.delete('q12.r06.rite-1');
    r.emit('actor.died', { actorId: 'x', spawnTag: 'r06.rite' } as never);
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.r06.rite-2']);
    expect(r.state.getFlag('story.r06.riteWave')).toBe(2);
    expect(raised).not.toContain('story.r06.riteDone');
    r.alive.delete('q12.r06.rite-2');
    r.emit('actor.died', { actorId: 'y', spawnTag: 'r06.rite' } as never);
    r.step();
    expect(raised).toContain('story.r06.riteDone');
    expect(r.state.getFlag('story.r06.riteStarted')).toBeUndefined();
    r.dispose();
  });

  it('does not begin the rite twice, or while the quest is not active', () => {
    r = rig();
    r.named('story.r06.riteStart');
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(0);
    r.active('r06');
    r.named('story.r06.riteStart');
    r.named('story.r06.riteStart');
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(1);
    r.dispose();
  });

  it('a wave that still has a wraith standing does not advance the rite', () => {
    r = rig();
    r.active('r06');
    r.state.setFlag('story.r06.riteStarted', true);
    r.named('story.r06.riteStart');
    r.step();
    r.emit('actor.died', { actorId: 'x', spawnTag: 'r06.rite' } as never);
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(1);
    r.dispose();
  });

  it('a load rebuilds the wave the player was in (wave 2 refills wave 2, not wave 1)', () => {
    r = rig();
    r.active('r06');
    r.state.setFlag('story.r06.riteStarted', true);
    r.state.setFlag('story.r06.riteWave', 2);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.r06.rite-2']]);
    r.dispose();
  });

  it('writes the choice flag last, from the branch: sealed or cleansed', () => {
    r = rig();
    r.state.setFlag('story.r06.branch', 'seal');
    expect(r.state.getFlag('story.r06.choice')).toBeUndefined();
    r.emit('quest.completed', { questId: 'r06' });
    expect(r.state.getFlag('story.r06.choice')).toBe('sealed');
    r.dispose();
    r = rig();
    r.state.setFlag('story.r06.branch', 'cleanse');
    r.emit('quest.completed', { questId: 'r06' });
    expect(r.state.getFlag('story.r06.choice')).toBe('cleansed');
    r.dispose();
  });
});

describe('director: R05 Ketta\'s Lost Flock', () => {
  const choose = (c: string) => {
    r.active('r05');
    r.done.add('r05.choice');
    r.state.setFlag('story.r05.choice', c);
    r.named('story.r05.branched');
    r.step();
  };

  it('the safe road starts a flock of eight following the player, and credits the herd at six home', () => {
    r = rig();
    choose('safe');
    const [id, flock, opts] = called(r, 'herd.start')[0] as [string, string[], { fogAnchors: string[] }];
    expect(id).toBe('r05');
    expect(flock).toHaveLength(8);
    expect(opts.fogAnchors).toHaveLength(3);
    expect(called(r, 'herd.follow')).toEqual([['r05', true]]);
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.stubs.herd.count.mockReturnValue(5);
    r.step(30);
    expect(raised).not.toContain('story.r05.herdHome');
    r.stubs.herd.count.mockReturnValue(6);
    r.step(30);
    expect(raised).toContain('story.r05.herdHome');
    expect(r.state.getBool('story.r05.herdHome')).toBe(true);
    expect(called(r, 'herd.follow')[1]).toEqual(['r05', false]);
    r.dispose();
  });

  it('the fox leads four stops; the flock of six starts after the fourth and needs four home', () => {
    r = rig();
    choose('fox');
    expect(called(r, 'enemies.spawnGroup')).toEqual([['cinderreach.fox.r05']]);
    expect((called(r, 'foxes.guide')[0][1] as string[])).toHaveLength(4);
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    for (const stop of [0, 1, 2]) r.emit('fox.arrived', { foxId: 'f', stop });
    expect(raised).not.toContain('story.r05.foxStops');
    expect(called(r, 'herd.start')).toHaveLength(0);
    r.emit('fox.arrived', { foxId: 'f', stop: 3 });
    r.step();
    expect(raised).toContain('story.r05.foxStops');
    expect((called(r, 'herd.start')[0][1] as string[])).toHaveLength(6);
    r.stubs.herd.count.mockReturnValue(3);
    r.step(30);
    expect(r.state.getBool('story.r05.herdHome')).toBe(false);
    r.stubs.herd.count.mockReturnValue(4);
    r.step(30);
    expect(r.state.getBool('story.r05.herdHome')).toBe(true);
    r.dispose();
  });

  it('a load mid-guide sends the fox down the remaining stops and counts them from there', () => {
    r = rig();
    choose('fox');
    r.emit('fox.arrived', { foxId: 'f', stop: 0 });
    r.emit('fox.arrived', { foxId: 'f', stop: 1 });
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    const guides = called(r, 'foxes.guide');
    expect((guides[1][1] as string[]).map((a) => a.slice(-1))).toEqual(['3', '4']);
    r.emit('fox.arrived', { foxId: 'f', stop: 1 }); // the second remaining stop = the fourth overall
    r.step();
    expect(r.state.getNumber ? r.state.getNumber('story.r05.foxNext') : 0).toBe(4);
    r.dispose();
  });

  it('a load with the herd out rebuilds it from the flags, and one after the herd came home does not', () => {
    r = rig();
    choose('safe');
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'herd.stop')).toEqual([['r05']]);
    expect(called(r, 'herd.start')).toHaveLength(2);
    r.state.setFlag('story.r05.herdHome', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'herd.start')).toHaveLength(2);
    r.dispose();
  });

  it('ignores a fox arrival on the safe road or with no choice made, and cleans up when the quest completes', () => {
    r = rig();
    r.active('r05');
    r.emit('fox.arrived', { foxId: 'f', stop: 3 });
    expect(r.state.getNumber('story.r05.foxNext')).toBe(0);
    choose('safe');
    r.emit('fox.arrived', { foxId: 'f', stop: 3 });
    expect(r.state.getNumber('story.r05.foxNext')).toBe(0);
    r.emit('quest.completed', { questId: 'r05' });
    expect(called(r, 'herd.stop')).toEqual([['r05']]);
    expect(called(r, 'enemies.despawnGroup')).toEqual([['cinderreach.fox.r05']]);
    r.dispose();
  });
});

describe('director: M13 The Warden\'s Oath', () => {
  it('starts the trial against the spawned double, with Hrolf\'s NPC standing in', () => {
    r = rig();
    r.active('m13');
    r.current.add('m13.duel');
    r.named('story.m13.duelStart');
    r.step();
    const [opts] = called(r, 'trials.start')[0] as [{ id: string; opponentId: string; breaksToWin: number; standInNpcId: string }];
    expect(opts).toEqual({ id: 'm13', opponentId: 'q12.m13.trial#1', breaksToWin: 3, standInNpcId: 'hrolf' });
    r.dispose();
  });

  it('puts the double away however the trial ends', () => {
    r = rig();
    r.active('m13');
    r.current.add('m13.duel');
    r.named('story.m13.duelStart');
    r.step();
    r.emit('trial.ended', { trialId: 'm13', reason: 'left' } as never);
    r.step();
    expect(r.alive.has('q12.m13.trial')).toBe(false);
    r.emit('trial.won', { trialId: 'other' });
    r.dispose();
  });

  it('does nothing when the duel is not the current objective, and cleans up when the trial will not start', () => {
    r = rig();
    r.active('m13');
    r.named('story.m13.duelStart');
    r.step();
    expect(called(r, 'trials.start')).toHaveLength(0);
    r.current.add('m13.duel');
    r.stubs.trials.start = () => false;
    r.named('story.m13.duelStart');
    r.step();
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('trial did not start'));
    expect(r.alive.has('q12.m13.trial')).toBe(false);
    r.dispose();
  });
});

describe('director: R11 Hrolf\'s Brother\'s Axe', () => {
  it('plays the den scene once, after the second ledge', () => {
    r = rig();
    r.active('r11');
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.den', actorId: 'player' });
    r.step();
    expect(called(r, 'dialogue.start')).toHaveLength(0); // ledges not climbed
    r.done.add('r11.ledge2');
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.den', actorId: 'player' });
    r.step();
    expect(called(r, 'dialogue.start')).toEqual([['scene-r11-den', 'hrolf']]);
    r.done.add('r11.den');
    r.emit('trigger.enter', { triggerId: 'trg.cinderreach.den', actorId: 'player' });
    r.step();
    expect(called(r, 'dialogue.start')).toHaveLength(1);
    r.dispose();
  });

  it('a mercy on the den wyrm is a spare: flag, then dragons +5, then the group goes', () => {
    r = rig();
    r.active('r11');
    r.alive.set('wyrm.r11.den', ['wyrm#1']);
    const favour = vi.spyOn(r.state, 'addFavour');
    r.emit('mercy', { verb: 'spare', tier: 'normal', track: 'dragons', creature: 'ember-wyrm', actorId: 'wyrm#1' });
    expect(r.state.getFlag('story.r11.choice')).toBe('spared');
    expect(favour).toHaveBeenCalledWith('dragons', 5, 'quest');
    r.step();
    expect(called(r, 'enemies.despawnGroup')).toEqual([['wyrm.r11.den']]);
    r.dispose();
  });

  it('the wyrm\'s death is a slaying: dragons -4; the second outcome is ignored', () => {
    r = rig();
    r.active('r11');
    const favour = vi.spyOn(r.state, 'addFavour');
    r.emit('actor.died', { actorId: 'wyrm#1', killerId: 'player', kind: 'ember-wyrm', team: 'foe', level: 1, spawnTag: 'r11.den' } as never);
    expect(r.state.getFlag('story.r11.choice')).toBe('slain');
    r.alive.set('wyrm.r11.den', ['wyrm#1']);
    r.emit('mercy', { verb: 'spare', tier: 'normal', track: 'dragons', creature: 'ember-wyrm', actorId: 'wyrm#1' });
    expect(r.state.getFlag('story.r11.choice')).toBe('slain');
    expect(favour).toHaveBeenCalledTimes(1);
    expect(favour).toHaveBeenCalledWith('dragons', -4, 'quest');
    r.dispose();
  });

  it('a mercy on some other creature, or an ember-wyrm elsewhere, is not the choice; nor is a death outside the quest', () => {
    r = rig();
    r.active('r11');
    r.alive.set('wyrm.r11.den', ['wyrm#1']);
    r.emit('mercy', { verb: 'spare', tier: 'normal', track: 'dragons', creature: 'ember-wyrm', actorId: 'wyrm-nest#9' });
    r.emit('actor.died', { actorId: 'wyrm-nest#9', spawnTag: 'wyrm.nest' } as never);
    expect(r.state.getFlag('story.r11.choice')).toBeUndefined();
    r.quest.set('r11', 'completed');
    r.emit('actor.died', { actorId: 'wyrm#1', spawnTag: 'r11.den' } as never);
    expect(r.state.getFlag('story.r11.choice')).toBeUndefined();
    r.dispose();
  });

  it('the axe is the full one after a slaying and the rested one after a spare, with its reaction scene', () => {
    for (const [choice, item] of [['slain', 'brothers-axe-full'], ['spared', 'brothers-axe-lesser']] as const) {
      r = rig();
      r.active('r11');
      r.state.setFlag('story.r11.choice', choice);
      r.emit('interact', { interactableId: 'use:r11-axe', kind: 'prop', actorId: 'player', action: 'interact' });
      r.step();
      expect(called(r, 'inventory.add')).toEqual([[item, 1]]);
      expect(called(r, 'dialogue.start')).toEqual([['scene-r11-axe', 'hrolf']]);
      r.dispose();
    }
  });
});

describe('director: M14 Hushed Anvil Rites', () => {
  it('each mural raises its own reflection through the keeper\'s tree, not as the keeper (review-a #6)', () => {
    r = rig();
    r.active('m14');
    r.emit('interact', { interactableId: 'use:hushed-anvil-mural-2', kind: 'prop', actorId: 'player', action: 'interact' });
    r.step();
    expect(r.state.getFlag('story.m14.mural')).toBe(2);
    expect(called(r, 'dialogue.start')).toEqual([['npc-lantern-keeper', MURAL_NPC]]);
    r.dispose();
  });

  it('counts tempers from the quest start into story.m14.tempers, sets story.m14.tempered at two and asks the quests to recheck (K0-2)', () => {
    r = rig();
    const recheck = vi.fn();
    r.stubs.quests.recheck = recheck;
    r.emit('gear.tempered', { itemId: 'sword', level: 1 }); // M14 not active: not counted
    expect(r.state.getNumber('story.m14.tempers')).toBe(0);
    r.active('m14');
    r.emit('gear.tempered', { itemId: 'sword', level: 1 });
    r.step();
    expect(r.state.getNumber('story.m14.tempers')).toBe(1);
    expect(r.state.getBool('story.m14.tempered')).toBe(false);
    expect(recheck).not.toHaveBeenCalled();
    r.emit('gear.tempered', { itemId: 'sword', level: 2 });
    expect(r.state.getBool('story.m14.tempered')).toBe(true);
    expect(recheck).not.toHaveBeenCalled(); // not from inside the event
    r.step();
    expect(recheck).toHaveBeenCalledTimes(1);
    r.emit('gear.tempered', { itemId: 'sword', level: 3 }); // done: no further counting
    r.step();
    expect(r.state.getNumber('story.m14.tempers')).toBe(2);
    expect(recheck).toHaveBeenCalledTimes(1);
    r.dispose();
  });

  it('the Anvil sings after the second tempering: the keeper speaks, and the beat is set when the hold clears', () => {
    r = rig();
    r.active('m14');
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.emit('quest.objective', objective('m14', 'temper'));
    r.step();
    expect(r.state.getBool('story.m14.singsHold')).toBe(true);
    // the keeper tree clears the hold on its last line, then the dialogue ends
    r.state.clearFlag('story.m14.singsHold');
    r.emit('dialogue.ended', { dialogueId: 'npc-lantern-keeper', npcId: 'lantern-keeper', reason: 'completed' });
    expect(raised).toContain('story.m14.set');
    expect(r.state.getFlag('story.m14.singsPending')).toBeUndefined();
    r.dispose();
  });

  it('a song skipped before its last line is offered again; a mural talk does not set the beat', () => {
    r = rig();
    r.active('m14');
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.emit('quest.objective', objective('m14', 'temper'));
    r.step();
    r.emit('dialogue.ended', { dialogueId: 'npc-lantern-keeper', npcId: 'lantern-keeper', reason: 'skip' });
    r.step();
    expect(called(r, 'dialogue.start')).toHaveLength(2);
    expect(raised).not.toContain('story.m14.set');
    r.emit('dialogue.ended', { dialogueId: 'npc-osgar', npcId: 'osgar', reason: 'completed' });
    expect(raised).not.toContain('story.m14.set');
    r.dispose();
  });

  it('a load after the hold cleared but before the beat was heard still sets the beat', () => {
    r = rig();
    r.active('m14');
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.state.setFlag('story.m14.singsPending', true);
    r.emit('save.loaded', { slot: 'a' });
    expect(raised).toContain('story.m14.set');
    r.dispose();
  });
});

describe('director: M15 The Hunters\' Pens', () => {
  it('chains the caged wyrmling at the pen from setup', () => {
    r = rig();
    expect(called(r, 'wyrms.tether')).toEqual([['q12.m15.cage', [{ anchor: 'cinderreach.m15.cage' }]]]);
    r.dispose();
  });

  it('counts one witness per distinct spared hunter', () => {
    r = rig();
    for (const id of ['h1', 'h2', 'h1']) r.emit('hunter.spared', { actorId: id, kind: 'hunter-spearman' });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(2);
    r.dispose();
  });

  it('the cage frees the wyrmling, which flies after four seconds and sets the first flight', () => {
    r = rig();
    r.active('m15');
    r.alive.set('q12.m15.cage', ['wyrmling#1']);
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.emit('interact', { interactableId: 'use:m15-cage', kind: 'prop', actorId: 'player', action: 'interact' });
    r.step();
    expect(called(r, 'wyrms.unchain')).toEqual([['wyrmling#1']]);
    r.emit('wyrm.unchained', { actorId: 'wyrmling#1' });
    r.step(239);
    expect(called(r, 'wyrms.flyAway')).toHaveLength(0);
    r.step(2);
    expect(called(r, 'wyrms.flyAway')).toEqual([['wyrmling#1']]);
    expect(raised).toContain('story.m15.set');
    expect(r.state.getBool('story.m15.flown')).toBe(true);
    r.dispose();
  });

  it('a cage with no wyrmling to free (it was despawned) still sets the flight, with a warning', () => {
    r = rig();
    r.active('m15');
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.emit('interact', { interactableId: 'use:m15-cage', kind: 'prop', actorId: 'player', action: 'interact' });
    r.step();
    expect(raised).toContain('story.m15.set');
    expect(r.warn).toHaveBeenCalled();
    r.dispose();
  });

  it('the cage-load recovery path flies the caged wyrmling away instead of leaving it at the pen', () => {
    r = rig();
    r.active('m15');
    r.alive.set('q12.m15.cage', ['wyrmling#1']);
    r.state.setFlag('story.m15.cageOpen', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'wyrms.flyAway')).toEqual([['wyrmling#1']]);
    r.dispose();
  });

  it('the cage-load recovery despawns the caged wyrmling when the flyAway finds no actor to free', () => {
    r = rig();
    r.active('m15');
    r.alive.set('q12.m15.cage', ['wyrmling#1']);
    r.stubs.wyrms.flyAway = (...a: unknown[]) => (r.calls.push(['wyrms.flyAway', ...a]), false);
    r.state.setFlag('story.m15.cageOpen', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'wyrms.flyAway')).toEqual([['wyrmling#1']]);
    expect(called(r, 'enemies.despawnGroup')).toEqual([['q12.m15.cage']]);
    r.dispose();
  });

  it('the cage-load recovery also clears a wyrmling the enemies plugin respawns after the recovery tick', () => {
    r = rig();
    r.active('m15');
    r.state.setFlag('story.m15.cageOpen', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step(); // nothing alive yet: only the flight is set
    expect(called(r, 'wyrms.flyAway')).toHaveLength(0);
    expect(called(r, 'enemies.despawnGroup')).toHaveLength(0);
    r.alive.set('q12.m15.cage', ['wyrmling#2']); // respawned late
    r.step(130);
    expect(called(r, 'enemies.despawnGroup')).toEqual([['q12.m15.cage']]);
    expect(r.alive.has('q12.m15.cage')).toBe(false);
    r.dispose();
  });

  it('the flight is set only once, and a load with the cage open but no flight sets it', () => {
    r = rig();
    r.active('m15');
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.state.setFlag('story.m15.cageOpen', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    r.emit('wyrm.unchained', { actorId: 'w' });
    r.step(300);
    expect(raised.filter((t) => t === 'story.m15.set')).toHaveLength(1);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(raised.filter((t) => t === 'story.m15.set')).toHaveLength(1);
    r.dispose();
  });
});

describe('director: M15 witnesses, the tether and the caged wyrmling (review R1-2, R1-3, R1-4)', () => {
  it('a revoked spare takes its witness back, and a hunter spared again counts again (R1-2)', () => {
    r = rig();
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    r.emit('hunter.spared', { actorId: 'h2', kind: 'hunter-spearman' });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(2);
    r.emit('mercy.revoked', { actorId: 'h1', track: null, removed: 0 });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(1);
    r.emit('mercy.revoked', { actorId: 'h1', track: null, removed: 0 }); // twice: no double take-back
    r.emit('mercy.revoked', { actorId: 'stranger', track: null, removed: 0 });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(1);
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(2);
    r.dispose();
  });

  it('a revoke after a load (the dedupe restarted, the count restored) does not take a witness off', () => {
    r = rig();
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    r.emit('save.loaded', { slot: 'a' });
    r.emit('mercy.revoked', { actorId: 'h1', track: null, removed: 0 });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(1);
    r.dispose();
  });

  it('dispose frees the cage tether and leaves nothing listening (R1-4)', () => {
    r = rig();
    expect(called(r, 'wyrms.untether')).toHaveLength(0);
    r.dispose();
    expect(called(r, 'wyrms.untether')).toEqual([['q12.m15.cage']]);
    const before = r.calls.length;
    r.active('m15');
    r.emit('wyrm.unchained', { actorId: 'w' });
    r.emit('interact', { interactableId: 'use:m15-cage', kind: 'prop', actorId: 'player', action: 'interact' });
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    r.emit('mercy.revoked', { actorId: 'h1', track: null, removed: 0 });
    r.state.setFlag('story.m15.flown', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step(300);
    expect(r.calls.length).toBe(before);
    expect(r.state.getNumber('story.a2.witnesses')).toBe(0);
  });

  it('a load after the first flight sends the caged wyrmling away again; before the flight it leaves it be (R1-3)', () => {
    r = rig();
    r.active('m15');
    r.emit('save.loaded', { slot: 'a' });
    r.step(2);
    expect(called(r, 'enemies.despawnGroup')).toHaveLength(0);
    r.state.setFlag('story.m15.flown', true);
    r.emit('save.loaded', { slot: 'a' });
    expect(called(r, 'enemies.despawnGroup')).toHaveLength(0); // not from inside the load: the quest's respawn comes first
    r.step(2);
    expect(called(r, 'enemies.despawnGroup')).toEqual([['q12.m15.cage']]);
    r.dispose();
  });
});

describe('director: M15 flight timer across a load (review R1-1)', () => {
  it('a load inside the four seconds drops the timer, and the cage works again in the loaded world', () => {
    r = rig();
    r.active('m15');
    r.alive.set('q12.m15.cage', ['wyrmling#1']);
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.emit('wyrm.unchained', { actorId: 'wyrmling#1' });
    r.step(100);
    // the older save: no cage open, no flight
    r.state.clearFlag('story.m15.cageOpen');
    r.emit('save.loaded', { slot: 'a' });
    r.step(300);
    expect(r.state.getBool('story.m15.flown')).toBe(false);
    expect(called(r, 'wyrms.flyAway')).toHaveLength(0);
    expect(raised).not.toContain('story.m15.set');
    // the cage is opened again in the loaded world
    r.state.setFlag('story.m15.cageOpen', true);
    r.emit('wyrm.unchained', { actorId: 'wyrmling#1' });
    r.step(300);
    expect(raised.filter((t) => t === 'story.m15.set')).toHaveLength(1);
    expect(r.state.getBool('story.m15.flown')).toBe(true);
    r.dispose();
  });

  it('a save made during the four seconds (cage open, no flight) still flies on its load', () => {
    r = rig();
    r.active('m15');
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    r.emit('wyrm.unchained', { actorId: 'w' });
    r.step(100);
    r.state.setFlag('story.m15.cageOpen', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step(300);
    expect(raised.filter((t) => t === 'story.m15.set')).toHaveLength(1);
    r.dispose();
  });

  it('the timer does not fire once the quest is no longer active', () => {
    r = rig();
    r.active('m15');
    r.emit('wyrm.unchained', { actorId: 'w' });
    r.step(100);
    r.quest.set('m15', 'inactive');
    r.step(300);
    expect(r.state.getBool('story.m15.flown')).toBe(false);
    r.dispose();
  });
});

describe('director: D03 The Fall of Scorchhold', () => {
  it('records a defeat without Redmane standing by Osgar', () => {
    r = rig();
    r.emit('boss.defeated', { bossId: 'thrandil-redmane', actorId: 'b' });
    expect(r.state.getFlag('story.d03.outcome')).toBe('defeated');
    expect(r.state.getBool('story.d03.redmaneHeld')).toBe(false);
    r.dispose();
  });

  it('records a spare, holds Redmane for the testimony, and pays no favour of its own', () => {
    r = rig();
    const favour = vi.spyOn(r.state, 'addFavour');
    r.emit('boss.spared', { bossId: 'thrandil-redmane', actorId: 'b' });
    expect(r.state.getFlag('story.d03.outcome')).toBe('spared');
    expect(r.state.getBool('story.d03.redmaneHeld')).toBe(true);
    expect(favour).not.toHaveBeenCalled();
    r.dispose();
  });

  it('keeps the first outcome and ignores other bosses', () => {
    r = rig();
    r.emit('boss.defeated', { bossId: 'gaffer-grimtooth', actorId: 'g' });
    expect(r.state.getFlag('story.d03.outcome')).toBeUndefined();
    r.emit('boss.spared', { bossId: 'thrandil-redmane', actorId: 'b' });
    r.emit('boss.defeated', { bossId: 'thrandil-redmane', actorId: 'b' });
    expect(r.state.getFlag('story.d03.outcome')).toBe('spared');
    r.dispose();
  });

  it('follows A8\'s outcome flag on a load', () => {
    r = rig();
    r.state.setFlag('boss.thrandil-redmane.outcome', 'spared');
    r.emit('save.loaded', { slot: 'a' });
    expect(r.state.getFlag('story.d03.outcome')).toBe('spared');
    expect(r.state.getBool('story.d03.redmaneHeld')).toBe(true);
    r.dispose();
  });

  it('a freed prisoner speaks once the cage opens, only while D03 is active', () => {
    r = rig();
    r.emit('interact', { interactableId: 'use:d03-prisoner-1', kind: 'prop', actorId: 'player', action: 'interact' });
    r.step();
    expect(called(r, 'dialogue.start')).toHaveLength(0);
    r.active('d03');
    r.emit('interact', { interactableId: 'use:d03-prisoner-2', kind: 'prop', actorId: 'player', action: 'interact' });
    r.step();
    expect(called(r, 'dialogue.start')).toEqual([['scene-d03-prisoner', 'prisoner']]);
    r.dispose();
  });
});

// ---- review-a follow-ups (plans/act2-followups/review-a.md) ------------------------------------------------------------

const wraithMercy = (actorId: string) => ({ verb: 'release' as const, tier: 'normal' as const, track: 'ashwalkers' as const, creature: 'ash-wraith', actorId });
const footmanMercy = (actorId: string) => ({ verb: 'spare' as const, tier: 'normal' as const, track: 'oswin' as const, creature: 'blighted-soldier', actorId });

describe('director: a wave that ends on a mercy still advances (review-a #3)', () => {
  const riteRig = (): Rig => {
    const x = rig();
    x.active('r06');
    x.state.setFlag('story.r06.riteStarted', true);
    x.named('story.r06.riteStart');
    x.step();
    expect(called(x, 'enemies.spawnGroup')).toEqual([['q12.r06.rite-1']]);
    return x;
  };

  it('R06: the last wraith of wave 1 released (still dissolving) brings wave 2; released last of wave 2 ends the rite', () => {
    r = riteRig();
    const raised: string[] = [];
    r.events.onAny((t) => void raised.push(t as string));
    // two die, one is released first and is still in `alive` while it dissolves, the last is released too
    r.alive.set('q12.r06.rite-1', ['q12.r06.rite-1#2', 'q12.r06.rite-1#3']);
    r.emit('mercy', wraithMercy('q12.r06.rite-1#2'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(1); // #3 still stands
    r.emit('mercy', wraithMercy('q12.r06.rite-1#3'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.r06.rite-2']);
    expect(r.state.getNumber('story.r06.riteWave')).toBe(2);
    for (const id of ['q12.r06.rite-2#1', 'q12.r06.rite-2#2', 'q12.r06.rite-2#3']) r.emit('mercy', wraithMercy(id));
    r.step();
    expect(raised).toContain('story.r06.riteDone');
    expect(r.state.getBool('story.r06.riteFinished')).toBe(true);
    r.dispose();
  });

  it('R06: the last wraith killed while a released one is still dissolving advances the wave', () => {
    r = riteRig();
    r.emit('mercy', wraithMercy('q12.r06.rite-1#1'));
    r.alive.set('q12.r06.rite-1', ['q12.r06.rite-1#1']); // #2 and #3 died; #1 is still dissolving
    r.emit('actor.died', { actorId: 'q12.r06.rite-1#3', spawnTag: 'r06.rite' } as never);
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.r06.rite-2']);
    r.dispose();
  });

  it('R06: the dissolve finishing (a despawn, the group cleared) re-checks the wave even with no mercy event seen', () => {
    r = riteRig();
    r.alive.set('q12.r06.rite-1', []);
    r.emit('actor.despawned', { actorId: 'q12.r06.rite-1#1' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.r06.rite-2']);
    r.dispose();
    r = riteRig();
    r.alive.set('q12.r06.rite-1', []);
    r.emit('enemies.groupCleared', { spawnerId: 'q12.r06.rite-1' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.r06.rite-2']);
    r.dispose();
  });

  it('R06: a revoked mercy counts the wraith as standing again; a mercy elsewhere does not advance the wave', () => {
    r = riteRig();
    r.emit('mercy', wraithMercy('some-other-wraith'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(1);
    for (const id of ['q12.r06.rite-1#1', 'q12.r06.rite-1#2']) r.emit('mercy', wraithMercy(id));
    r.emit('mercy.revoked', { actorId: 'q12.r06.rite-1#1', track: 'ashwalkers', removed: 1 });
    r.emit('mercy', wraithMercy('q12.r06.rite-1#3'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(1); // #1 is hostile again
    r.emit('mercy', wraithMercy('q12.r06.rite-1#1'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(2);
    r.dispose();
  });

  it('R06: a load tears the wave down (despawns) without advancing it, and rebuilds the same wave once', () => {
    r = riteRig();
    r.emit('mercy', wraithMercy('q12.r06.rite-1#1'));
    r.step();
    // the load: the ephemeral group goes first, then save.loaded
    r.alive.delete('q12.r06.rite-1');
    for (const id of ['q12.r06.rite-1#1', 'q12.r06.rite-1#2', 'q12.r06.rite-1#3']) r.emit('actor.despawned', { actorId: id });
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.r06.rite-1'], ['q12.r06.rite-1']]);
    expect(r.state.getNumber('story.r06.riteWave')).toBe(1);
    // and the rebuilt wave still advances when it ends on mercies (the load forgot the old ones)
    for (const id of ['q12.r06.rite-1#1', 'q12.r06.rite-1#2', 'q12.r06.rite-1#3']) r.emit('mercy', wraithMercy(id));
    r.step();
    expect(called(r, 'enemies.spawnGroup')[2]).toEqual(['q12.r06.rite-2']);
    r.dispose();
  });

  const ambushRig = (): Rig => {
    const x = rig();
    x.active('m11');
    x.done.add('m11.ring');
    x.emit('escort.dismounted', { escortId: 'm11' });
    x.step();
    expect(called(x, 'enemies.spawnGroup')).toEqual([['q12.m11.ambush-1']]);
    return x;
  };

  it('M11: the third Footman spared (walking off, still in `alive`) brings the second ambush', () => {
    r = ambushRig();
    r.progress.set('m11.ambush', 3); // two kills, and the mercy credits the third
    r.alive.set('q12.m11.ambush-1', ['q12.m11.ambush-1#3']);
    r.emit('mercy', footmanMercy('q12.m11.ambush-1#3'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')[1]).toEqual(['q12.m11.ambush-2']);
    r.dispose();
  });

  it('M11: a spare that leaves fewer than three down, or a spare after the ambush is done, brings nothing', () => {
    r = ambushRig();
    r.progress.set('m11.ambush', 2);
    r.alive.set('q12.m11.ambush-1', ['q12.m11.ambush-1#3']);
    r.emit('mercy', footmanMercy('q12.m11.ambush-1#2'));
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(1);
    r.emit('mercy', footmanMercy('q12.m11.ambush-1#3'));
    r.progress.set('m11.ambush', 3);
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(2); // the walk-off itself is the third
    r.done.add('m11.ambush');
    r.alive.clear();
    r.progress.set('m11.ambush', 3);
    r.emit('actor.despawned', { actorId: 'q12.m11.ambush-2#1' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toHaveLength(2);
    r.dispose();
  });

  it('M11: a load mid-ambush despawns the group and refills it once, without reading the teardown as a cleared group', () => {
    r = ambushRig();
    r.progress.set('m11.ambush', 4);
    r.alive.delete('q12.m11.ambush-1');
    r.emit('quest.objective', { questId: 'm11', objectiveId: 'ambush', progress: 4, required: 6, done: false });
    // the save was at 4 kills with group 2 out: the load tears down, then refills group 2
    for (const id of ['q12.m11.ambush-1#1']) r.emit('actor.despawned', { actorId: id });
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(called(r, 'enemies.spawnGroup')).toEqual([['q12.m11.ambush-1'], ['q12.m11.ambush-2']]);
    r.dispose();
  });
});

describe('director: R11 Calm pays dragons +5 in total (review-a #4)', () => {
  const wyrmMercy = { verb: 'calm' as const, tier: 'elite' as const, track: 'dragons' as const, creature: 'ember-wyrm', actorId: 'wyrm.r11.den#1' };

  it('the Calm\'s creature credit (+2 elite) plus the director\'s share is +5, through the real WorldState', () => {
    r = rig({ coreMercy: true });
    r.active('r11');
    r.alive.set('wyrm.r11.den', ['wyrm.r11.den#1']);
    const before = r.state.favour('dragons');
    r.emit('mercy', wyrmMercy);
    expect(r.state.getFlag('story.r11.choice')).toBe('spared');
    expect(r.state.creatureMercyFavour('dragons')).toBe(2);
    r.step();
    expect(r.state.favour('dragons') - before).toBe(5);
    expect(called(r, 'enemies.despawnGroup')).toEqual([['wyrm.r11.den']]);
    // a second mercy event for the same wyrm (Calm then Spare) pays nothing more
    r.emit('mercy', { ...wyrmMercy, verb: 'spare' });
    r.step();
    expect(r.state.favour('dragons') - before).toBe(5);
    r.dispose();
  });

  it('at the creature-mercy cap the Calm pays nothing and the director pays all five', () => {
    r = rig({ coreMercy: true });
    r.active('r11');
    r.alive.set('wyrm.r11.den', ['wyrm.r11.den#1']);
    // fill the dragons creature-mercy cap with other elites
    for (let i = 0; r.state.creatureMercyFavour('dragons') < 10 && i < 20; i++) {
      r.emit('mercy', { ...wyrmMercy, actorId: `nest#${i}` });
    }
    const capped = r.state.creatureMercyFavour('dragons');
    const before = r.state.favour('dragons');
    r.emit('mercy', wyrmMercy);
    expect(r.state.creatureMercyFavour('dragons')).toBe(capped);
    expect(r.state.favour('dragons') - before).toBe(5);
    r.dispose();
  });

  it('a slaying stays -4, with no mercy credit to subtract', () => {
    r = rig({ coreMercy: true });
    r.active('r11');
    const before = r.state.favour('dragons');
    r.emit('actor.died', { actorId: 'wyrm.r11.den#1', spawnTag: 'r11.den' } as never);
    expect(r.state.favour('dragons') - before).toBe(-4);
    r.dispose();
  });
});

describe('director: the pasture flock after R05 (review-a #5)', () => {
  const finish = (choice: 'fox' | 'safe', derived: boolean) => {
    r = rig();
    r.state.setFlag('story.r05.choice', choice);
    if (derived) r.state.setFlag('world.cinderreach.pasture.reduced', true);
    r.quest.set('r05', 'completed');
    r.emit('quest.completed', { questId: 'r05' });
    r.step();
  };
  const pasture = () => called(r, 'herd.start').filter((c) => c[0] === 'cinderreach.pasture');

  it('the safe road leaves eight grazing at the pasture, never following', () => {
    finish('safe', false);
    expect(pasture()).toHaveLength(1);
    expect(pasture()[0][1]).toEqual(Array.from({ length: 8 }, (_, i) => `cinderreach.pasture.flock.${i + 1}`));
    expect(called(r, 'herd.follow').filter((c) => c[0] === 'cinderreach.pasture')).toHaveLength(0);
    r.dispose();
  });

  it('the fox\'s road (world.cinderreach.pasture.reduced) leaves six', () => {
    finish('fox', true);
    expect((pasture()[0][1] as string[])).toHaveLength(6);
    r.dispose();
  });

  it('a load rebuilds the flock from the flag (the herd service saves nothing); before R05 is done, no flock', () => {
    r = rig();
    r.active('r05');
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(pasture()).toHaveLength(0);
    r.dispose();
    r = rig();
    r.quest.set('r05', 'completed');
    r.state.setFlag('world.cinderreach.pasture.reduced', true);
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect((pasture()[0][1] as string[])).toHaveLength(6);
    r.dispose();
  });

  it('a pasture with no anchors warns instead of throwing', () => {
    r = rig();
    r.stubs.herd.start = vi.fn(() => false);
    r.quest.set('r05', 'completed');
    r.emit('save.loaded', { slot: 'a' });
    r.step();
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('pasture flock'));
    r.dispose();
  });
});

describe('director: M15 witnesses after a reload (review-a #7)', () => {
  it('a hunter spared again after a load (same actor id, count restored) is a witness again', () => {
    r = rig();
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(1);
    // the load restores the pre-spare count and brings h1 back
    r.state.setFlag('story.a2.witnesses', 0);
    r.emit('save.loaded', { slot: 'a' });
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' });
    expect(r.state.getNumber('story.a2.witnesses')).toBe(1);
    r.emit('hunter.spared', { actorId: 'h1', kind: 'hunter-spearman' }); // still once per hunter within a session
    expect(r.state.getNumber('story.a2.witnesses')).toBe(1);
    r.dispose();
  });
});

describe('director: R11 den scene when the player is already on the shelf (review-a #9)', () => {
  const ledge2 = { questId: 'r11', objectiveId: 'ledge2', progress: 1, required: 1, done: true };

  it('ledge2 completing with the player inside the den trigger starts the scene', () => {
    r = rig();
    r.active('r11');
    r.inside.add('trg.cinderreach.den');
    r.done.add('r11.ledge2');
    r.emit('quest.objective', ledge2);
    r.step(3);
    expect(called(r, 'dialogue.start')).toEqual([['scene-r11-den', 'hrolf']]);
    r.dispose();
  });

  it('a load inside the trigger starts it; outside, or with the den done, it does not', () => {
    r = rig();
    r.active('r11');
    r.done.add('r11.ledge2');
    r.emit('save.loaded', { slot: 'a' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(0);
    r.inside.add('trg.cinderreach.den');
    r.emit('save.loaded', { slot: 'a' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toEqual([['scene-r11-den', 'hrolf']]);
    r.done.add('r11.den');
    r.emit('save.loaded', { slot: 'a' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(1);
    r.dispose();
  });

  it('retries on dialogue.ended while another dialogue holds the screen, and stops once the scene has started', () => {
    const o = { dialogueOpen: true };
    r = rig(o);
    r.active('r11');
    r.inside.add('trg.cinderreach.den');
    r.done.add('r11.ledge2');
    r.emit('quest.objective', ledge2);
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(1); // refused
    o.dialogueOpen = false;
    r.emit('dialogue.ended', { dialogueId: 'x', npcId: 'y' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(2); // started
    r.step(20);
    expect(called(r, 'dialogue.start')).toHaveLength(2);
    r.dispose();
  });

  it('a dialogue that stays open far longer than the old retry window cannot block the scene: it starts on dialogue.ended', () => {
    const o = { dialogueOpen: true };
    r = rig(o);
    r.active('r11');
    r.inside.add('trg.cinderreach.den');
    r.done.add('r11.ledge2');
    r.emit('quest.objective', ledge2);
    r.step(600); // ten seconds
    expect(called(r, 'dialogue.start')).toHaveLength(1); // refused once, no polling
    o.dialogueOpen = false;
    r.emit('dialogue.ended', { dialogueId: 'x', npcId: 'y' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toEqual([['scene-r11-den', 'hrolf'], ['scene-r11-den', 'hrolf']]);
    r.emit('dialogue.ended', { dialogueId: 'x', npcId: 'y' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(2);
    r.dispose();
  });

  it('a start refused by a menu retries when the menu closes (review F2)', () => {
    const o = { dialogueOpen: true };
    r = rig(o);
    r.active('r11');
    r.inside.add('trg.cinderreach.den');
    r.done.add('r11.ledge2');
    r.emit('quest.objective', ledge2);
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(1);
    o.dialogueOpen = false;
    r.emit('ui.modal', { id: 'journal', open: false });
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(2);
    r.dispose();
  });

  it('after a dialogue ends the scene is dropped if the player left the shelf meanwhile', () => {
    const o = { dialogueOpen: true };
    r = rig(o);
    r.active('r11');
    r.inside.add('trg.cinderreach.den');
    r.done.add('r11.ledge2');
    r.emit('quest.objective', ledge2);
    r.step(3);
    r.inside.delete('trg.cinderreach.den');
    o.dialogueOpen = false;
    r.emit('dialogue.ended', { dialogueId: 'x', npcId: 'y' });
    r.step(3);
    expect(called(r, 'dialogue.start')).toHaveLength(1);
    r.dispose();
  });
});

describe('director: D03 adds nothing to the Spare\'s Oswin +3 (review-a #10)', () => {
  it('the BOSS_MERCY credit, the outcome, a load and the quest\'s end leave Oswin at exactly +3, through the real WorldState', () => {
    r = rig({ coreMercy: true });
    r.active('d03');
    const before = r.state.favour('oswin');
    // A8's Spare: the boss mercy (ledger D03, amount 3), the outcome flag, then the events
    r.emit('mercy', { verb: 'spare', tier: 'boss', track: 'oswin', creature: 'thrandil-redmane', actorId: 'redmane#1', amount: 3, ledgerId: 'D03' } as never);
    r.state.setFlag('boss.thrandil-redmane.outcome', 'spared');
    r.emit('boss.released', { bossId: 'thrandil-redmane', actorId: 'redmane#1' } as never);
    r.emit('boss.spared', { bossId: 'thrandil-redmane', actorId: 'redmane#1' });
    r.step(5);
    r.emit('save.loaded', { slot: 'a' });
    r.step(5);
    r.emit('quest.completed', { questId: 'd03' });
    r.step(5);
    expect(r.state.getFlag('story.d03.outcome')).toBe('spared');
    expect(r.state.favour('oswin') - before).toBe(3);
    r.dispose();
  });
});
