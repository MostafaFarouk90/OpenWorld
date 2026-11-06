// Act 4 Harrowmark's spawners, skins, M39's wave set, the occupied city's faces and the kill XP factor (L2, plan 4, 6, 8).
import { describe, expect, it, vi } from 'vitest';
import { KillXpRegionFactor } from '../../core/scalePorts';
import { ALL_SPAWNERS } from '../../enemies/allSpawners';
import { ENEMY_DEFS } from '../../enemies/defs';
import { ENEMY_SKINS } from '../../enemies/skins';
import { SpawnerRegistry, type SpawnRequest } from '../../enemies/spawners';
import type { AnchorLike } from '../../enemies/ports';
import { ACT4_HARROWMARK_INTERIORS } from '../../interiors/harrowmark/act4';
import { act4FogFace, HARROWMARK_GATE_FACES } from '../../region/act4Fog';
import { OCCUPIED_FLAG as L0_OCCUPIED } from '../../region/act4Containment';
import { fogWalls, needsPushBackDef } from '../../region/fogWall';
import { createFakeCore } from '../../region/testing/fakeCore';
import { WAVE_SETS } from '../../waves/defs';
import { spawnersFor } from '../../waves/spawners';
import { CENTER, gateBearing, GATE_NAMES, gatePosition, RING_RADIUS } from '../city';
import { HARROWMARK_LAYOUT } from '../harrowmark.layout';
import { createHarrowmarkAct4Plugin } from './harrowmarkAct4.plugin';
import { gateFaceDefs, gateFacePlacement, HARROWMARK_ACT4_XP_FACTOR, HARROWMARK_XP_WHEN } from './occupied';
import { ACT4_HARROWMARK_SPAWNERS, ACT4_M39_WAVES, ACT4_SPAWN_FLAGS } from './spawners';
import { A4_FLAG, gateFaceAnchor, OCCUPIED_FLAG, WORKING_GATES } from './sites';

const anchorIds = new Set([...HARROWMARK_LAYOUT.anchors.map((a) => a.id), ...ACT4_HARROWMARK_INTERIORS.flatMap((d) => d.anchors.map((a) => a.id))]);
const INTERIOR_IDS = new Set(ACT4_HARROWMARK_INTERIORS.map((d) => d.id));

function registry(flags: Record<string, unknown>, player = 26) {
  const anchors: AnchorLike[] = [...anchorIds].map((id, i) => ({ id, position: { x: i, y: 0, z: 0 }, yaw: 0 }));
  const reqs: SpawnRequest[] = [];
  let n = 0;
  const warn = vi.fn();
  const reg = new SpawnerRegistry({
    anchors: { find: (id) => anchors.find((a) => a.id === id), withTag: () => [] },
    warn,
    spawn: (r) => {
      reqs.push(r);
      return `a${++n}`;
    },
    despawn: () => undefined,
    rng: () => 1,
    playerLevel: () => player,
    flags: { getFlag: (k) => flags[k] as never },
  });
  ACT4_HARROWMARK_SPAWNERS.forEach((d) => reg.define(d));
  return { reg, reqs, warn };
}

