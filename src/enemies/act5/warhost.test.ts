// The Warhost (plans/act5-N5.md): defs, roles, the shield-line break, Spare, the skins, kill XP and the census. A fake host
// runs the real EnemyManager with the warhost overlay registered.
import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FIXED_TIMESTEP } from '../../config/constants';
import { ENEMY_DEFS, TELEGRAPH_STYLE } from '../defs';
import { EnemyManager } from '../EnemyManager';
import { mercyInteractableId } from '../mercy';
import { ENEMY_SKINS, applyEnemySkin } from '../skins';
import { FakeHost, loadKnight } from '../testing/fakeHost';
import type { SpawnerDef } from '../types';
import { killXp } from '../../progression/tuning';
import { CALDERA_KILL_XP_FACTOR } from '../../region/act5Regions';
import { act5Level } from '../level';
import { CALDERA_CODEX_ROWS } from './codex';
import { calderaAmbientCensus } from './census';
import { warhostLineLint } from './lint';
import './overlays';
import { WARHOST_GUARD_DEF, WARHOST_ROLE_MOVES, WARHOST_SOLDIER } from './warhost/def';
import { clearLines, lineBroken, lineSize, lineStaggered, joinLine, resetLines } from './warhost/lines';
import { warhostView } from './warhost/overlay';

const DT = FIXED_TIMESTEP;
let gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
beforeAll(async () => {
  gltf = await loadKnight();
});
beforeEach(() => clearLines());

type Role = 'shield' | 'pike' | 'torch';
function rig(groups: Array<{ id: string; role: Role; count: number; enemy?: 'warhost-soldier' | 'warhost-guard'; tag?: string }>) {
  const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
  fake.defineAnchor('a', 0, 0);
  fake.flags.set('enemies.mercy.spare', true);
  const defs: SpawnerDef[] = groups.map((g) => ({
    id: g.id, tag: g.tag ?? 'line', enemy: g.enemy ?? 'warhost-soldier', role: g.role, count: g.count, anchor: 'a',
    band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false,
  }));
  const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 5 });
  const tick = (seconds = DT): void => {
    for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) {
      m.think(DT);
      m.animate(DT);
      fake.combatStep(DT);
      m.react(DT);
    }
  };
  const spawn = (id: string) => m.service.spawnGroup(id, { aggro: true }).map((a) => ({ id: a, enemy: m.get(a)! }));
  const stagger = (id: string) => fake.apply({ attackerId: 'player', targetId: id, amount: 1, poise: 999, kind: 'melee' } as never);
  return { fake, m, tick, spawn, stagger };
}

describe('Warhost defs', () => {
  it('registers both kinds with telegraph styles and the design numbers', () => {
    expect(ENEMY_DEFS['warhost-soldier']).toBe(WARHOST_SOLDIER);
    expect(ENEMY_DEFS['warhost-guard']).toBe(WARHOST_GUARD_DEF);
    expect(TELEGRAPH_STYLE['warhost-soldier']).toBeDefined();
    expect(WARHOST_SOLDIER.maxPoise).toBe(40);
    expect(WARHOST_GUARD_DEF.model.scale).toBe(1.1);
    expect(WARHOST_SOLDIER.mercy).toMatchObject({ verb: 'spare', tier: 'normal', track: 'halvard' });
    expect(WARHOST_GUARD_DEF.mercy).toMatchObject({ verb: 'spare', tier: 'elite', track: 'halvard' });
  });
  it('carries the telegraphs: pike 0.6 s, torch 0.8 s, torch dodge-only, every move belongs to a role', () => {
    const mv = (id: string) => WARHOST_SOLDIER.moves.find((x) => x.id === id)!;
    expect(mv('warhost.thrust').windup).toBe(0.6);
    expect(mv('warhost.torch').windup).toBe(0.8);
    expect(mv('warhost.torch').telegraph).toBe('dodge');
    expect(mv('warhost.thrust').range[1]).toBeCloseTo(3.2);
    expect(WARHOST_SOLDIER.moves.filter((x) => x.telegraph === 'dodge').map((x) => x.id)).toEqual(['warhost.torch']);
    const union = new Set([...WARHOST_ROLE_MOVES.shield, ...WARHOST_ROLE_MOVES.pike, ...WARHOST_ROLE_MOVES.torch]);
    for (const m of WARHOST_SOLDIER.moves) expect(union.has(m.id)).toBe(true);
  });
  it('pays 120 and 300 at an even level in the Caldera (stored 40 and 100, x 3.0) and nothing is paid at x 1 beyond the base', () => {
    expect(CALDERA_KILL_XP_FACTOR).toBeGreaterThanOrEqual(3.0);
    expect(CALDERA_KILL_XP_FACTOR).toBeLessThanOrEqual(3.4);
    expect(killXp('warhost-soldier', 35, 35, 3.0)).toBe(120);
    expect(killXp('warhost-guard', 35, 35, 3.0)).toBe(300);
    expect(killXp('warhost-soldier', 35, 35)).toBe(40);
  });
});

