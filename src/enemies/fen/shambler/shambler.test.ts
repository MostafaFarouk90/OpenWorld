import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ActorRegistry } from '../../../actors/ActorRegistry';
import { FIXED_TIMESTEP } from '../../../config/constants';
import { GameEvents } from '../../../core/events';
import { fakeActions, fakeContexts } from '../../../interaction/testkit';
import { InteractionSystem, type Interactable } from '../../../interaction/InteractionSystem';
import { WorldState } from '../../../state/WorldState';
import { ENEMY_DEFS } from '../../defs';
import { EnemyManager } from '../../EnemyManager';
import { GroupStanding } from '../../groupStanding';
import { mercyInteractableId, mercyPromptKey } from '../../mercy';
import type { SpawnerDef } from '../../types';
import { FakeHost, loadKnight } from '../../testing/fakeHost';
import '../overlays';
import { registerPeatPatch } from '../peat';
import { FEN_TUNING } from '../tuning';
import { PEAT_SHAMBLER } from './def';
import { dragInteractableId, shamblerView } from './peat';

const DT = FIXED_TIMESTEP;
const T = FEN_TUNING.shambler;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});

const undo: Array<() => void> = [];
afterEach(() => {
  for (const u of undo.splice(0)) u();
});

/** Real InteractionSystem and EnemyManager over the fake core; one Peat Shambler at the origin, the player 2 m south facing it. */
function rig(opts: { group?: boolean; calm?: boolean; patch?: { x: number; z: number; radius: number }; player?: { x: number; z: number } } = {}) {
  if (opts.patch) undo.push(registerPeatPatch({ id: 'test.bog', ...opts.patch }));
  const events = new GameEvents((m, e) => {
    throw new Error(`${m} ${String(e)}`);
  });
  const actors = new ActorRegistry(events);
  const state = new WorldState(events, () => {});
  const player = actors.spawn({ id: 'player', kind: 'player', team: 'player', maxHealth: 100 });
  const input = fakeActions();
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: opts.player?.x ?? 0, y: 0, z: opts.player?.z ?? 2 } });
  const interaction = new InteractionSystem({
    events,
    actions: () => input.actions,
    contexts: fakeContexts().stack,
    player: () => ({ actor: player, feet: fake.playerFeet, facingYaw: 0, moving: false }),
  });
  if (opts.calm ?? true) fake.flags.set('enemies.mercy.calm', true);
  const host = {
    ...fake.host,
    interaction: { register: (i: unknown) => interaction.register(i as Interactable) },
    calmUi: {
      focusedId: () => interaction.focusFor('mercy')?.id ?? null,
      holding: () => interaction.holdProgressFor('mercy') > 0,
      modalOpen: () => false,
      claimWheel: () => () => {},
      consumeWheel: () => 0,
      text: (k: string) => k,
    },
  };
  fake.defineAnchor('bog', 0, 0);
  const bog: SpawnerDef = { id: 'bog', enemy: 'peat-shambler', count: 1, anchor: 'bog', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false };
  const manager = new EnemyManager(host, FakeHost.factory(gltf), { spawners: opts.group ? [bog] : [], seed: 7 });
  const mercies: unknown[] = [];
  fake.bus.on('mercy', (e) => void mercies.push(e));
  const id = opts.group ? manager.service.spawnGroup('bog')[0]! : manager.spawnLoose('peat-shambler', { x: 0, y: 0, z: 0 })!;
  const enemy = manager.get(id)!;
  const frame = () => {
    manager.think(DT);
    manager.animate(DT);
    fake.combatStep(DT);
    manager.react(DT);
    interaction.fixedUpdate(DT);
    manager.render(1);
  };
  const seconds = (s: number) => {
    for (let i = 0, n = Math.round(s / DT); i < n; i++) frame();
  };
  const hold = (action: 'interact' | 'mercy', s: number) => {
    input.press(action);
    frame();
    input.hold(action);
    seconds(s);
    input.release(action);
    frame();
  };
  const actor = () => fake.actorMap.get(id)!;
  const stagger = () => {
    fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 1000, kind: 'melee' });
    frame();
  };
  /** Moves the shambler's simulated feet (the mover keeps them; the fake has no physics). */
  const place = (x: number, z: number) => {
    (enemy as unknown as { mover: { teleport(p: THREE.Vector3Like): void } }).mover.teleport({ x, y: 0, z });
  };
  const view = () => shamblerView(id)!;
  const phase = () => (enemy as unknown as { phase: string }).phase;
  const dragFocused = () => interaction.focusFor('interact')?.id === dragInteractableId(enemy.slug);
  const mercyFocused = () => interaction.focusFor('mercy')?.id === mercyInteractableId(enemy.slug);
  return { id, enemy, phase, manager, fake, events, interaction, input, state, frame, seconds, hold, actor, stagger, place, view, dragFocused, mercyFocused, mercies };
}

