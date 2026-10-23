// M19's stealth section: the section data on A4's real Lower Galleries anchors (interior-local metres) and a headless sneak of
// the route past the watch, with the room's pillars and crates as sight cover. The guards walk as the runtime spawns them: each
// from its member post, then the patrol rotated by its slot. The live build (A13 smoke) caught a player standing still at the
// start checkpoint over and over with A4's first watch (four guards on a perimeter loop, two posts beside the start): the
// checks below fail on that layout.
import { describe, expect, it } from 'vitest';
import { SECTIONS, validateSection } from '../../../../../stealth/sections';
import { KinematicPatrol, boxLineOfSight, runScript, type ScriptStep, type SolidBox } from '../../../../../stealth/testing/patrolSim';
import type { P3 } from '../../../../../stealth/perceptionPort';
import { patrolForSlot } from '../../../../../enemies/spawners';
import { LOWER_GALLERIES_DEF } from '../../../../../oldsmoke/mines/lowerGalleries';
import { M18M19_SPAWNERS } from './m18m19.spawners';
import { M19_SECTION } from './m19.quest';
import { mineAnchors } from './realAnchors';

const REAL = mineAnchors('mine-lower-galleries');
const local = new Map(Object.entries(REAL).map(([id, p]) => [id, { id, position: { x: p.x, y: 0, z: p.z }, yaw: 0 }]));
const find = (id: string) => local.get(id);
const at = (id: string): P3 => ({ ...local.get(id)!.position });
const section = SECTIONS.find((s) => s.id === M19_SECTION)!;
const watch = M18M19_SPAWNERS.find((s) => s.id === section.guardGroups[0])!;
const loop: P3[] = (watch.patrol as string[]).map(at);
const posts: string[] = [...(watch.memberAnchors ?? [])].slice(0, watch.count);
/** The galleries' pillars and crates block sight below their tops. */
const cover = boxLineOfSight([
  ...LOWER_GALLERIES_DEF.pillars.map((r): SolidBox => ({ minX: r.x0, maxX: r.x1, minZ: r.z0, maxZ: r.z1, top: 4 })),
  ...(LOWER_GALLERIES_DEF.props ?? []).map((p): SolidBox => ({ minX: p.rect.x0, maxX: p.rect.x1, minZ: p.rect.z0, maxZ: p.rect.z1, top: p.height })),
]);
/** The watch `t` seconds after it spawned (at quest start, or after a capture reset). */
const guardsAt = (t: number, routeIds: readonly string[] = watch.patrol as string[], at0: readonly string[] = posts) => {
  const pts = routeIds.map(at);
  return at0.map((post, k) => {
    const g = new KinematicPatrol([at(post), ...patrolForSlot(pts, k).map((q) => ({ x: q.x, y: 0, z: q.z }))], 1.4, 0);
    for (let s = 0; s < t; s += 1 / 60) g.step(1 / 60);
    return g;
  });
};
const PHASES = Array.from({ length: 30 }, (_, i) => i * 2);

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
    const bad = { ...section, hideSpots: [{ id: 'hide:m19-1', anchor: 'oldsmoke.m19.patrol.3' }] };
    expect(validateSection(bad, find, [[...loop, loop[0]]]).map((p) => p.problem)).toEqual([expect.stringContaining('within 3 m')]);
  });

  it('a missing anchor is reported', () => {
    const fewer = (id: string) => (id === 'oldsmoke.stealth.m19.end' ? undefined : find(id));
    expect(validateSection(section, fewer).map((p) => p.problem)).toContain('missing anchor oldsmoke.stealth.m19.end');
  });

  it('its guard group is a spawner of watch-guards on the galleries\' anchors, live with the quest and never respawning', () => {
    const g = M18M19_SPAWNERS.find((s) => s.id === section.guardGroups[0])!;
    expect(g.enemy).toBe('watch-guard');
    expect(g.count).toBe(1);
    expect(g.respawn).toBe('never');
    expect(g.activation).toEqual({ quest: 'm19' });
    for (const a of [g.anchor, ...(g.memberAnchors ?? []), ...((g.patrol as string[]) ?? [])]) expect(find(a), a).toBeDefined();
  });
});

describe('M19 route (headless, A4\'s real galleries)', () => {
  const sneak = (x: number, z: number): ScriptStep => ({ to: { x, y: 0, z }, sneak: true });
  const start = at('oldsmoke.stealth.m19.start');
  /** In at the west door, up past the crate to hide spot 2 against the north wall, wait there, east to the link and out. */
  const north = (delay: number, hideWait: number): ScriptStep[] => [
    { wait: delay, sneak: true }, sneak(30, -40.5), { to: at('oldsmoke.hide.m19.2'), sneak: true },
    ...(hideWait > 0 ? [{ wait: hideWait, sneak: true, hidden: true }] : []), sneak(41, -34), { to: at('oldsmoke.stealth.m19.end'), sneak: true },
  ];
  /** The first (delay, wait) a player watching the guard could pick that gets past him unseen, or null. */
  const timing = (t: number): [number, number] | null => {
    for (let d = 0; d <= 20; d++) for (const w of [0, 2, 4, 6, 8, 10, 12]) {
      const r = runScript(start, north(d, w), guardsAt(t), cover);
      if (!r.noticed && !r.caught) return [d, w];
    }
    return null;
  };

  it('whenever the watch spawned, a player who times the guard gets along the north wall unseen', () => {
    for (const t of PHASES) expect({ t, ok: timing(t) !== null }).toEqual({ t, ok: true });
  });

  it('a player holding still and sneaking at the start checkpoint is never noticed (the capture reset lands there)', () => {
    for (const t of PHASES) expect({ t, noticed: runScript(start, [{ wait: 10, sneak: true }], guardsAt(t), cover).noticed }).toEqual({ t, noticed: 0 });
  });

  it('A4\'s first watch (four guards on the perimeter loop from the posts) caught a still player at the start: the check can fail', () => {
    const perimeter = [1, 2, 3, 4, 5].map((n) => `oldsmoke.m19.patrol.${n}`);
    const oldPosts = [1, 2, 3, 4].map((n) => `oldsmoke.m19.watch.${n}`);
    const caught = PHASES.filter((t) => runScript(start, [{ wait: 10, sneak: true }], guardsAt(t, perimeter, oldPosts), cover).caught > 0);
    expect(caught.length).toBeGreaterThan(0);
    const pts = perimeter.map(at);
    expect(validateSection(section, find, [[...pts, pts[0]]]).length).toBeGreaterThan(0);
  });

  it('walking upright into the middle of the room is noticed (the test can fail)', () => {
    const across: ScriptStep[] = [{ to: { x: 37, y: 0, z: -43 }, sneak: false }, { wait: 8, sneak: false }];
    const seen = PHASES.filter((t) => runScript(start, across, guardsAt(t), cover).noticed > 0);
    expect(seen.length).toBeGreaterThan(PHASES.length / 2);
  });
});