describe('roles', () => {
  it('each role offers only its own moves', () => {
    const t = rig([{ id: 's', role: 'shield', count: 1, tag: 'a' }, { id: 'p', role: 'pike', count: 1, tag: 'b' }, { id: 't', role: 'torch', count: 1, tag: 'c' }]);
    const s = t.spawn('s')[0]!, p = t.spawn('p')[0]!, q = t.spawn('t')[0]!;
    expect(warhostView(s.id)!.role).toBe('shield');
    expect(warhostView(p.id)!.role).toBe('pike');
    expect(warhostView(q.id)!.role).toBe('torch');
    const allowed = (e: typeof s.enemy) => WARHOST_SOLDIER.moves.filter((mv) => (e as unknown as { overlay: { allowMove(m: unknown): boolean } }).overlay.allowMove(mv)).map((x) => x.id).sort();
    expect(allowed(s.enemy)).toEqual(['warhost.chop', 'warhost.push']);
    expect(allowed(p.enemy)).toEqual(['warhost.chop', 'warhost.thrust']);
    expect(allowed(q.enemy)).toEqual(['warhost.chop', 'warhost.torch']);
  });
  it('only shield members carry a guard (the spawner passes guard by role)', () => {
    const t = rig([{ id: 's', role: 'shield', count: 1, tag: 'a' }, { id: 'p', role: 'pike', count: 1, tag: 'b' }]);
    const g = (e: unknown) => (e as { guard: unknown }).guard;
    expect(g(t.spawn('s')[0]!.enemy)).not.toBeNull();
    expect(g(t.spawn('p')[0]!.enemy)).toBeNull();
  });
  it('a spawner role that is missing or unknown reads as shield', () => {
    const t = rig([{ id: 's', role: 'shield', count: 1 }]);
    const [a] = t.spawn('s');
    expect(warhostView(a!.id)!.role).toBe('shield');
  });
});

