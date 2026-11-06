// Act 4 L3: the weather plugin's data is L1's rope-lines and shelters, resolved through L1's own anchors.
import { describe, expect, it } from 'vitest';
import { ROPE_ANCHORS, ROPE_LANE_HALF_WIDTH, ROPE_LINES, SHELTERS, SHELTER_SPOTS, onRopeLane, pointAt, ropeLine } from '../region/act4/ropeLines';
import { WEATHER_DATA } from './data';
import { RopeIndex, ShelterTracker } from './lanes';
import { ROPE_SAFE_RADIUS } from './tuning';
import { resolveWeatherData } from './weather.plugin';

describe('weather data (L1 PR 1)', () => {
  it('is L1\'s ROPE_LINES and SHELTERS, and the safe radius is L1\'s lane half width', () => {
    expect(WEATHER_DATA.ropes).toBe(ROPE_LINES);
    expect(WEATHER_DATA.shelters).toBe(SHELTERS);
    expect(ROPE_LINES.length).toBeGreaterThan(0);
    expect(SHELTERS.length).toBeGreaterThan(0);
    expect(ROPE_SAFE_RADIUS).toBe(ROPE_LANE_HALF_WIDTH);
  });

  it('resolves through L1\'s anchors with nothing missing; the lane and the shelters agree with L1\'s own checks', () => {
    const byId = new Map(ROPE_ANCHORS.map((a) => [a.id, { position: { x: a.x, z: a.z } }]));
    const warns: string[] = [];
    const d = resolveWeatherData((id) => byId.get(id), ROPE_LINES, SHELTERS, (m) => warns.push(m));
    expect(warns).toEqual([]);
    const ropes = new RopeIndex(d.ropes);
    for (const id of ['rope.ashgate-camp', 'rope.cinder-road-north'] as const) {
      const pts = ropeLine(id).points;
      for (const arc of [10, 200, 450]) {
        const p = pointAt(pts, arc);
        for (const off of [0, 3.9, 4.5, 12]) {
          const x = p.x - p.dz * off;
          const z = p.z + p.dx * off;
          expect(ropes.onRope(x, z), `${id} arc ${arc} off ${off}`).toBe(onRopeLane(x, z));
        }
      }
    }
    const shelters = new ShelterTracker(d.shelters);
    for (const s of SHELTER_SPOTS) {
      shelters.reset();
      expect(shelters.update(s.at.x, s.at.z).entered).toBe(s.id);
    }
  });
});
