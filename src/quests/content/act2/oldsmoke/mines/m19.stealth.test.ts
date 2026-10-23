// M19's stealth section: the section data against a fixture of the Lower Galleries' anchors, and a headless sneak of the
// route past the watch loop. A4's mine interiors are not on this branch, so the anchors below are the fixture (interior-local,
// inside A4's x [-70,70], z [-130,10] cell): the ids are the ones the section and the spawner name, the coordinates are a
// sketch. Swap `ANCHORS` for A4's real interior def when it lands; the route and the loop must then be re-walked. The sim has
// no walls, so it is the worst case: a route that passes in the open passes with the galleries' rock too.
import { describe, expect, it } from 'vitest';
import { SECTIONS, validateSection } from '../../../../../stealth/sections';
import { KinematicPatrol, runScript, type ScriptStep } from '../../../../../stealth/testing/patrolSim';
import type { P3 } from '../../../../../stealth/perceptionPort';
import { M18M19_SPAWNERS } from './m18m19.spawners';
import { M19_SECTION } from './m19.quest';

const xz = (x: number, z: number): [number, number] => [x, z];
const FIXTURE: Record<string, [number, number]> = {
  'oldsmoke.stealth.m19.start': xz(-50, -70),
  'oldsmoke.stealth.m19.cp.inside': xz(-40, -98),
  'oldsmoke.stealth.m19.end': xz(30, -106),
  'oldsmoke.stealth.m19.centre': xz(0, -80),
  'oldsmoke.hide.m19.1': xz(-60, -84),
  'oldsmoke.hide.m19.2': xz(-25, -104),
  'oldsmoke.hide.m19.3': xz(5, -118),
  'oldsmoke.hide.m19.4': xz(22, -98),
  'oldsmoke.m19.watch.1': xz(-10, -86), 'oldsmoke.m19.watch.2': xz(10, -86), 'oldsmoke.m19.watch.3': xz(10, -68), 'oldsmoke.m19.watch.4': xz(-10, -68),
  'oldsmoke.m19.patrol.1': xz(-10, -86), 'oldsmoke.m19.patrol.2': xz(10, -86), 'oldsmoke.m19.patrol.3': xz(10, -68),
  'oldsmoke.m19.patrol.4': xz(0, -62), 'oldsmoke.m19.patrol.5': xz(-10, -68),
};
const local = new Map(Object.entries(FIXTURE).map(([id, [x, z]]) => [id, { id, position: { x, y: 0, z }, yaw: 0 }]));
const find = (id: string) => local.get(id);
const at = (id: string): P3 => ({ ...local.get(id)!.position });
const section = SECTIONS.find((s) => s.id === M19_SECTION)!;
const loop: P3[] = [1, 2, 3, 4, 5].map((n) => at(`oldsmoke.m19.patrol.${n}`));
const open = () => true;

describe('M19 stealth section', () => {
  it('is registered for the quest with interior bounds, four hide spots and the watch guard group', () => {
    expect(section).toBeDefined();
    expect(section.quest).toEqual({ id: 'm19', liveFrom: 'stealth', liveUntil: 'stealth' });
    expect(section.bounds).toEqual({ interior: 'mine-lower-galleries' });
    expect(section.hideSpots).toHaveLength(4);
    expect(section.hideSpots.map((h) => h.id)).toEqual([1, 2, 3, 4].map((i) => `hide:m19-${i}`));
    expect(section.checkpoints.map((c) => c.id)).toEqual(['galleries.start', 'galleries.inside']);
    expect(section.exit.anchor).toBe('oldsmoke.stealth.m19.end');
  });

  it('is the only section for m19 and its id is unique', () => {
    expect(SECTIONS.filter((s) => s.quest.id === 'm19')).toHaveLength(1);
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
  });

  it('every anchor exists and every hide spot keeps 3 m from the patrol loop', () => {
    expect(validateSection(section, find, [[...loop, loop[0]]])).toEqual([]);
  });

  it('a hide spot on the patrol loop is a problem (the check can fail)', () => {
    const bad = { ...section, hideSpots: [{ id: 'hide:m19-1', anchor: 'oldsmoke.m19.patrol.2' }] };
    expect(validateSection(bad, find, [[...loop, loop[0]]]).map((p) => p.problem)).toEqual([expect.stringContaining('within 3 m')]);
  });

  it('a missing anchor is reported', () => {
    const fewer = (id: string) => (id === 'oldsmoke.stealth.m19.end' ? undefined : find(id));
    expect(validateSection(section, fewer).map((p) => p.problem)).toContain('missing anchor oldsmoke.stealth.m19.end');
  });

  it('its guard group is a spawner of watch-guards on the galleries\' anchors, live with the quest and never respawning', () => {
    const g = M18M19_SPAWNERS.find((s) => s.id === section.guardGroups[0])!;
    expect(g.enemy).toBe('watch-guard');
    expect(g.count).toBe(4);
    expect(g.respawn).toBe('never');
    expect(g.activation).toEqual({ quest: 'm19' });
    for (const a of [g.anchor, ...(g.memberAnchors ?? []), ...((g.patrol as string[]) ?? [])]) expect(find(a), a).toBeDefined();
  });
});

describe('M19 route (headless)', () => {
  const sneak = (to: P3): ScriptStep => ({ to, sneak: true });
  /** Start, down the west gallery, east along the south one to the checkpoint and out at the exit. */
  const route: ScriptStep[] = [
    { wait: 2, sneak: true },
    sneak({ x: -50, y: 0, z: -98 }),
    sneak(at('oldsmoke.stealth.m19.cp.inside')),
    sneak({ x: -20, y: 0, z: -116 }),
    sneak({ x: 10, y: 0, z: -116 }),
    sneak(at('oldsmoke.stealth.m19.end')),
  ];
  const guards = (phase: number) => [0, 1, 2, 3].map((i) => new KinematicPatrol(loop, 1.4, phase + i * 7));

  for (const phase of [-1, 0, 5, 11]) {
    it(`is never noticed past the watch (patrol phase ${phase} s)`, () => {
      const r = runScript(at('oldsmoke.stealth.m19.start'), route, guards(phase), open);
      expect(r.noticed).toBe(0);
      expect(r.caught).toBe(0);
    });
  }

  it('waiting in a hide spot while the watch passes is never noticed either', () => {
    const wait: ScriptStep[] = [sneak(at('oldsmoke.hide.m19.2')), { wait: 20, sneak: true, hidden: true }, sneak(at('oldsmoke.stealth.m19.end'))];
    const r = runScript(at('oldsmoke.stealth.m19.cp.inside'), wait, guards(3), open);
    expect(r.noticed).toBe(0);
  });

  it('walking upright into the middle of the watch is noticed (the test can fail)', () => {
    const across: ScriptStep[] = [{ to: { x: 0, y: 0, z: -77 }, sneak: false }, { wait: 8, sneak: false }];
    expect(runScript(at('oldsmoke.stealth.m19.start'), across, guards(0), open).noticed).toBeGreaterThan(0);
  });
});