describe('the shield line (pure bookkeeping)', () => {
  const member = (role: Role, log: string[], id: string) => ({ role, kneel: () => (log.push(id), true) });
  it('two shield staggers within a second break it and kneel both; one does not; 1.2 s apart does not', () => {
    const log: string[] = [];
    joinLine('L', 'a', member('shield', log, 'a'));
    joinLine('L', 'b', member('shield', log, 'b'));
    joinLine('L', 'p', member('pike', log, 'p'));
    expect(lineStaggered('L', 'a', 10).kneel).toEqual([]);
    expect(lineBroken('L')).toBe(false);
    expect(lineStaggered('L', 'b', 11.2).kneel).toEqual([]);
    const r = lineStaggered('L', 'a', 11.9);
    expect(r.brokeNow).toBe(true);
    expect(new Set(r.kneel)).toEqual(new Set(['a', 'b']));
  });
  it('a pike caught in the window kneels too, a broken line kneels each later stagger, and a reset makes it whole', () => {
    const log: string[] = [];
    joinLine('L', 'a', member('shield', log, 'a'));
    joinLine('L', 'b', member('shield', log, 'b'));
    joinLine('L', 'p', member('pike', log, 'p'));
    lineStaggered('L', 'p', 1);
    lineStaggered('L', 'a', 1.2);
    expect(new Set(lineStaggered('L', 'b', 1.4).kneel)).toEqual(new Set(['p', 'a', 'b']));
    expect(lineStaggered('L', 'p', 9).kneel).toEqual(['p']);
    resetLines();
    expect(lineBroken('L')).toBe(false);
    expect(lineStaggered('L', 'a', 20).kneel).toEqual([]);
  });
  it('an unknown line or member is ignored, and the lint flags a line with fewer than two shields', () => {
    expect(lineStaggered('nope', 'a', 1).kneel).toEqual([]);
    expect(lineSize('nope')).toBe(0);
    const mk = (id: string, role: 'shield' | 'pike', count: number): SpawnerDef => ({ id, tag: 'x', enemy: 'warhost-soldier', role, count, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never' });
    expect(warhostLineLint([mk('s', 'shield', 1), mk('p', 'pike', 2)])).toEqual([{ lineId: 'x', shields: 1 }]);
    expect(warhostLineLint([mk('s', 'shield', 2), mk('p', 'pike', 2)])).toEqual([]);
  });
});

describe('the shield line in the enemy stack', () => {
  it('breaking it kneels the staggered soldiers with Spare open; sparing one counts it gone for the group helper', () => {
    const t = rig([{ id: 'sh', role: 'shield', count: 2, tag: 'ln' }, { id: 'pk', role: 'pike', count: 1, tag: 'ln' }]);
    const sh = t.spawn('sh');
    const pk = t.spawn('pk');
    expect(lineSize('ln')).toBe(3);
    t.tick(0.3);
    t.stagger(sh[0]!.id);
    t.tick(0.1);
    expect(sh[0]!.enemy.state).toBe('stagger');
    expect(lineBroken('ln')).toBe(false);
    t.stagger(sh[1]!.id);
    t.tick(0.1);
    expect(lineBroken('ln')).toBe(true);
    expect(sh[0]!.enemy.state).toBe('yield');
    expect(sh[1]!.enemy.state).toBe('yield');
    expect(pk[0]!.enemy.state).not.toBe('yield');
    expect(t.fake.bus.log.some((e) => e.type === 'enemies.shieldLine.broken')).toBe(true);
    const hold = t.fake.interactables.get(mercyInteractableId(sh[0]!.enemy.slug))!;
    expect(hold.enabled?.()).toBe(true);
    hold.onInteract(t.fake.player);
    t.tick(0.1);
    expect(t.m.service.alive('sh').length).toBeLessThanOrEqual(2);
    expect(lineSize('ln')).toBeLessThanOrEqual(3);
  });
  it('a single stagger does not kneel anyone, and a rest resets the line', () => {
    const t = rig([{ id: 'sh', role: 'shield', count: 3, tag: 'ln2' }]);
    const sh = t.spawn('sh');
    t.tick(0.3);
    t.stagger(sh[0]!.id);
    t.tick(0.1);
    expect(sh[0]!.enemy.state).toBe('stagger');
    expect(sh.slice(1).every((s) => s.enemy.state !== 'yield')).toBe(true);
    resetLines();
    expect(lineBroken('ln2')).toBe(false);
  });
});

describe('line id', () => {
  it('SpawnerDef.line wins over tag, so a wave spawner keeps its tag for kill objectives', () => {
    const fake = new FakeHost(gltf.scene, { playerFeet: { x: 0, y: 0, z: -12 } });
    fake.defineAnchor('a', 0, 0);
    const defs: SpawnerDef[] = [{ id: 'w', tag: 'm52.wave1', line: 'siege.l1', enemy: 'warhost-soldier', role: 'shield', count: 2, anchor: 'a', band: { min: 1, max: 1 }, activation: 'manual', respawn: 'never', leash: false }];
    const m = new EnemyManager(fake.host, FakeHost.factory(gltf), { spawners: defs, seed: 5 });
    const ids = m.service.spawnGroup('w', { aggro: true });
    expect(warhostView(ids[0]!)!.lineId).toBe('siege.l1');
    expect(lineSize('siege.l1')).toBe(2);
    expect(lineSize('m52.wave1')).toBe(0);
  });
});

describe('skins and codex', () => {
  const body = () => ({ root: new THREE.Group(), materials: [new THREE.MeshStandardMaterial({ color: 0xffffff })] });
  it('each skin tints and glows its body, and a skin on the wrong kind changes nothing', () => {
    for (const [id, kind] of [['footman-grisel', 'blighted-soldier'], ['wraith-stoker', 'ash-wraith'], ['golem-lava', 'cinder-golem']] as const) {
      const b = body();
      const warned: string[] = [];
      applyEnemySkin(b, kind, id, (m) => warned.push(m));
      expect(warned).toEqual([]);
      expect(ENEMY_SKINS[id].tint).toBeDefined();
      expect((b.materials[0] as THREE.MeshStandardMaterial).color.getHex()).toBe(ENEMY_SKINS[id].tint);
    }
    const b = body();
    const warned: string[] = [];
    applyEnemySkin(b, 'ember-hound', 'golem-lava', (m) => warned.push(m));
    expect(warned.length).toBe(1);
    expect((b.materials[0] as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
  });
  it('the codex rows carry name and body keys and appear in no other table', () => {
    expect(CALDERA_CODEX_ROWS.map((r) => r.slug)).toEqual(['warhost-soldier', 'warhost-guard', 'grisel-loyalist', 'stoker-wraith', 'forge-thrall']);
    for (const r of CALDERA_CODEX_ROWS) expect(Object.keys(r.strings).sort()).toEqual([`codex.bestiary.${r.slug}.body`, `codex.bestiary.${r.slug}.name`]);
  });
});

describe('the census', () => {
  const band = { min: 35, max: 36 };
  const def = (kind: 'warhost-soldier' | 'warhost-guard', count: number, firstArrival = false): SpawnerDef => ({
    id: `g-${kind}`, enemy: kind, count, anchor: 'a', band: 'caldera' as never, area: 'caldera-rim', activation: 'manual', respawn: 'never', ...(firstArrival ? { firstArrival } : {}),
  });
  it('totals the expected kill XP after the cap and the factor, and a first arrival is capped lower', () => {
    const a = calderaAmbientCensus([def('warhost-soldier', 4)], { playerLevel: 33 });
    expect(a.total).toBeGreaterThan(4 * 100);
    expect(a.rows[0]!.members).toBe(4);
    const lowFactor = calderaAmbientCensus([def('warhost-soldier', 4)], { playerLevel: 33, regionFactor: 1 });
    expect(a.total).toBeGreaterThan(lowFactor.total);
    expect(act5Level(band, 1, 30, true)).toBe(32);
    expect(act5Level(band, 1, 30)).toBe(33);
    expect(calderaAmbientCensus([def('warhost-soldier', 2, true)], { playerLevel: 30 }).total).toBeLessThanOrEqual(calderaAmbientCensus([def('warhost-soldier', 2)], { playerLevel: 30 }).total);
  });
});
