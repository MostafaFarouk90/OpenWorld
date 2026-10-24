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
import { dialogueDefs } from '../dialogue/content';
import { ACT2_QUEST_DEFS } from './content/act2';
import { GIVER_STAND_OFF, nodeEffects } from './act1Jump';
import { ACT2_PREREQS } from './actJump';
import {
  ACT2_D_GIVERS, ACT2_GIVERS, ACT2_NODE_EFFECTS, ACT2_PHASE_C_IDS, ACT2_PHASE_D_IDS, ACT2_REKINDLE_AFTER, Act2Jump,
  type Act2AnyJumpId, giverOf, parseAct2,
} from './act2Jump';
import type { Condition } from './types';
import { POST_RULES, resolvePosts } from './posts';
import { ACT1_PREREQS } from './act1Jump';

describe('parseAct2', () => {
  it('accepts every Phase C and Phase D quest, and the ending, with &new and an optional class', () => {
    for (const id of [...ACT2_PHASE_C_IDS, ...ACT2_PHASE_D_IDS]) expect(parseAct2(`?act2=${id}&new`)).toEqual({ id, classId: 'knight', fresh: true });
    expect(parseAct2('?act2=r06&new&class=emberwright')).toMatchObject({ classId: 'emberwright' });
  });
  it('is null without the parameter and refuses unknown ids, classes or a missing &new', () => {
    expect(parseAct2('?act1=m03&new')).toBeNull();
    expect(parseAct2('?act2=m23&new')).toMatchObject({ error: expect.stringContaining('unknown quest') });
    expect(parseAct2('?act2=m11')).toMatchObject({ error: expect.stringContaining('&new') });
    expect(parseAct2('?act2=m11&new&class=bard')).toMatchObject({ error: expect.stringContaining('unknown class') });
  });
  it('a valid jump starts the tutorial from Kettlewick (no start screen); a refused one does not', () => {
    expect(tutorialFromQuery('?act2=m11&new')).toEqual({ mode: 'kettlewick' });
    expect(tutorialFromQuery('?act2=m11')).toBeNull();
    expect(tutorialFromQuery('?act1=m04&new')).toEqual({ mode: 'kettlewick' });
  });
});

describe('the prerequisite table follows the quest definitions', () => {
  const defs = new Map(ACT2_QUEST_DEFS.map((d) => [d.id, d]));
  const needs = (c: Condition | undefined, out: string[] = []): string[] => {
    if (!c) return out;
    if ('quest' in c) out.push(c.quest);
    else if ('all' in c) c.all.forEach((x) => needs(x, out));
    else if ('any' in c) throw new Error('an any-clause in startWhen needs a branch-aware closure');
    else if ('flag' in c && c.flag === 'story.gate.a2') out.push('@act1');
    return out;
  };
  const closure = (id: string, seen = new Set<string>()): Set<string> => {
    for (const n of needs(defs.get(id)?.startWhen)) {
      if (n === '@act1') [...ACT1_PREREQS.d02, 'd02'].forEach((q) => seen.add(q));
      else if (!seen.has(n)) { seen.add(n); closure(n, seen); }
    }
    return seen;
  };
  // Beyond startWhen: Ketta offers R05 before R07 and stands at Stonefold only once R05 is done, so R07 is only offerable after R05.
  const EXTRA: Record<string, string[]> = { r07: ['r05'] };
  it.each([...ACT2_PHASE_C_IDS, ...ACT2_PHASE_D_IDS.filter((q) => q !== 'ending')])('%s: the giver is the NPC whose dialogue carries its startQuest', (id) => {
    // Derived from the dialogue content, not from the giver tables, so a drifted table fails here.
    const owners = new Set<string>();
    for (const d of dialogueDefs) {
      for (const n of d.nodes) {
        for (const e of [...(n.effects ?? []), ...(n.choices ?? []).flatMap((c) => c.effects ?? [])]) {
          if ('startQuest' in e && e.startQuest === id) owners.add(d.id.replace(/^npc-/, ''));
        }
      }
    }
    expect([...owners], id).toContain(giverOf(id));
  });

  it.each([...ACT2_PHASE_C_IDS, ...ACT2_PHASE_D_IDS.filter((q) => q !== 'ending')])('%s: the table equals the transitive startWhen closure plus the giver gates', (id) => {
    const want = new Set([...closure(id), ...(EXTRA[id] ?? []).flatMap((q) => [q, ...closure(q)])]);
    expect([...ACT2_PREREQS[id]].sort()).toEqual([...want].sort());
  });
  it('the ending needs everything M22 does, and M22 itself is the jump\'s last step', () => {
    expect(ACT2_PREREQS.ending).toEqual(ACT2_PREREQS.m22);
    expect(ACT2_PREREQS.ending).not.toContain('m22');
    expect(ACT2_PREREQS.ending).toContain('d04');
  });
  it('lists exactly the Phase C and Phase D quests, in play order (no quest after a later one)', () => {
    const ids = [...ACT2_PHASE_C_IDS, ...ACT2_PHASE_D_IDS] as string[];
    expect(Object.keys(ACT2_PREREQS).sort()).toEqual(ids.sort());
    for (const id of ids) for (const p of ACT2_PREREQS[id]) {
      if (ids.includes(p)) expect(Object.keys(ACT2_PREREQS).indexOf(p), `${id} after ${p}`).toBeLessThan(Object.keys(ACT2_PREREQS).indexOf(id));
    }
  });
  it('every quest has a giver', () => {
    for (const id of [...ACT2_PHASE_C_IDS, ...ACT2_PHASE_D_IDS]) expect(giverOf(id), id).toBeTruthy();
    expect(Object.keys(ACT2_D_GIVERS)).toEqual([...ACT2_PHASE_D_IDS]);
    expect(Object.keys(ACT2_GIVERS)).toEqual([...ACT2_PHASE_C_IDS]);
  });
});

