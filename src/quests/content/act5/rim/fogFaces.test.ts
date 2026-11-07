// No Rim quest anchor or trigger sits where a never-open Caldera rim face pushes Cael back (N12's scan on the Phase I chain,
// 2026-11-07): a prop, post or goTo there could never be reached. The gate's own span (`fog.caldera-rim.s`) opens with M47's winch.
import { describe, expect, it } from 'vitest';
import { ACT4_FOG_FACE_POINTS, ACT4_FOG_WALLS } from '../../../../region/act4/act4World';
import { needsPushBackDef } from '../../../../region/fogWall';
import { rimA5InteriorExtras, rimA5QuestLayout } from './layout';
import { RIM_A5_TRIGGERS } from './triggers';
import { paceAt } from './pacing';

const NEVER_OPEN = ACT4_FOG_WALLS.filter((d) => d.id.startsWith('fog.caldera-rim.') && d.id !== 'fog.caldera-rim.s');
const pushed = (p: { x: number; z: number }): string[] =>
  NEVER_OPEN.filter((d) => needsPushBackDef(d, p, ACT4_FOG_FACE_POINTS[d.id as keyof typeof ACT4_FOG_FACE_POINTS])).map((d) => d.id);

describe('the Rim quests against the Caldera rim faces', () => {
  it('reads the never-open faces', () => {
    expect(NEVER_OPEN.map((d) => d.id).sort()).toEqual(['fog.caldera-rim.e', 'fog.caldera-rim.n', 'fog.caldera-rim.se', 'fog.caldera-rim.sw', 'fog.caldera-rim.w']);
  });
  it('no quest anchor is in a face\'s push band', () => {
    const interior = new Set(rimA5InteriorExtras().flatMap((d) => d.anchors.map((a) => a.id)));
    for (const a of rimA5QuestLayout().anchors) if (!interior.has(a.id)) expect(pushed(a), a.id).toEqual([]);
  });
  it('no trigger centre is in one either', () => {
    for (const t of RIM_A5_TRIGGERS) expect(pushed(paceAt(t.anchorId)), t.id).toEqual([]);
  });
  it('the scan sees a point just outside the gate\'s span', () => {
    const sw = ACT4_FOG_FACE_POINTS['fog.caldera-rim.sw'];
    expect(pushed({ x: 10984, z: sw.z + 20 }).length).toBe(1);
  });
});