describe('the Act 4 Harrowmark spawners', () => {
  it('are registered once in the full list, with ids unique across every table', () => {
    const ids = ALL_SPAWNERS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ACT4_HARROWMARK_SPAWNERS) expect(ids.filter((i) => i === d.id)).toHaveLength(1);
  });

  it('name the act-scoped band (interiors their area), so the Act 4 cap applies; never respawn; sized to their anchors', () => {
    for (const d of ACT4_HARROWMARK_SPAWNERS) {
      expect(d.band, d.id).toBe('harrowmark');
      const act = d.activation;
      const inInterior = typeof act === 'object' && 'interior' in act ? true : d.memberAnchors!.some((m) => /\.(chamber|stairs|crucible|deeprun)\./.test(m));
      expect(d.area === 'harrowmark-a4', d.id).toBe(inInterior);
      if (typeof act === 'object' && 'interior' in act) expect(INTERIOR_IDS.has(act.interior), d.id).toBe(true);
      expect(d.respawn, d.id).toBe('never');
      expect(d.memberAnchors, d.id).toHaveLength(d.count);
      expect(new Set(d.memberAnchors).size, d.id).toBe(d.count);
      for (const m of [...d.memberAnchors!, d.anchor, ...((d.patrol as string[] | undefined) ?? [])]) expect(anchorIds.has(m), `${d.id}: ${m}`).toBe(true);
      expect(ENEMY_DEFS[d.enemy as keyof typeof ENEMY_DEFS], d.id).toBeDefined();
      if (d.skin) expect(ENEMY_SKINS[d.skin].kind, d.id).toBe(d.enemy);
      expect(d.leaderSlot === undefined || d.leaderSlot < d.count, d.id).toBe(true);
    }
  });

  it('puts no group in the streets on its own: every exterior group waits on a quest of Act 4', () => {
    for (const d of ACT4_HARROWMARK_SPAWNERS) {
      if (d.area) continue;
      expect(typeof d.activation === 'object' && 'quest' in d.activation, d.id).toBe(true);
      expect((d.activation as { quest: string }).quest, d.id).toMatch(/^(m3[5-9]|m4[01]|r19|r2[0-3]|d07)$/);
    }
    expect(ACT4_HARROWMARK_SPAWNERS.filter((d) => d.activation === 'auto')).toEqual([]);
  });

  it('roll in the Act 4 band capped at P + 3 (first arrivals P + 2), and the M35 ambush is a first arrival', () => {
    const { reg, reqs } = registry({ [A4_FLAG]: true, [ACT4_SPAWN_FLAGS.m35Ambush]: true }, 26);
    reg.spawnGroup('r19.deserters.1');
    expect(reqs.every((r) => r.level === 29)).toBe(true);
    reqs.length = 0;
    reg.spawnGroup('m35.ambush.1');
    expect(reqs.map((r) => r.level)).toEqual([28, 28, 28]);
    expect(reqs.every((r) => r.skin === 'footman-masked')).toBe(true);
    reqs.length = 0;
    reg.spawnGroup('d07.cradles');
    expect(reqs.map((r) => [r.level, r.skin])).toEqual([[29, 'footman-soot'], [29, 'footman-soot'], [29, 'footman-soot']]);
  });

  it('a high player meets the band\'s top (33), never above it', () => {
    const { reg, reqs } = registry({ [A4_FLAG]: true }, 34);
    reg.spawnGroup('deeprun.patrol');
    expect(reqs.every((r) => r.level === 33)).toBe(true);
  });

  it('spawns the quest groups only with their quest and flag (R20 force and stealth are exclusive branches)', () => {
    const flags: Record<string, unknown> = { [A4_FLAG]: true, [ACT4_SPAWN_FLAGS.r20Stealth(2)]: true };
    const { reg, reqs } = registry(flags);
    const ids = reg.onQuestStarted('r20', (f) => Boolean(flags[f]));
    expect(ids).toHaveLength(2);
    expect(new Set(reqs.map((r) => r.spawnerId))).toEqual(new Set(['r20.stealth.2']));
    expect(reg.onQuestStarted('m35', () => false)).toEqual([]);
  });

  it('the D07 rooms come up on entering the Crucible, the deep run\'s on entering it, nothing else', () => {
    const { reg, reqs } = registry({ [A4_FLAG]: true });
    reg.onInteriorEntered('crucible-cellars');
    expect(new Set(reqs.map((r) => r.spawnerId))).toEqual(new Set(['d07.vat-1', 'd07.cradles', 'd07.vat-2', 'd07.forge']));
    reqs.length = 0;
    reg.onInteriorEntered('deep-run');
    expect(new Set(reqs.map((r) => r.spawnerId))).toEqual(new Set(['deeprun.hounds-1', 'deeprun.hounds-2', 'deeprun.patrol']));
    reqs.length = 0;
    reg.onInteriorEntered('council-chamber');
    expect(reqs).toEqual([]);
  });

  it('M39\'s wave set is shipped, capped through its area, and every lane and the barricade stand in the stairs', () => {
    expect(WAVE_SETS['m39.stairs']).toBe(ACT4_M39_WAVES);
    for (const id of [...Object.values(ACT4_M39_WAVES.lanes), ...ACT4_M39_WAVES.barricadeAnchors]) expect(anchorIds.has(id), id).toBe(true);
    const sp = spawnersFor(ACT4_M39_WAVES);
    expect(sp.every((d) => d.area === 'harrowmark-a4' && d.band === 'harrowmark')).toBe(true);
    expect(sp.reduce((n, d) => n + d.count, 0)).toBe(8);
  });
});

