import { describe, expect, it } from 'vitest';
import { heightAt } from '../../terrain/heightfield';
import { ACT3_GLIDE_UPDRAFTS } from '../../region/act3/act3Glide';
import {
  GLIDE_LANES,
  GLIDE_OPEN_FLAG,
  GLIDE_RULES,
  GLIDE_UPDRAFTS,
  SLOPE_WIND,
  SLOPE_WIND_PROFILE,
  alongLane,
  clampToLane,
  fallbackStand,
  flyStraight,
  glideInteractId,
  inBox,
  inCorridor,
  launchAnchorId,
  liftAt,
  updraftLift,
  windLift,
  wrapAngle,
  type GlideLane,
} from './lanes';

const lane = (id: string): GlideLane => GLIDE_LANES.find((l) => l.site.id === id)!;
const WIND_LANES = ['summit-skyhold', 'anvil-rime-pass', 'rime-pass-lodge'];
const THERMAL_LANES = ['summit-aerie', 'skyhold-hawk-cliffs', 'hearth-updraft'];
/** A point `d` m along the lane's heading from the lip. */
const along = (l: GlideLane, d: number, side = 0) => {
  const h = l.def.heading;
  return { x: l.site.ledge.x - Math.sin(h) * d + Math.cos(h) * side, z: l.site.ledge.z - Math.cos(h) * d - Math.sin(h) * side };
};

describe('the six ledges', () => {
  it('are K1 sites as GlideLedgeDefs with K4 launch anchors and the M34 gate', () => {
    expect(GLIDE_LANES.map((l) => l.site.id).sort()).toEqual([...WIND_LANES, ...THERMAL_LANES].sort());
    for (const l of GLIDE_LANES) {
      expect(l.def.id).toBe(`glide.${l.site.id}`);
      expect(l.def.anchorId).toBe(launchAnchorId(l.site.id));
      expect(l.def.anchorId).toMatch(/^dragonspine\.glide\.[a-z-]+\.launch$/);
      expect(glideInteractId(l.site.id)).not.toContain('.');
      expect(l.def.openWhen).toEqual({ all: [GLIDE_OPEN_FLAG] });
      expect(l.def.heading).toBe(l.site.heading);
    }
  });

  it('slope wind is on the three gentle lanes only', () => {
    expect(Object.keys(SLOPE_WIND).sort()).toEqual([...WIND_LANES].sort());
    for (const id of THERMAL_LANES) expect(lane(id).wind).toBe(0);
  });

  it('the fallback stand is 2 m behind the lip, on the ground', () => {
    for (const l of GLIDE_LANES) {
      const s = fallbackStand(l.site, heightAt);
      const lip = l.site.ledge;
      expect(Math.hypot(s.x - lip.x, s.z - lip.z)).toBeCloseTo(GLIDE_RULES.standBack, 6);
      expect(alongLane(l, s.x, s.z)).toBeCloseTo(-GLIDE_RULES.standBack, 6);
      expect(s.y).toBeCloseTo(heightAt(s.x, s.z) + 0.05, 6);
    }
  });

  it('world thermal ids stay apart from K11 Updraft VFX id', () => {
    for (const u of GLIDE_UPDRAFTS) {
      expect(u.id).toMatch(/^updraft\./);
      expect(u.id).not.toBe('emberwright-updraft');
    }
    expect(GLIDE_UPDRAFTS.map((u) => u.id)).toEqual(ACT3_GLIDE_UPDRAFTS.map((u) => u.id));
  });
});

describe('lane tuning on the real heightfield', () => {
  it.each(GLIDE_LANES.map((l) => [l.site.id, l] as const))('%s: the straight glide at the heading lands', (id, l) => {
    const r = flyStraight(l, heightAt);
    expect(r.touched).toBe(true);
    expect(r.contained).toBe(false);
    // The hearth loop has no line to fly: straight through the column it comes down past the bowl, in its catch box.
    if (id === 'hearth-updraft') expect(inBox(l.site.catchBox, r.at.x, r.at.z)).toBe(true);
    else expect(r.landed).toBe(true);
  });

  it.each(WIND_LANES)('%s: at least 10 m over the ground from 60 m past the lip, under 200 m up', (id) => {
    const r = flyStraight(lane(id), heightAt);
    expect(r.minClearance).toBeGreaterThanOrEqual(10);
    expect(r.maxAboveGround).toBeLessThan(200);
  });

  it.each(WIND_LANES)('%s: without the slope wind it cannot (why the wind exists)', (id) => {
    expect(flyStraight(lane(id), heightAt, { wind: false }).landed).toBe(false);
  });

  it.each(THERMAL_LANES)('%s: lands on K1 thermals alone, with no slope wind', (id) => {
    const l = lane(id);
    const r = flyStraight(l, heightAt, { wind: false });
    expect(r.touched).toBe(true);
    expect(r.contained).toBe(false);
    if (id === 'hearth-updraft') expect(inBox(l.site.catchBox, r.at.x, r.at.z)).toBe(true);
    else expect(r.landed).toBe(true);
  });

  it.each(GLIDE_LANES.flatMap((l) => [[l.site.id, l, 1], [l.site.id, l, -1]] as const))(
    '%s: a glide held at a lane edge (%#) glides down to the ground in the catch box (no fall damage), or is contained',
    (_id, l, sign) => {
      const r = flyStraight(l, heightAt, { yaw: l.def.heading + sign * Math.min(l.def.laneHalfAngle, Math.PI) });
      expect(r.touched || r.contained).toBe(true);
      if (r.touched) expect(inBox(l.site.catchBox, r.at.x, r.at.z)).toBe(true);
      if (r.contained) expect(r.seconds).toBeLessThan(300);
    },
  );
});