describe('node effects are read from the dialogue content', () => {
  it('every referenced node exists and carries effects', () => {
    for (const refs of Object.values(ACT2_NODE_EFFECTS)) for (const r of refs) {
      expect(nodeEffects(r.dialogueId, r.nodeId, dialogueDefs, r.choiceId)?.length, `${r.dialogueId}:${r.nodeId}`).toBeGreaterThan(0);
    }
    expect(nodeEffects('npc-hrolf', 'm13-oath-12')).toContainEqual({ setFlag: 'story.m13.hrolfJoined', value: true });
    expect(nodeEffects('npc-aelfreda', 'a2-rite-13')).toContainEqual({ setFlag: 'story.m14.aelfredaJoined', value: true });
  });
  it('rekindles only quests that are prerequisites of something', () => {
    for (const q of Object.keys(ACT2_REKINDLE_AFTER)) expect(ACT2_PHASE_C_IDS).toContain(q);
  });
});

describe('Act2Jump (fakes)', () => {
  function rig(id: Act2AnyJumpId, opts: { missing?: boolean; teleportRefusals?: number; classRefused?: boolean } = {}) {
    let refusals = opts.teleportRefusals ?? 0;
    const states = new Map<string, string>();
    const log: string[] = [];
    const tut = { begun: false, complete: false, beat: null as string | null, restartInFlight: false,
      begin() { this.begun = true; this.beat = 't15'; },
      skipCurrent() { this.beat = null; this.complete = true; } };
    let ready = false;
    const warn = vi.fn();
    const jump = new Act2Jump(id, {
      tutorial: () => tut,
      quests: {
        state: (q) => states.get(q) ?? 'inactive',
        start: (q) => { states.set(q, 'active'); log.push(`start:${q}`); return true; },
        complete: (q) => { states.set(q, 'completed'); log.push(`complete:${q}`); return true; },
      },
      runEffects: (e) => log.push(`effects:${JSON.stringify(e)}`),
      setFlag: (f) => log.push(`flag:${f}`),
      rekindle: (w) => log.push(`rekindle:${w}`),
      giveGold: (n) => log.push(`gold:${n}`),
      chooseClass: (c) => { log.push(`class:${c}`); return !opts.classRefused; },
      teleportTo: (a) => { log.push(`tp:${a}`); return true; },
      standBy: (n) => { log.push(`by:${n}`); return refusals-- <= 0; },
      hasQuest: () => !opts.missing,
      ready: () => ready,
      warn,
    }, 'emberwright');
    const run = (n: number) => { for (let i = 0; i < n; i++) jump.tick(); };
    return { jump, log, states, run, setReady: () => { ready = true; }, warn };
  }

  it('waits for the boot, then the tutorial, then does the work', () => {
    const r = rig('m12');
    r.run(5);
    expect(r.jump.phase).toBe('waiting');
    r.setReady();
    r.run(40);
    expect(r.jump.phase).toBe('done');
  });
  it('marks the Act 1 card and camp seen before D02 completes, and sets the gate before standing by the giver', () => {
    const r = rig('m11');
    r.setReady();
    r.run(40);
    const seen = r.log.indexOf('flag:story.d02.campSeen');
    expect(seen).toBeGreaterThan(-1);
    expect(seen).toBeLessThan(r.log.indexOf('complete:d02'));
    expect(r.log.indexOf('flag:codex.actEndingSeen')).toBeLessThan(r.log.indexOf('complete:d02'));
    expect(r.log.indexOf('flag:story.gate.a2')).toBeGreaterThan(r.log.indexOf('complete:d02'));
    expect(r.log.indexOf('flag:story.gate.a2')).toBeLessThan(r.log.indexOf('by:gaut'));
    expect(r.log.filter((l) => l.startsWith('class:'))).toEqual(['class:emberwright']);
  });
  it('completes the Phase C prerequisites in order and leaves the target offerable (never started)', () => {
    const r = rig('m14');
    r.setReady();
    r.run(40);
    for (const q of ['m11', 'm12', 'm13']) expect(r.states.get(q), q).toBe('completed');
    expect(r.states.get('m14')).toBeUndefined();
    expect(r.log.filter((l) => l.startsWith('complete:')).map((l) => l.slice(9)).slice(-3)).toEqual(['m11', 'm12', 'm13']);
    expect(r.log).toContain('rekindle:cinder-road');
    expect(r.log.some((l) => l.includes('story.m13.hrolfJoined'))).toBe(true);
    expect(r.log.some((l) => l.includes('story.m14.aelfredaJoined'))).toBe(false);
    expect(r.log).toContain('by:aelfreda');
  });
  it('the last quest has every earlier one done, including M14 and its Anvil', () => {
    const r = rig('d03');
    r.setReady();
    r.run(40);
    for (const q of ['m11', 'm12', 'm13', 'm14', 'm15']) expect(r.states.get(q), q).toBe('completed');
    expect(r.log).toContain('rekindle:hushed-anvil');
    expect(r.log.some((l) => l.includes('story.m14.aelfredaJoined'))).toBe(true);
  });
  it('Phase D: completes the Oldsmoke chain in play order and stands by the quest\'s giver', () => {
    const r = rig('m19');
    r.setReady();
    r.run(60);
    const done = r.log.filter((l) => l.startsWith('complete:')).map((l) => l.slice(9));
    expect(done.slice(-5)).toEqual(['m15', 'd03', 'm16', 'm17', 'm18']);
    expect(r.states.get('m19')).toBeUndefined();
    expect(r.log).toContain('by:wenna');
    expect(r.log).not.toContain('flag:story.phase.oldsmokeOpen');
    expect(r.jump.phase).toBe('done');
  });
  it('the ending completes M22 last, after placing the player beside Wystan', () => {
    const r = rig('ending');
    r.setReady();
    r.run(60);
    expect(r.jump.phase).toBe('done');
    const done = r.log.filter((l) => l.startsWith('complete:')).map((l) => l.slice(9));
    expect(done.at(-1)).toBe('m22');
    expect(done).toContain('d04');
    expect(r.log.indexOf('by:wystan')).toBeLessThan(r.log.indexOf('complete:m22'));
    expect(r.log.filter((l) => l === 'complete:m22')).toHaveLength(1);
  });
  it('the ending fails cleanly when M22 is not registered', () => {
    const r = rig('ending', { missing: true });
    r.setReady();
    r.run(60);
    expect(r.jump.phase).toBe('failed');
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('quest m22 is not registered'));
  });
  it('keeps standing by while the teleport is refused', () => {
    const r = rig('m11', { teleportRefusals: 2 });
    r.setReady();
    r.run(40);
    expect(r.jump.phase).toBe('done');
    expect(r.log.filter((l) => l.startsWith('by:'))).toHaveLength(3);
  });
  it('fails cleanly when the Act 2 defs are not registered', () => {
    const r = rig('m11', { missing: true });
    r.setReady();
    r.run(40);
    expect(r.jump.phase).toBe('failed');
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('not registered'));
  });
  it('warns when the class choice is refused and carries on', () => {
    const r = rig('m11', { classRefused: true });
    r.setReady();
    r.run(40);
    expect(r.warn).toHaveBeenCalledWith(expect.stringContaining('class choice was refused'));
    expect(r.jump.phase).toBe('done');
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
  const jump = (globalThis as { __act2?: Act2Jump }).__act2;
  for (let i = 0; i < 600 && jump && !jump.finished; i++) {
    game.fixedUpdate();
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  for (let i = 0; i < 30; i++) game.fixedUpdate();
  return { ctx: game.ctx, jump, quests: game.ctx.services.require('quests') };
}


describe('?act2= on the real game', () => {
  it.each([...ACT2_PHASE_C_IDS, ...ACT2_PHASE_D_IDS.filter((x) => x !== 'ending')] as const)('%s: Act 1 done, prerequisites done, the quest offerable, the player beside the giver, nothing saved', async (id) => {
    const t = await jumpTo(`?act2=${id}&new`);
    expect(t.jump?.phase).toBe('done');
    for (const q of ACT2_PREREQS[id]) expect(t.quests.state(q), q).toBe('completed');
    expect(t.quests.state(id)).toBe('inactive');
    const s = t.ctx.state;
    expect(s.getBool('story.gate.a2')).toBe(true);
    expect(s.getBool('story.d02.campSeen')).toBe(true);
    const feet = t.ctx.player.feet;
    // The giver's post now (quest post rules, else where the layout put the NPC; the NPC itself walks there on later ticks).
    const posts = resolvePosts(POST_RULES, { state: t.ctx.state, quests: t.quests as never });
    const post = t.ctx.anchors.find(posts[giverOf(id)]?.anchorId ?? '');
    const at = post?.position ?? t.ctx.services.require('npcs').position(giverOf(id));
    expect(at, giverOf(id)).toBeDefined();
    expect(Math.hypot(at!.x - feet.x, at!.z - feet.z), JSON.stringify({ id, feet, at })).toBeLessThan(GIVER_STAND_OFF + 1);
    const done = (q: string) => ACT2_PREREQS[id].includes(q);
    expect(s.getBool('story.m13.hrolfJoined')).toBe(done('m13'));
    expect(s.getBool('story.m14.aelfredaJoined')).toBe(done('m14'));
    if (done('m14')) expect(s.getBool('shrine.hushed-anvil.lit')).toBe(true);
    // Phase D: the pass is open on D03 alone (no hold flag exists to set) and the act has not ended.
    expect(t.ctx.services.require('containment').isOpen(19500, 9500)).toBe(done('d03'));
    expect(s.getFlag('story.phase.oldsmokeOpen')).toBeUndefined();
    expect(s.getBool('story.gate.a3')).toBe(false);
    const r = await t.ctx.services.require('save').saveNow('manual');
    expect(r.ok).toBe(false);
  }, 90000);

  it('?act2=ending completes every quest, ends the act once and leaves the card and camp scene to play', async () => {
    const t = await jumpTo('?act2=ending&new');
    expect(t.jump?.phase).toBe('done');
    for (const q of [...ACT2_PREREQS.ending, 'm22']) expect(t.quests.state(q), q).toBe('completed');
    const s = t.ctx.state;
    expect(s.getBool('story.gate.a3')).toBe(true);
    // The Act 1 ending was silenced; the Act 2 one was not (its camp scene is the player's to see).
    expect(s.getBool('story.d02.campSeen')).toBe(true);
    expect(s.getBool('story.a2.campSeen')).toBe(false);
    expect(t.ctx.services.require('companions').maxActive()).toBe(2);
  }, 90000);

  it('seats the active companion: Hrolf after M13, Aelfreda after M14 (the party holds one until the act ends)', async () => {
    const m15 = await jumpTo('?act2=m15&new');
    expect(m15.ctx.services.require('companions').active()).toEqual(['aelfreda']);
  }, 90000);

  it('leaves a real save on the same origin untouched', async () => {
    fake.seed('slot-0', slice1Complete);
    fake.seed('autosave', slice1Complete);
    (globalThis as { window?: unknown }).window = { location: { search: '?act2=m11&new' } };
    const t = await jumpTo('?act2=m11&new');
    expect(t.jump?.phase).toBe('done');
    expect(fake.peek('slot-0')).toEqual(slice1Complete);
    expect(fake.peek('autosave')).toEqual(slice1Complete);
  }, 90000);

  it('&class=emberwright reaches the class choice (review-b L1); with no &class the jump plays the Knight', async () => {
    const t = await jumpTo('?act2=r06&new&class=emberwright');
    expect(t.jump?.phase).toBe('done');
    expect(t.ctx.services.require('classes').current()).toBe('emberwright');
    expect(t.ctx.state.getBool('story.r06.emberwright')).toBe(true);
    for (const c of cleanups.splice(0)) c();
    const k = await jumpTo('?act2=r06&new');
    expect(k.ctx.services.require('classes').current()).toBe('knight');
  }, 180000);

  it('without &new nothing happens', async () => {
    const t = await jumpTo('?act2=m11');
    expect(t.jump).toBeUndefined();
    expect(t.quests.state('m11')).toBe('inactive');
  }, 90000);
});