/** Breaks its poise in the peat and drags it out with a full F hold. */
function dragOut(r: ReturnType<typeof rig>) {
  r.stagger();
  expect(r.view().dragOffered).toBe(true);
  r.hold('interact', T.dragHoldSeconds + 0.1);
  expect(r.view().slumped).toBe(true);
}

describe('Peat Shambler def', () => {
  it('is registered with the Lay to rest calm, free, behind the pulled-out precondition', () => {
    expect(ENEMY_DEFS['peat-shambler']).toBe(PEAT_SHAMBLER);
    expect(PEAT_SHAMBLER.mercy).toMatchObject({ verb: 'calm', when: 'staggered', freeCalm: 'always', calmForm: 'layToRest', precondition: 'pulledOut' });
    expect(PEAT_SHAMBLER.behaviour).toBe('peat');
    expect(PEAT_SHAMBLER.maxPoise).toBe(150);
  });

  it('the Drag out id has no dots', () => {
    expect(dragInteractableId('peat-shambler-3')).toBe('drag:peat-shambler-3');
    expect(dragInteractableId('greyfen.shambler.1')).toBe('drag:greyfen-shambler-1');
  });
});

describe('Peat Shambler in the peat', () => {
  it('regenerates health and poise only inside its patch', () => {
    const r = rig({ player: { x: 0, z: 30 } });
    r.actor().health = 100;
    r.actor().poise = 10;
    r.seconds(1);
    expect(r.actor().health).toBeGreaterThan(100);
    expect(r.actor().poise).toBeGreaterThan(10);
    r.place(FEN_TUNING.wallowRadius + 3, 0);
    r.frame();
    expect(r.view().inPeat).toBe(false);
    const h = r.actor().health;
    r.actor().poise = 10;
    r.seconds(1);
    expect(r.actor().health).toBe(h);
    expect(r.actor().poise).toBe(10);
  });

  it('a loose spawn wallows in a default patch; a registered patch under the spawn wins', () => {
    expect(rig().view().patch).toMatchObject({ id: 'wallow', x: 0, z: 0, radius: FEN_TUNING.wallowRadius });
    expect(rig({ patch: { x: 3, z: 0, radius: 9 } }).view().patch).toMatchObject({ id: 'test.bog', x: 3, radius: 9 });
  });

  it('chases no farther than the leash past its patch', () => {
    const r = rig({ player: { x: 0, z: 40 } });
    r.fake.loud = true;
    r.seconds(40);
    const f = r.enemy.feet;
    expect(Math.hypot(f.x, f.z)).toBeLessThanOrEqual(FEN_TUNING.wallowRadius + T.leashBeyondPatch + 0.3);
  });

  it('hold T before it is pulled out offers nothing (no prompt, no lock)', () => {
    const r = rig();
    r.stagger();
    expect(r.enemy.calmContext()).toEqual({ pulledOut: false });
    expect(r.mercyFocused()).toBe(false);
    r.hold('mercy', 2);
    expect(r.mercies).toHaveLength(0);
    expect(r.phase()).toBe('alive');
  });

  it('Drag out is offered only while staggered in the peat', () => {
    const r = rig();
    r.frame();
    expect(r.view().dragOffered).toBe(false);
    expect(r.dragFocused()).toBe(false);
    r.stagger();
    expect(r.view().dragOffered).toBe(true);
    expect(r.dragFocused()).toBe(true);
    r.seconds(PEAT_SHAMBLER.breakStaggerSeconds! + 0.5);
    expect(r.view().dragOffered).toBe(false);
  });
});