describe('steering and the corridor', () => {
  const l = lane('summit-aerie');
  it('clamps the yaw to the lane at both edges and leaves it inside', () => {
    const h = l.def.heading;
    const half = l.def.laneHalfAngle;
    expect(clampToLane(l, h + 0.1)).toBeCloseTo(wrapAngle(h + 0.1), 9);
    expect(clampToLane(l, h + 1.2)).toBeCloseTo(wrapAngle(h + half), 9);
    expect(clampToLane(l, h - 1.2)).toBeCloseTo(wrapAngle(h - half), 9);
    // Across the +-PI seam.
    expect(clampToLane(l, h + 2 * Math.PI + 0.1)).toBeCloseTo(wrapAngle(h + 0.1), 9);
  });

  it('never clamps on the full-circle hearth lane', () => {
    const hl = lane('hearth-updraft');
    expect(clampToLane(hl, 2.5)).toBeCloseTo(2.5, 9);
    expect(clampToLane(hl, -3)).toBeCloseTo(-3, 9);
  });

  it('wraps angles into (-PI, PI]', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 9);
    expect(wrapAngle(7)).toBeCloseTo(7 - 2 * Math.PI, 9);
  });

  it('the corridor is the wedge plus margin, cut by the catch box; landing areas count as inside', () => {
    const p = along(l, 300);
    expect(inCorridor(l, p.x, p.z)).toBe(true);
    const wide = along(l, 300, 300 * Math.tan(l.def.laneHalfAngle + GLIDE_RULES.corridorSlack) + GLIDE_RULES.corridorMargin + 5);
    expect(inCorridor(l, wide.x, wide.z)).toBe(false);
    const behind = along(l, -GLIDE_RULES.corridorMargin - 5);
    expect(inCorridor(l, behind.x, behind.z)).toBe(false);
    const a = l.def.landingAreas[0]!;
    expect(inCorridor(l, (a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2)).toBe(true);
    expect(inCorridor(l, l.site.catchBox.x1 + 10, l.site.ledge.z)).toBe(false);
  });

  it('the hearth corridor is its catch box', () => {
    const hl = lane('hearth-updraft');
    const b = hl.site.catchBox;
    expect(inCorridor(hl, b.x0 + 1, b.z0 + 1)).toBe(true);
    expect(inCorridor(hl, b.x0 - 1, b.z0 + 1)).toBe(false);
  });
});

describe('lift', () => {
  it('slope wind: full low down, fading to nothing at the top of the profile', () => {
    const { fullBelow, fadeTop } = SLOPE_WIND_PROFILE;
    expect(windLift(4, 0)).toBe(4);
    expect(windLift(4, fullBelow)).toBe(4);
    expect(windLift(4, (fullBelow + fadeTop) / 2)).toBeCloseTo(2, 9);
    expect(windLift(4, fadeTop)).toBe(0);
    expect(windLift(4, 500)).toBe(0);
    expect(windLift(0, 0)).toBe(0);
  });

  it('applies only inside the corridor and before the wind stops short of the target', () => {
    const l = lane('anvil-rime-pass');
    const mid = along(l, 600);
    const g = heightAt(mid.x, mid.z);
    expect(liftAt(l, { x: mid.x, y: g + 5, z: mid.z }, g, [])).toBe(l.wind);
    const out = along(l, 600, 900);
    expect(liftAt(l, { x: out.x, y: g + 5, z: out.z }, g, [])).toBe(0);
    const late = along(l, l.windStop + 1);
    expect(liftAt(l, { x: late.x, y: g + 5, z: late.z }, g, [])).toBe(0);
    // Another lane's wind never blows here: thermal lanes have none.
    const t = lane('summit-aerie');
    const tp = along(t, 50);
    expect(liftAt(t, { x: tp.x, y: 0, z: tp.z }, 0, [])).toBe(0);
  });

  it('updrafts add up inside their columns, between base and top', () => {
    const u = [
      { id: 'updraft.a', centre: { x: 0, y: 0, z: 0 }, radius: 10, height: 50, lift: 3 },
      { id: 'updraft.b', centre: { x: 5, y: 0, z: 0 }, radius: 10, height: 20, lift: 2 },
    ];
    expect(updraftLift({ x: 2, y: 10, z: 0 }, u)).toBe(5);
    expect(updraftLift({ x: 2, y: 30, z: 0 }, u)).toBe(3);
    expect(updraftLift({ x: 2, y: -1, z: 0 }, u)).toBe(0);
    expect(updraftLift({ x: 40, y: 10, z: 0 }, u)).toBe(0);
  });

  it('the climb is capped whatever the lift adds up to', () => {
    const l = lane('summit-aerie');
    const u = [{ id: 'updraft.big', centre: { x: l.site.ledge.x, y: 0, z: l.site.ledge.z }, radius: 2000, height: 5000, lift: 40 }];
    const r = flyStraight(l, heightAt, { updrafts: u });
    // 300 s at most at maxClimb.
    expect(r.maxAboveGround).toBeLessThanOrEqual(GLIDE_RULES.maxClimb * 300 + 600);
    expect(r.contained).toBe(true);
  });

  it('the hearth column takes in the rim launch', () => {
    const hl = lane('hearth-updraft');
    const s = fallbackStand(hl.site, heightAt);
    expect(updraftLift({ ...s, y: s.y + 0.1 })).toBeGreaterThan(0);
  });
});
