// Act 3 thread K1: the act3-world plugin (anchors, the four fog faces under the Act 3 flag states, the roads), the
// faces' placement against containment, and the anchors doc.
import { beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../../physics/PhysicsWorld';
import { renderAnchorsDoc } from '../anchorsDoc';
import { ACT2_CORRIDORS } from '../act2/act2World';
import { ACT3_CORRIDORS, ACT3_HOLES, SUMMIT_OPEN_WHEN } from '../act3Containment';
import { Containment, DEAD_ROAD_CORRIDOR } from '../containment';
import { fogWallForTrigger, fogWalls, needsPushBackDef } from '../fogWall';
import { createFakeCore } from '../testing/fakeCore';
import { readFileSync } from '../testing/nodeFs';
import { ACT3_FACE_PUSH_DEPTH, ACT3_FOG_WALLS, FOG_FACE_ANCHORS, FOG_FACE_POINTS } from './act3World';
import { ACT3_WORLD_DOC, ACT3_WORLD_LAYOUT } from './act3World.layout';
import { createAct3WorldPlugin } from './act3World.plugin';

type Flags = Record<string, boolean>;
const PHASE_D: Flags = { 'story.gate.a2': true, 'story.d03.complete': true };
const PHASE_E: Flags = { ...PHASE_D, 'story.gate.a3': true };
const PHASE_F: Flags = { ...PHASE_E, 'story.phase.dragonspineOpen': true };
const SUMMIT: Flags = { ...PHASE_F, ...Object.fromEntries((SUMMIT_OPEN_WHEN.all ?? []).map((k) => [k, true])) };
const reader = (flags: Flags) => ({ getFlag: (k: string) => flags[k] });
function containment(flags: Flags): Containment {
  const c = new Containment(reader(flags), [DEAD_ROAD_CORRIDOR, ...ACT3_CORRIDORS], ACT3_HOLES);
  for (const def of ACT2_CORRIDORS) c.addCorridor(def);
  return c;
}

describe('ACT3_WORLD_ANCHORS.md', () => {
  it('matches the layout (regenerate with npx vite-node tools/gen-region-docs.ts)', () => {
    expect(readFileSync('src/region/act3/ACT3_WORLD_ANCHORS.md', 'utf8')).toBe(renderAnchorsDoc(ACT3_WORLD_LAYOUT, ACT3_WORLD_DOC));
  });

  it('defines the camp anchor K0 names and one anchor per face, with no duplicate ids', () => {
    const ids = ACT3_WORLD_LAYOUT.anchors.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('dragonspine.wyrmwatch.hearth');
    for (const w of ACT3_FOG_WALLS) expect(ids).toContain(w.anchorId);
  });
});

describe('the Act 3 fog faces against containment', () => {
  it('each face stands on open ground in the state it stands in, with its blocked side closed or pushed back', () => {
    // The Spine Road and Fen Road faces matter from Phase E, the summit and Waste-edge faces once the Dragonspine opens.
    const inState: Record<string, Flags> = { 'fog.spine-road': PHASE_E, 'fog.fen-waste': PHASE_E, 'fog.summit': PHASE_F, 'fog.wyrmwatch-waste': PHASE_F };
    for (const w of ACT3_FOG_WALLS) {
      const c = containment(inState[w.id]);
      const at = FOG_FACE_POINTS[w.id as keyof typeof FOG_FACE_POINTS];
      const n = w.axis === 'x' ? { x: 1, z: 0 } : { x: 0, z: 1 };
      const open = { x: at.x - n.x * w.blockedSide * 10, z: at.z - n.z * w.blockedSide * 10 };
      // fog.fen-waste stands where plan 3.4 puts it, on the Waste's west edge beside the Fen Road corridor's edge (the
      // centreline passes about 97 m from the corner): a backstop the corridor's push-back already keeps players short of.
      if (w.id !== 'fog.fen-waste') expect(c.isOpen(open.x, open.z), `${w.id} open side`).toBe(true);
      const blocked = { x: at.x + n.x * w.blockedSide * 10, z: at.z + n.z * w.blockedSide * 10 };
      expect(needsPushBackDef(w, blocked, at), w.id).toBe(true);
      expect(needsPushBackDef(w, open, at), w.id).toBe(false);
    }
  });

  it('each face pushes only a 100 m band behind it, never the Cinder Road or Cinderreach across the map', () => {
    for (const w of ACT3_FOG_WALLS) expect(w.pushDepth, w.id).toBe(ACT3_FACE_PUSH_DEPTH);
    const fen = ACT3_FOG_WALLS.find((d) => d.id === 'fog.fen-waste')!;
    const waste = ACT3_FOG_WALLS.find((d) => d.id === 'fog.wyrmwatch-waste')!;
    // Cinderreach at the fen face's z, and the Cinder Road under the Waste face's span.
    expect(needsPushBackDef(fen, { x: 20365, z: 4704 }, FOG_FACE_POINTS['fog.fen-waste'])).toBe(false);
    expect(needsPushBackDef(waste, { x: 13000, z: 3000 }, FOG_FACE_POINTS['fog.wyrmwatch-waste'])).toBe(false);
    // Inside the band they still push; just past it they do not.
    expect(needsPushBackDef(fen, { x: 6990 + 99, z: 4700 }, FOG_FACE_POINTS['fog.fen-waste'])).toBe(true);
    expect(needsPushBackDef(fen, { x: 6990 + 101, z: 4700 }, FOG_FACE_POINTS['fog.fen-waste'])).toBe(false);
    // A face without a depth (every shipped one) still holds its whole half-plane.
    const { pushDepth: _d, ...unbounded } = fen;
    expect(needsPushBackDef(unbounded, { x: 20365, z: 4704 }, FOG_FACE_POINTS['fog.fen-waste'])).toBe(true);
  });

  it('fog.fen-waste is the plan\'s face: x 6990, z 4500 to 4900, facing the Waste', () => {
    const w = ACT3_FOG_WALLS.find((d) => d.id === 'fog.fen-waste')!;
    expect(FOG_FACE_POINTS['fog.fen-waste']).toEqual({ x: 6990, z: 4700 });
    expect([w.axis, w.halfLength, w.blockedSide]).toEqual(['x', 200, 1]);
  });

  it('fog.wyrmwatch-waste spans the Waste edge below the lodge, and past both ends containment holds the Waste', () => {
    const w = ACT3_FOG_WALLS.find((d) => d.id === 'fog.wyrmwatch-waste')!;
    const at = FOG_FACE_POINTS['fog.wyrmwatch-waste'];
    expect(at.x - w.halfLength).toBe(11500);
    expect(at.x + w.halfLength).toBe(15000);
    for (const flags of [PHASE_F, SUMMIT]) {
      const c = containment(flags);
      // Around either end a rider stays on open Dragonspine ground north of z 11000 and the Waste stays closed.
      for (const x of [11400, 11500, 13250, 15000, 15100]) {
        expect(c.isOpen(x, 11010), `(${x}, 11010)`).toBe(true);
        if (x <= 15000) expect(c.isOpen(x, 10990), `(${x}, 10990)`).toBe(false);
      }
    }
  });
});

describe('the act3-world plugin', () => {
  let physics: PhysicsWorld;
  beforeAll(async () => {
    physics = new PhysicsWorld();
    await physics.init();
  });

  function rig(flags: Flags) {
    const fc = createFakeCore();
    fc.useRapier(physics.rapier);
    for (const [k, v] of Object.entries(flags)) fc.flags.set(k, v);
    const plugin = createAct3WorldPlugin({ heightAt: () => 10, visuals: false });
    plugin.setup(fc.ctx);
    return { fc, plugin };
  }

  it('defines every anchor and registers the four faces; all four stand in Phase E; dispose removes them all', () => {
    const { fc, plugin } = rig(PHASE_E);
    for (const a of ACT3_WORLD_LAYOUT.anchors) expect(fc.anchors.has(a.id), a.id).toBe(true);
    expect(fc.anchors.get('dragonspine.wyrmwatch.hearth')!.position.y).toBe(10);
    for (const w of ACT3_FOG_WALLS) {
      expect(fogWalls()).toContain(w);
      expect(fogWallForTrigger(`trg.${w.id}`)).toBe(w);
      expect(fc.triggers.has(`trg.${w.id}`), w.id).toBe(true);
      expect(fc.anchors.get(FOG_FACE_ANCHORS[w.id as keyof typeof FOG_FACE_ANCHORS])).toBeTruthy();
    }
    plugin.dispose?.();
    for (const w of ACT3_FOG_WALLS) expect(fogWalls()).not.toContain(w);
    expect(fc.triggers.size).toBe(0);
    expect(fc.anchors.size).toBe(0);
  });

  it('Phase F lowers the Spine Road face; the summit opens with its flags; the Waste faces never open', () => {
    const f = rig(PHASE_F);
    expect(f.fc.triggers.has('trg.fog.spine-road')).toBe(false);
    expect(f.fc.triggers.has('trg.fog.summit')).toBe(true);
    expect(f.fc.triggers.has('trg.fog.wyrmwatch-waste')).toBe(true);
    expect(f.fc.triggers.has('trg.fog.fen-waste')).toBe(true);
    f.plugin.dispose?.();
    const s = rig({ ...SUMMIT, 'story.gate.a4': true });
    expect(s.fc.triggers.has('trg.fog.summit')).toBe(false);
    expect(s.fc.triggers.has('trg.fog.wyrmwatch-waste')).toBe(true);
    expect(s.fc.triggers.has('trg.fog.fen-waste')).toBe(true);
    s.plugin.dispose?.();
  });

  it('a load back to a Phase E save raises the Spine Road face again', () => {
    const { fc, plugin } = rig(PHASE_F);
    expect(fc.triggers.has('trg.fog.spine-road')).toBe(false);
    fc.flags.clear();
    for (const [k, v] of Object.entries(PHASE_E)) fc.flags.set(k, v);
    fc.fire('save.loaded', {});
    expect(fc.triggers.has('trg.fog.spine-road')).toBe(true);
    plugin.dispose?.();
  });

  it('a standing Waste face pushes a player back 1 m in front of it', () => {
    const { fc, plugin } = rig(SUMMIT);
    const a = fc.anchors.get('dragonspine.fog.wyrmwatch-waste')!.position;
    Object.assign(fc.playerFeet, { x: a.x + 200, y: 10, z: a.z - 5 });
    fc.tick('intent');
    expect(fc.teleports).toHaveLength(1);
    expect(fc.teleports[0].feet.z).toBeCloseTo(a.z + 1, 6);
    plugin.dispose?.();
  });

  it('fails cleanly, leaving nothing behind, when physics is not ready', () => {
    const fc = createFakeCore();
    const plugin = createAct3WorldPlugin({ heightAt: () => 0, visuals: false });
    expect(() => plugin.setup(fc.ctx)).toThrow(/physics/);
    expect(fc.anchors.size).toBe(0);
    expect(fogWalls().some((w) => w.id === 'fog.summit')).toBe(false);
  });
});
