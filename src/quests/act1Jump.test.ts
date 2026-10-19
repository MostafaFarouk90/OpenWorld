import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { PluginModule } from '../core/plugins';
import { PLUGIN_MODULES } from '../core/pluginManifest';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { FakeIndexedDb } from '../save/__fixtures__/fakeIndexedDb';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import slice1Complete from '../save/__fixtures__/slice1-complete.json';
import { tutorialFromQuery } from '../tutorial/tutorial.plugin';
import {
  ACT1_GIVERS, ACT1_JUMP_IDS, ACT1_NODE_EFFECTS, ACT1_PHASE_B_JUMP_IDS, ACT1_PREREQS, ACT1_WORLD_AFTER, Act1Jump, type Act1JumpId, GIVER_STAND_OFF,
  nodeEffects, parseAct1,
} from './act1Jump';
import { dialogueDefs } from '../dialogue/content';
import { heightAt } from '../terrain/heightfield';
import { regionAt } from '../region/regionMask';

describe('parseAct1', () => {
  it('accepts every Act 1 quest with &new', () => {
    for (const id of ACT1_JUMP_IDS) expect(parseAct1(`?act1=${id}&new`)).toEqual({ id, fresh: true });
  });
  it('is null without the parameter and refuses unknown ids or a missing &new', () => {
    expect(parseAct1('?tutorial=t05')).toBeNull();
    expect(parseAct1('?act1=m11&new')).toMatchObject({ error: expect.stringContaining('unknown') });
    expect(parseAct1('?act1=m03')).toMatchObject({ error: expect.stringContaining('&new') });
  });
  it('a valid jump starts the tutorial from Kettlewick (no start screen); a refused one does not', () => {
    expect(tutorialFromQuery('?act1=m04&new')).toEqual({ mode: 'kettlewick' });
    expect(tutorialFromQuery('?act1=m04')).toBeNull();
    expect(tutorialFromQuery('?tutorial=t05&act1=m04&new')).toEqual({ mode: 'full', at: 't05' });
  });
});

describe('node effects are read from the dialogue content', () => {
  it('every referenced node exists and carries effects', () => {
    for (const refs of Object.values(ACT1_NODE_EFFECTS)) {
      for (const r of refs) {
        expect(nodeEffects(r.dialogueId, r.nodeId, dialogueDefs, r.choiceId)?.length, `${r.dialogueId}:${r.nodeId}/${r.choiceId}`).toBeGreaterThan(0);
      }
    }
    expect(nodeEffects('npc-aelfreda', 'leap')).toEqual([{ grantAbility: 'surge-leap' }]);
    expect(nodeEffects('npc-nobody', 'x')).toBeNull();
  });
  it('a choice adds its effects after the node\'s own; an unknown choice is null', () => {
    const bribe = nodeEffects('npc-rook', 'm06-choose', dialogueDefs, 'bribe');
    expect(bribe).toContainEqual({ setFlag: 'story.m06.route', value: 'bribe' });
    expect(bribe?.[0]).toMatchObject({ spendGold: { amount: 50 } });
    expect(nodeEffects('npc-whitlock', 'r04-pages', dialogueDefs, 'shield')).toContainEqual({ setFlag: 'story.r04.choice', value: 'shield' });
    expect(nodeEffects('npc-rook', 'm06-choose', dialogueDefs, 'nope')).toBeNull();
    expect(nodeEffects('npc-rook', 'm06-choose', dialogueDefs)).toEqual([]);
  });
  it('the world flags a jump sets by hand are never story.* (story flags come only from dialogue nodes)', () => {
    for (const [q, rows] of Object.entries(ACT1_WORLD_AFTER)) for (const w of rows) expect(w.flag, q).not.toMatch(/^story\./);
  });
});