describe('Drag out', () => {
  it('a full hold moves it to firm ground past the edge and slumps it', () => {
    const r = rig();
    dragOut(r);
    const f = r.enemy.feet;
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(FEN_TUNING.wallowRadius + T.dragClear, 1);
    expect(r.view().inPeat).toBe(false);
    expect(r.enemy.calmContext()).toEqual({ pulledOut: true });
  });

  it('releasing F early cancels: no move, no slump', () => {
    const r = rig();
    r.stagger();
    r.hold('interact', T.dragHoldSeconds / 2);
    expect(r.view().slumped).toBe(false);
    expect(Math.hypot(r.enemy.feet.x, r.enemy.feet.z)).toBeLessThan(0.5);
  });

  it('a hit on the player mid-hold cancels it', () => {
    const r = rig();
    r.stagger();
    r.input.press('interact');
    r.frame();
    r.input.hold('interact');
    r.seconds(T.dragHoldSeconds / 2);
    r.events.emit('damage.dealt', { outcome: 'hit', kind: 'melee', targetId: 'player' } as never);
    r.seconds(T.dragHoldSeconds);
    r.input.release('interact');
    r.frame();
    expect(r.view().slumped).toBe(false);
  });

  it('the shambler dying mid-hold cancels it', () => {
    const r = rig();
    r.stagger();
    r.input.press('interact');
    r.frame();
    r.input.hold('interact');
    r.seconds(T.dragHoldSeconds / 3);
    r.fake.apply({ attackerId: 'player', targetId: r.id, amount: 10_000, poise: 0, kind: 'melee' });
    r.seconds(T.dragHoldSeconds);
    r.input.release('interact');
    r.frame();
    expect(shamblerView(r.id)?.slumped ?? false).toBe(false);
  });

  it('never touches the player movement mode', () => {
    const r = rig();
    const before = [...r.fake.moveModifiers.keys()];
    dragOut(r);
    expect([...r.fake.moveModifiers.keys()]).toEqual(before);
  });
});