describe('the occupied city\'s gate faces', () => {
  it('uses L0\'s rules for the four working gates on my anchors, closed from M38 (one flag across both threads)', () => {
    expect(OCCUPIED_FLAG).toBe(L0_OCCUPIED);
    const defs = gateFaceDefs();
    expect(defs.map((d) => d.anchorId)).toEqual(WORKING_GATES.map(gateFaceAnchor));
    for (const d of defs) {
      expect(HARROWMARK_GATE_FACES.some((f) => f.id === d.id && f.openWhen === d.openWhen)).toBe(true);
      expect(d.halfLength).toBe(10);
      expect(d.pushDepth).toBe(13);
    }
    expect(() => act4FogFace('fog.waste-edge')).not.toThrow();
  });

  it('holds the outside of each gate, never pushes anyone inside the walls (even beside the gate), and never reaches L1\'s track', () => {
    for (const g of WORKING_GATES) {
      const def = gateFaceDefs().find((d) => d.anchorId === gateFaceAnchor(g))!;
      const wall = HARROWMARK_LAYOUT.anchors.find((a) => a.id === def.anchorId)!;
      expect(needsPushBackDef(def, gatePosition(g, 755), wall), `${g} at the gate's outer mouth`).toBe(true);
      expect(needsPushBackDef(def, gatePosition(g, RING_RADIUS), wall), `${g} passage`).toBe(false);
      expect(needsPushBackDef(def, gatePosition(g, RING_RADIUS - 4), wall), `${g} inside the gate`).toBe(false);
      // Against the inner wall face, 9 m beside the gate.
      const b = (gateBearing(GATE_NAMES.indexOf(g)) * Math.PI) / 180;
      const beside = { x: gatePosition(g, 746).x + Math.cos(b) * 9, z: gatePosition(g, 746).z - Math.sin(b) * 9 };
      expect(needsPushBackDef(def, beside, wall), `${g} beside the gate inside`).toBe(false);
      expect(needsPushBackDef(def, gatePosition(g, RING_RADIUS + 45), wall), `${g} track`).toBe(false);
      expect(needsPushBackDef(def, gatePosition(g, RING_RADIUS + 30), wall), `${g} outside`).toBe(false);
      expect(needsPushBackDef(def, gatePosition(g, 700), wall), `${g} streets`).toBe(false);
      // The push sends the player away from the centre.
      const p = gateFacePlacement(g);
      const toCentre = p.axis === 'x' ? CENTER.x - wall.x : CENTER.z - wall.z;
      expect(Math.sign(toCentre)).toBe(p.blockedSide);
    }
  });
});

describe('the harrowmark-act4 plugin', () => {
  function boot(withXp = true) {
    const fc = createFakeCore();
    for (const a of HARROWMARK_LAYOUT.anchors) fc.ctx.anchors.define({ id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 });
    const xp = new KillXpRegionFactor(() => {}, { getFlag: (k) => fc.flags.get(k) as never });
    if (withXp) fc.ctx.services.provide('killXpRegionFactor', xp);
    const plugin = createHarrowmarkAct4Plugin({ heightAt: () => 0 });
    plugin.setup(fc.ctx);
    return { fc, plugin, xp };
  }

  it('sets the kill XP factor from Act 4 only, registers the four faces, and undoes both on dispose', () => {
    const before = fogWalls().length;
    const { fc, plugin, xp } = boot();
    expect(xp.factor('harrowmark')).toBe(1);
    fc.flags.set(A4_FLAG, true);
    expect(xp.factor('harrowmark')).toBe(HARROWMARK_ACT4_XP_FACTOR);
    expect(fogWalls().length).toBe(before + WORKING_GATES.length);
    expect(fc.ctx.services.get('harrowmarkAct4')!.faces()).toHaveLength(4);
    plugin.dispose!();
    expect(xp.factor('harrowmark')).toBe(1);
    expect(fogWalls().length).toBe(before);
  });

  it('still sets up (with a warning) when the factor service is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { plugin } = boot(false);
    expect(warn).toHaveBeenCalled();
    plugin.dispose!();
    warn.mockRestore();
  });

  it('the factor condition is L0\'s gate flag', () => {
    expect(HARROWMARK_XP_WHEN).toEqual({ all: ['story.gate.a4'] });
  });
});