describe('Act1Jump (fakes)', () => {
  function rig(id: Act1JumpId, opts: { startFails?: boolean; teleportRefusals?: number; classRefused?: boolean } = {}) {
    let refusals = opts.teleportRefusals ?? 0;
    const states = new Map<string, string>();
    const log: string[] = [];
    const tut = { begun: false, complete: false, beat: null as string | null, restartInFlight: false,
      begin() { this.begun = true; this.beat = 't15'; log.push('begin'); },
      skipCurrent() { this.beat = null; this.complete = true; log.push('skip'); } };
    let ready = false;
    const warn = vi.fn();
    const jump = new Act1Jump(id, {
      tutorial: () => tut,
      quests: {
        state: (q) => states.get(q) ?? 'inactive',
        start: (q) => { if (opts.startFails && q === id) return false; states.set(q, 'active'); log.push(`start:${q}`); return true; },
        complete: (q) => { states.set(q, 'completed'); log.push(`complete:${q}`); return true; },
      },
      runEffects: (e) => log.push(`effects:${JSON.stringify(e)}`),
      setFlag: (f) => log.push(`flag:${f}`),
      rekindle: (w) => log.push(`rekindle:${w}`),
      giveGold: (n) => log.push(`gold:${n}`),
      chooseClass: (c) => { log.push(`class:${c}`); return !opts.classRefused; },
      teleportTo: (a) => { log.push(`tp:${a}`); return refusals-- <= 0; },
      standBy: (n) => { log.push(`by:${n}`); return refusals-- <= 0; },
      ready: () => ready,
      warn,
    });
    const run = (n: number) => { for (let i = 0; i < n; i++) jump.tick(); };
    return { jump, log, states, run, setReady: () => { ready = true; }, warn };
  }

  it('waits for the save boot, finishes the tutorial, completes prerequisites in order, starts the quest, places the player', () => {
    const r = rig('m05');
    r.run(5);
    expect(r.log).toEqual([]);
    r.setReady();
    r.run(20);
    expect(r.jump.phase).toBe('done');
    const order = r.log.filter((l) => l.startsWith('complete:'));
    expect(order).toEqual(ACT1_PREREQS.m05.map((q) => `complete:${q}`));
    expect(r.log.indexOf('skip')).toBeLessThan(r.log.indexOf('start:m01'));
    expect(r.log).toContain('effects:[{"grantAbility":"surge-leap"}]');
    expect(r.log).toContain('effects:[{"unlockMercy":"spare"}]');
    expect(r.log).toContain('flag:world.brightwater.tollPost');
    expect(r.log.indexOf('effects:[{"unlockMercy":"spare"}]')).toBeLessThan(r.log.indexOf('complete:m04'));
    expect(r.states.get('m05')).toBe('active');
    expect(r.log.at(-1)).toBe('tp:npc-post.tobb');
  });

  it.each(ACT1_JUMP_IDS)('%s never writes a story.* flag by hand (only through node effects)', (id) => {
    const r = rig(id);
    r.setReady();
    r.run(40);
    expect(r.jump.phase).toBe('done');
    expect(r.log.filter((l) => /^flag:story\./.test(l))).toEqual([]);
  });

  it('a jump to M03 unlocks neither the Leap nor any mercy', () => {
    const r = rig('m03');
    r.setReady();
    r.run(20);
    expect(r.log.some((l) => l.includes('surge-leap') || l.includes('unlockMercy'))).toBe(false);
    expect(r.states.get('m03')).toBe('active');
  });

  it('keeps placing while the teleport is refused (busy, terrain loading) and finishes once it lands', () => {
    const r = rig('d01', { teleportRefusals: 3 });
    r.setReady();
    r.run(20);
    expect(r.jump.phase).toBe('done');
    expect(r.log.filter((l) => l.startsWith('tp:'))).toHaveLength(4);
  });

  it('a Phase B jump completes its prerequisites, leaves the quest offerable and stands by its giver', () => {
    for (const id of ACT1_PHASE_B_JUMP_IDS) {
      const r = rig(id);
      r.setReady();
      r.run(30);
      expect(r.jump.phase, id).toBe('done');
      expect(r.log.filter((l) => l.startsWith('complete:')), id).toEqual(ACT1_PREREQS[id].map((q) => `complete:${q}`));
      expect(r.states.get(id), id).toBeUndefined(); // never started
      expect(r.log.at(-1), id).toBe(`by:${ACT1_GIVERS[id]}`);
    }
  });

  it('M06: the bribe gold is granted before Rook\'s bribe choice runs, both before M06 completes', () => {
    const r = rig('m07');
    r.setReady();
    r.run(30);
    const gold = r.log.indexOf('gold:50');
    const bribe = r.log.findIndex((l) => l.includes('"route","value":"bribe"') || l.includes('"value":"bribe"'));
    expect(gold).toBeGreaterThan(-1);
    expect(bribe).toBeGreaterThan(gold);
    expect(r.log.indexOf('complete:m06')).toBeGreaterThan(bribe);
  });

  it('M07: Aldith\'s return node runs before the class choice, and both before M07 completes', () => {
    const r = rig('m08');
    r.setReady();
    r.run(30);
    const open = r.log.findIndex((l) => l.includes('story.m07.classOpen'));
    expect(open).toBeGreaterThan(-1);
    expect(r.log.indexOf('class:knight')).toBeGreaterThan(open);
    expect(r.log.indexOf('complete:m07')).toBeGreaterThan(r.log.indexOf('class:knight'));
  });

  it('warns when the class choice is refused and carries on', () => {
    const r = rig('m08', { classRefused: true });
    r.setReady();
    r.run(30);
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('class choice was refused'));
    expect(r.jump.phase).toBe('done');
  });

  it('a Phase B jump keeps standing by while the teleport is refused', () => {
    const r = rig('d02', { teleportRefusals: 2 });
    r.setReady();
    r.run(30);
    expect(r.jump.phase).toBe('done');
    expect(r.log.filter((l) => l.startsWith('by:'))).toHaveLength(3);
  });

  it('fails cleanly when the quest refuses to start', () => {
    const r = rig('r02', { startFails: true });
    r.setReady();
    r.run(20);
    expect(r.jump.phase).toBe('failed');
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('could not start r02'));
  });
});