describe('Pulled out: Lay to rest', () => {
  it('a poise break on firm ground slumps it too', () => {
    const r = rig({ player: { x: 9, z: 2 } });
    r.place(FEN_TUNING.wallowRadius + 2, 0);
    r.frame();
    r.stagger();
    expect(r.view().slumped).toBe(true);
    expect(r.enemy.calmContext()).toEqual({ pulledOut: true });
  });

  it('hold T while slumped lays it to rest: a calm mercy, it sinks and is gone', () => {
    const r = rig();
    dragOut(r);
    r.fake.movePlayer(r.enemy.feet.x, r.enemy.feet.z + 2);
    r.frame();
    expect(r.mercyFocused()).toBe(true);
    r.hold('mercy', 2);
    expect(r.mercies).toHaveLength(1);
    expect(r.mercies[0]).toMatchObject({ verb: 'calm', creature: 'peat-shambler' });
    r.seconds(T.sinkSeconds + 1);
    expect(r.manager.get(r.id)).toBeUndefined();
  });

  it('before Calm is unlocked there is no prompt, and it rises when the slump runs out', () => {
    const r = rig({ calm: false });
    dragOut(r);
    r.fake.movePlayer(r.enemy.feet.x, r.enemy.feet.z + 2);
    r.frame();
    expect(r.mercyFocused()).toBe(false);
    r.hold('mercy', 2);
    expect(r.mercies).toHaveLength(0);
    r.seconds(T.slumpSeconds);
    expect(r.view().slumped).toBe(false);
    expect(r.phase()).toBe('alive');
  });

  it('the slump running out mid-hold pays nothing', () => {
    const r = rig();
    dragOut(r);
    r.fake.movePlayer(r.enemy.feet.x, r.enemy.feet.z + 2);
    // The 0.5 s hold starts 0.2 s before the window shuts.
    r.seconds(T.slumpSeconds - 0.2 - 3 * DT);
    expect(r.view().slumped).toBe(true);
    r.hold('mercy', 0.6);
    expect(r.mercies).toHaveLength(0);
    expect(r.view().slumped).toBe(false);
  });

  it('a hit while slumped closes the window (fire included)', () => {
    const r = rig();
    dragOut(r);
    r.fake.movePlayer(r.enemy.feet.x, r.enemy.feet.z + 2);
    r.fake.apply({ attackerId: 'player', targetId: r.id, amount: 1, poise: 0, kind: 'spell', attackId: 'emberwright.bolt' });
    r.frame();
    expect(r.enemy.mercyOpen).toBe(false);
    r.hold('mercy', 2);
    expect(r.mercies).toHaveLength(0);
  });

  it('a further poise break while slumped does not restart the window', () => {
    const r = rig();
    dragOut(r);
    r.seconds(T.slumpSeconds - 1);
    r.stagger();
    r.seconds(1.2);
    expect(r.view().slumped).toBe(false);
  });

  it('a load while it sinks leaves no half-sunk body behind', () => {
    const r = rig({ group: true });
    dragOut(r);
    r.fake.movePlayer(r.enemy.feet.x, r.enemy.feet.z + 2);
    r.hold('mercy', 0.7);
    expect(r.mercies).toHaveLength(1);
    r.seconds(T.sinkSeconds / 2);
    expect(r.manager.get(r.id)).toBeDefined();
    r.fake.loadFlags({ 'enemies.mercy.calm': true });
    r.frame();
    expect(r.manager.get(r.id)).toBeUndefined();
    expect(shamblerView(r.id)).toBeUndefined();
    // Whatever the group refills with starts fresh in its peat.
    for (const e of r.manager.service.ground.all()) {
      if (e.def.kind === 'peat-shambler') expect(shamblerView(e.id)).toMatchObject({ slumped: false, inPeat: true });
    }
  });

  it('laid to rest mid-fight, the group reads cleared at once (no soft lock while it sinks)', () => {
    const r = rig({ group: true });
    const gs = new GroupStanding({
      alive: (g) => r.manager.service.alive(g),
      isDead: (a) => r.fake.actorMap.get(a)?.dead ?? true,
      on: (t, fn) => r.fake.bus.on(t as never, fn as never),
    });
    expect(gs.isCleared('bog')).toBe(false);
    dragOut(r);
    expect(gs.isCleared('bog')).toBe(false);
    r.fake.movePlayer(r.enemy.feet.x, r.enemy.feet.z + 2);
    r.hold('mercy', 0.7);
    expect(r.manager.get(r.id)).toBeDefined();
    expect(gs.isCleared('bog')).toBe(true);
    gs.dispose?.();
  });

  it("a companion's hit and a scripted hit leave the window open; a status tick from the player closes it", () => {
    const r = rig();
    dragOut(r);
    const ally = r.fake.host.actors.spawn({ kind: 'companion:test', team: 'ally', maxHealth: 50 });
    r.fake.apply({ attackerId: ally.id, targetId: r.id, amount: 3, poise: 0, kind: 'melee' });
    r.fake.apply({ attackerId: 'player', targetId: r.id, amount: 0, poise: 5, kind: 'script' });
    r.frame();
    expect(r.enemy.mercyOpen).toBe(true);
    r.fake.apply({ attackerId: 'player', targetId: r.id, amount: 1, poise: 0, kind: 'status' });
    r.frame();
    expect(r.enemy.mercyOpen).toBe(false);
  });

  it('the hit that breaks it on firm ground does not close its own window', () => {
    const r = rig({ player: { x: 9, z: 2 } });
    r.place(FEN_TUNING.wallowRadius + 2, 0);
    r.frame();
    r.stagger();
    expect(r.enemy.mercyOpen).toBe(true);
  });

  it('the prompt reads Lay to rest (mercyPromptKey)', () => {
    expect(mercyPromptKey(PEAT_SHAMBLER as Parameters<typeof mercyPromptKey>[0])).toBe('enemies.mercy.layToRest');
    expect(mercyPromptKey(ENEMY_DEFS['ember-hound'] as Parameters<typeof mercyPromptKey>[0])).toBe('enemies.mercy.calm');
  });
});
