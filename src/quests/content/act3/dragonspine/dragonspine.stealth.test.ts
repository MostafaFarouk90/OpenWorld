// R18's stealth section (src/stealth/sections.ts `r18.nest-ledge`) on K4's real anchors: it covers the nest trigger, is live exactly when
// the companion hold holds, never captures (the parents attack when they see Cael; a dead parent is the failure), and is the
// source of the pacing row's stealth beat.
import { afterEach, describe, expect, it } from 'vitest';
import { QUEST_WAITS, deriveWait, ruleHolds, type WaitView } from '../../../../companions/WaitDirector';
import { dragonspineBuild } from '../../../../dragonspine/layout';
import { resolveAnchor } from '../../../../region/resolveLayout';
import { questLive } from '../../../../stealth/liveness';
import { SECTIONS, insideVolume, validateSection } from '../../../../stealth/sections';
import { heightAt } from '../../../../terrain/heightfield';
import { autoplay, autoplayAll } from './director/autoplay.testkit';
import { makeRig, type Rig } from './director/rig.testkit';
import { DRAGONSPINE_PACE, paceRow } from './pacing';
import { DRAGONSPINE_SPAWNERS } from './spawners';
import { R18_NEST_ANCHORS, R18_NEST_TRIGGER, R18_PARENTS_TAG } from './r18.quest';

const build = dragonspineBuild();
const anchors = new Map(build.layout.anchors.map((a) => [a.id, resolveAnchor(a as never, heightAt)]));
const find = (id: string) => anchors.get(id);
const section = SECTIONS.find((s) => s.quest.id === 'r18')!;

let rig: Rig | null = null;
afterEach(() => { rig?.dispose(); rig = null; });
const fresh = (): Rig => (rig = makeRig({ flags: { 'story.gate.a3': true } }));

describe('R18 stealth section', () => {
  it('is the only section of the quest, validates on K4\'s real layout, and has no hide spot K4 did not place', () => {
    expect(SECTIONS.filter((s) => s.quest.id === 'r18')).toHaveLength(1);
    expect(validateSection(section, find)).toEqual([]);
  });

  it('covers the whole nest trigger sphere and the three nests', () => {
    const trg = build.layout.triggers.find((t) => t.id === R18_NEST_TRIGGER) as { x: number; z: number; radius: number };
    expect(trg).toBeTruthy();
    const y = anchors.get(R18_NEST_ANCHORS[0]!)!.position.y;
    for (let deg = 0; deg < 360; deg += 15) {
      const p = { x: trg.x + Math.cos((deg * Math.PI) / 180) * trg.radius, y, z: trg.z + Math.sin((deg * Math.PI) / 180) * trg.radius };
      expect(insideVolume(section.bounds as never, find, p), `trigger edge at ${deg} degrees`).toBe(true);
    }
    for (const id of R18_NEST_ANCHORS) expect(insideVolume(section.bounds as never, find, find(id)!.position), id).toBe(true);
  });

  it('has no watch guards: being seen is never a capture (K6b\'s parents attack; killing one is the failure path)', () => {
    expect(section.guardGroups).toEqual([]);
    // and the group the quest spawns for the parents is not a stealth guard group of any section
    const parents = DRAGONSPINE_SPAWNERS.find((s) => s.tag === R18_PARENTS_TAG)!;
    for (const s of SECTIONS) expect(s.guardGroups).not.toContain(parents.id);
  });

  it('the pacing row\'s stealth beat is the quest\'s section count', () => {
    const row = DRAGONSPINE_PACE.find((r) => r.quest === 'r18')!;
    expect(row.beats.stealthSection).toBe(SECTIONS.filter((s) => s.quest.id === 'r18').length);
    expect(row.beats.stealthSection).toBe(1);
    expect(paceRow(row).share).toBeGreaterThanOrEqual(0.45);
  });
});

describe('R18 section and companion hold agree', () => {
  const holdRule = QUEST_WAITS[0]!;
  const viewOf = (r: Rig): WaitView => ({
    questState: (q) => r.manager.state(q),
    objectiveDone: (q, o) => r.manager.objectiveDone(q, o),
    interior: null,
    anchorExists: () => true,
  });
  const live = (r: Rig): boolean => questLive(r.manager as never, section.quest);
  const holds = (r: Rig): boolean => ruleHolds(holdRule, viewOf(r));

  it('at every step of the quest the section is live exactly when the companions are held', () => {
    const r = fresh();
    autoplayAll(r, ['m28']);
    expect(live(r)).toBe(false);
    expect(holds(r)).toBe(false);
    r.manager.start('r18');
    const steps = r.manager.objectives('r18').map((v) => v.def.id);
    const seen: Array<[string, boolean, boolean]> = [];
    for (const id of steps) {
      autoplay(r, 'r18', { stopAt: ['r18', id] });
      r.step(2);
      seen.push([id, live(r), holds(r)]);
    }
    for (const [id, l, h] of seen) expect(l, `${id}: live vs held`).toBe(h);
    expect(seen.filter(([, l]) => l).map(([id]) => id)).toEqual(['nested']);
    autoplay(r, 'r18');
    expect(r.qs('r18')).toBe('completed');
    expect(live(r)).toBe(false);
    expect(holds(r)).toBe(false);
  });

  it('companions are released (no wait) whenever R18 is not active: not offered, failed or dropped, completed', () => {
    const r = fresh();
    autoplayAll(r, ['m28']);
    expect(deriveWait(QUEST_WAITS, viewOf(r))).toBeNull();
    r.manager.start('r18');
    autoplay(r, 'r18', { stopAt: ['r18', 'nested'] });
    expect(deriveWait(QUEST_WAITS, viewOf(r))).toEqual({ reason: 'stealth', anchorId: 'dragonspine.hawk.companion-hold' });
    expect(live(r)).toBe(true);
    r.manager.fail('r18');
    r.step(2);
    expect(r.qs('r18')).not.toBe('active');
    expect(deriveWait(QUEST_WAITS, viewOf(r))).toBeNull();
    expect(live(r)).toBe(false);
  });

  it('the hold post is outside the section\'s bounds (companions wait at the foot, not in the section)', () => {
    const post = QUEST_WAITS[0]!.anchorId;
    expect(insideVolume(section.bounds as never, find, find(post)!.position)).toBe(false);
  });
});