// ---- the real plugin on every real plugin ----

let physics: PhysicsWorld;
let fake: FakeIndexedDb;
const cleanups: Array<() => void> = [];
beforeEach(async () => {
  (globalThis as { self?: unknown }).self ??= globalThis;
  physics = new PhysicsWorld();
  await physics.init();
  fake = new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake.factory;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  delete (globalThis as { indexedDB?: unknown }).indexedDB;
  delete (globalThis as { location?: unknown }).location;
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

async function jumpTo(search: string) {
  (globalThis as { location?: unknown }).location = { search };
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, new EventTarget(), Object.assign(new EventTarget(), { pointerLockElement: null }), { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  cleanups.push(() => { game.dispose(); world.dispose(); });
  await game.loadPlugins(PLUGIN_MODULES as Record<string, PluginModule>);
  const jump = (globalThis as { __act1?: Act1Jump }).__act1;
  for (let i = 0; i < 600 && jump && !jump.finished; i++) {
    game.fixedUpdate();
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  for (let i = 0; i < 30; i++) game.fixedUpdate();
  return { ctx: game.ctx, jump, quests: game.ctx.services.require('quests') };
}

describe('?act1= on the real game', () => {
  it('d01: every prerequisite done the real way, D01 active, Tobb joined, fog standing, nothing saved', async () => {
    const t = await jumpTo('?act1=d01&new');
    expect(t.jump?.phase).toBe('done');
    for (const q of ACT1_PREREQS.d01) expect(t.quests.state(q), q).toBe('completed');
    expect(t.quests.state('d01')).toBe('active');
    const s = t.ctx.state;
    expect(s.getBool('tutorial.complete')).toBe(true);
    expect(s.getBool('ability.surge-leap.learned')).toBe(true);
    expect(s.getBool('enemies.mercy.release')).toBe(true);
    expect(s.getBool('enemies.mercy.spare')).toBe(true);
    expect(s.getBool('story.m05.tobbJoined')).toBe(true);
    expect(s.getBool('story.m05.complete')).toBe(true);
    expect(s.getBool('world.deadroad.wardstones.done')).toBe(true);
    expect(s.getBool('shrine.quenchstone.lit')).toBe(true);
    expect(t.ctx.services.require('companions').active()).toContain('tobb');
    // The session hold keeps every save request away from the store.
    const r = await t.ctx.services.require('save').saveNow('manual');
    expect(r.ok).toBe(false);
    expect(fake.keys().filter((k) => k !== 'slot-0.backup')).toEqual([]);
  }, 60000);

  it('r02: only M01 and M02 done, R02 active, mercy still locked, the blocking dummies stand', async () => {
    const t = await jumpTo('?act1=r02&new');
    expect(t.jump?.phase).toBe('done');
    expect(t.quests.state('m03')).toBe('inactive');
    expect(t.quests.state('r02')).toBe('active');
    expect(t.ctx.state.getBool('enemies.mercy.release')).toBe(false);
    expect([...t.ctx.actors.all()].some((a) => a.kind === 'blocking-dummy') || !t.ctx.services.get('dummies')).toBe(true);
  }, 60000);

  it('leaves a real save on the same origin untouched (the &new boot skips the slot clear)', async () => {
    fake.seed('slot-0', slice1Complete);
    fake.seed('autosave', slice1Complete);
    // The save plugin reads its boot parameters from window.location.
    (globalThis as { window?: unknown }).window = { location: { search: '?act1=m03&new' } };
    const t = await jumpTo('?act1=m03&new');
    expect(t.jump?.phase).toBe('done');
    expect(fake.peek('slot-0')).toEqual(slice1Complete);
    expect(fake.peek('autosave')).toEqual(slice1Complete);
  }, 60000);

  it.each(ACT1_PHASE_B_JUMP_IDS)('%s: prerequisites done, the quest offerable, the player on the ground in Harrowmark beside the giver, nothing saved', async (id) => phaseBJump(id), 60000);

  type PhaseBId = (typeof ACT1_PHASE_B_JUMP_IDS)[number];
  async function phaseBJump(id: PhaseBId) {
    const t = await jumpTo(`?act1=${id}&new`);
    expect(t.jump?.phase).toBe('done');
    for (const q of ACT1_PREREQS[id]) expect(t.quests.state(q), q).toBe('completed');
    expect(t.quests.state(id)).toBe('inactive');
    const feet = t.ctx.player.feet;
    expect(regionAt(feet.x, feet.z)?.id).toBe('harrowmark');
    expect(Math.abs(feet.y - heightAt(feet.x, feet.z))).toBeLessThan(1.5);
    expect(t.ctx.services.require('interiors').current).toBeNull();
    const giver = t.ctx.services.require('npcs').position(ACT1_GIVERS[id]);
    expect(giver, ACT1_GIVERS[id]).toBeDefined();
    expect(Math.hypot(giver!.x - feet.x, giver!.z - feet.z), JSON.stringify({ feet, giver })).toBeLessThan(GIVER_STAND_OFF + 2);
    const s = t.ctx.state;
    if (id === 'm06') expect(feet.z).toBeLessThan(1250 - 1); // south of the portcullis
    else expect(s.getFlag('story.m06.route')).toBe('bribe');
    if (!['m06', 'm07'].includes(id)) {
      const classes = t.ctx.services.require('classes');
      expect(classes.chosen()).toBe(true);
      expect(classes.current()).toBe('knight');
      expect(s.getFlag('classes.drill.knight')).toBe('skipped');
    }
    if (id === 'd02') {
      expect(s.getFlag('story.r04.choice')).toBe('shield');
      expect(s.getFlag('world.harrowmark.inn.price')).toBe('collected');
      expect(s.getFlag('story.m08.stance')).toBe('steady');
      expect(s.getBool('story.d02.underwaysOpen')).toBe(false); // Rook's offer opens it
    }
    const r = await t.ctx.services.require('save').saveNow('manual');
    expect(r.ok).toBe(false);
  }

  it('without &new nothing happens', async () => {
    const t = await jumpTo('?act1=m04');
    expect(t.jump).toBeUndefined();
    expect(t.quests.state('m04')).toBe('inactive');
  }, 60000);
});
