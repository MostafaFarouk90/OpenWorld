// M21's spy section: the section data against A4's Grisel Hall anchors (the hall's own interior frame), and a headless sneak
// of the route past the watch loop. The sim has no walls, so it is the worst case: a route that passes in the open passes
// with the hall's walls too.
import { describe, expect, it } from 'vitest';
import { GRISEL_HALL_DEF } from '../../../../oldsmoke/griselHall';
import { SECTIONS, validateSection } from '../../../../stealth/sections';
import { KinematicPatrol, runScript, type ScriptStep } from '../../../../stealth/testing/patrolSim';
import type { P3 } from '../../../../stealth/perceptionPort';
import { OLDSMOKE_SPAWNERS } from './spawners';
import { M21_SECTION } from './m21.quest';

const local = new Map(GRISEL_HALL_DEF.anchors.map((a) => [a.id, { id: a.id, position: { x: a.x, y: 0, z: a.z }, yaw: 0 }]));
const find = (id: string) => local.get(id);
const at = (id: string): P3 => ({ ...local.get(id)!.position });
const section = SECTIONS.find((s) => s.id === M21_SECTION)!;
const loop: P3[] = [1, 2, 3, 4, 5].map((n) => at(`patrol.m21.hall.${n}`));
const open = () => true;

describe('M21 stealth section', () => {
  it('is registered for the quest with interior bounds, four hide spots and the watch guard group', () => {
    expect(section).toBeDefined();
    expect(section.quest).toEqual({ id: 'm21', liveFrom: 'letters', liveUntil: 'stealth', exitArmedAfter: ['letters'] });
    expect(section.bounds).toEqual({ interior: 'grisel-hall' });
    expect(section.hideSpots).toHaveLength(4);
    expect(section.checkpoints.map((c) => c.id)).toEqual(['hall.start', 'hall.gallery', 'hall.study']);
  });

  it('every anchor exists in the hall and every hide spot keeps 3 m from the patrol loop', () => {
    expect(validateSection(section, find, [[...loop, loop[0]]])).toEqual([]);
  });

  it('its guard group is a spawner of watch-guards on the hall\'s anchors, live with the quest and never respawning', () => {
    const g = OLDSMOKE_SPAWNERS.find((s) => s.id === section.guardGroups[0])!;
    expect(g.enemy).toBe('watch-guard');
    expect(g.count).toBe(4);
    expect(g.respawn).toBe('never');
    expect(g.activation).toEqual({ quest: 'm21' });
    for (const a of [g.anchor, ...(g.memberAnchors ?? []), ...((g.patrol as string[]) ?? [])]) expect(find(a), a).toBeDefined();
  });
});

describe('M21 spy route (headless)', () => {
  /** Start, east through the service passage, down the gallery to its checkpoint, along the back rooms to the study, and back. */
  const sneak = (to: P3): ScriptStep => ({ to, sneak: true });
  const route: ScriptStep[] = [
    { wait: 2, sneak: true },
    sneak({ x: 11, y: 0, z: -3.5 }),
    sneak({ x: 20, y: 0, z: -3.5 }),
    sneak(at('oldsmoke.stealth.m21.cp.gallery')),
    sneak({ x: 20, y: 0, z: -37.5 }),
    sneak({ x: 0, y: 0, z: -37.5 }),
    sneak({ x: -18, y: 0, z: -37.5 }),
    sneak(at('oldsmoke.stealth.m21.cp.study')),
    { wait: 6, sneak: true }, // the three letters
    sneak({ x: -18, y: 0, z: -37.5 }),
    sneak({ x: 20, y: 0, z: -37.5 }),
    sneak({ x: 20, y: 0, z: -3.5 }),
    sneak({ x: 11, y: 0, z: -3.5 }),
    sneak(at('oldsmoke.stealth.m21.end')),
  ];
  const guards = (phase: number) => [0, 1, 2, 3].map((i) => new KinematicPatrol(loop, 1.4, phase + i * 7));

  for (const phase of [-1, 0, 5, 11]) {
    it(`is never noticed past the watch (patrol phase ${phase} s)`, () => {
      const r = runScript(at('oldsmoke.stealth.m21.start'), route, guards(phase), open);
      expect(r.noticed).toBe(0);
      expect(r.caught).toBe(0);
    });
  }

  it('walking the central audience hall instead is noticed (the test can fail)', () => {
    const across: ScriptStep[] = [sneak(at('oldsmoke.stealth.m21.start')), sneak({ x: 0, y: 0, z: -20 }), sneak({ x: 0, y: 0, z: -30 })];
    expect(runScript(at('oldsmoke.stealth.m21.start'), across, guards(0), open).noticed).toBeGreaterThan(0);
  });
});
