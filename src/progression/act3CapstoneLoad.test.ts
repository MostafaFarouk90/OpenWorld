// K11 PRs 3 and 4: the real capstone rows. A learned capstone survives a load without the Act 3 flags, only one capstone is ever
// held (exclusiveGroup 'capstone'), the active capstones carry costs, and learning one needs the master's book.
import { describe, expect, it } from 'vitest';
import { Progression } from './Progression';
import { SKILLS, getSkill, registerClassSkills } from './skills';
import { fakeActor } from './testkit';
import { ASHBLADE_SKILLS } from '../classes/ashblade/skills';
import { WARDEN_SKILLS } from '../classes/warden/skills';
import { buildEmberwrightSkills } from '../classes/emberwright/skills';
import { buildPathfinderSkills } from '../classes/pathfinder/skills';

if (!SKILLS.some((s) => s.classId === 'warden')) registerClassSkills('warden', [...WARDEN_SKILLS]);
if (!SKILLS.some((s) => s.classId === 'ashblade')) registerClassSkills('ashblade', [...ASHBLADE_SKILLS]);
if (!SKILLS.some((s) => s.classId === 'emberwright')) registerClassSkills('emberwright', buildEmberwrightSkills());
if (!SKILLS.some((s) => s.classId === 'pathfinder')) registerClassSkills('pathfinder', buildPathfinderSkills());

const T5: Record<string, { ids: string[]; passive: string[] }> = {
  knight: { ids: ['knight.unbrokenOath', 'knight.heartshardSmite', 'knight.bannerOfTheSunforge'], passive: ['knight.heartshardSmite'] },
  warden: { ids: ['warden.wyrmbreaker', 'warden.mountainUnmoved', 'warden.voiceOfTheMountain'], passive: [] },
  ashblade: { ids: ['ashblade.deathByAThousandSparks', 'ashblade.ghostOfTheHearth', 'ashblade.flickerStrike'], passive: [] },
  emberwright: { ids: ['emberwright.sunfireNova', 'emberwright.colossusOfSlag', 'emberwright.breathOfTheKeepers'], passive: [] },
  pathfinder: { ids: ['pathfinder.dragonbaneBolt', 'pathfinder.huntersWeb', 'pathfinder.skyhawkStrike'], passive: [] },
};

/** The capstone's whole branch, in tier order, so `requires` holds as they load. */
function branchOf(id: string): string[] {
  const out: string[] = [];
  for (let s = getSkill(id); s; s = s.requires ? getSkill(s.requires) : undefined) out.unshift(s.id);
  return out;
}

function make(flags = new Map<string, boolean>(), withStore = true) {
  return new Progression({
    emit: () => {},
    logger: { warn: () => {} },
    actor: () => fakeActor(),
    ...(withStore ? { flags: { get: (k: string) => flags.get(k), set: (k: string, v: boolean) => void flags.set(k, v) } } : {}),
  });
}

describe('tier 5 capstones on the real rows', () => {
  for (const [classId, { ids, passive }] of Object.entries(T5)) {
    const cls = classId === 'knight' ? null : classId;

    it(`${classId}: each capstone is tier 5, exclusive, costs 5 (12 for the branch) and has the right kind and costs`, () => {
      for (const id of ids) {
        const s = getSkill(id)!;
        expect(s, id).toBeDefined();
        expect([s.tier, s.capstone, s.exclusiveGroup, s.cost]).toEqual([5, true, 'capstone', 5]);
        expect(branchOf(id).reduce((n, b) => n + getSkill(b)!.cost, 0), id).toBe(12);
        if (passive.includes(id)) {
          expect(s.kind, id).toBe('passive');
        } else {
          expect(s.kind, id).toBe('active');
          expect(s.cooldown, id).toBeGreaterThan(0);
          expect(s.emberCost, id).toBeGreaterThan(0);
        }
      }
    });

    for (const id of ids) {
      const learned = branchOf(id);
      const save = { xp: 0, storyPoints: 12, learned, bar: [null, null, null, null, null, null], classId: cls, respecUsed: false };

      it(`${id}: survives a load with the flags absent and with no flag store`, () => {
        const a = make();
        a.load(save);
        expect(a.learned(id)).toBe(true);
        const b = make(new Map(), false);
        b.load(save);
        expect(b.serialize().learned).toEqual(learned);
      });
    }

    it(`${classId}: a second capstone is dropped on load and refused as excluded when learning`, () => {
      const [first, second] = ids;
      const learned = [...branchOf(first), ...branchOf(second)];
      const flags = new Map([['story.gate.a3', true], [`trainer.${classId}.masterBook`, true]]);
      const p = make(flags);
      p.load({ xp: 0, storyPoints: 24, learned, bar: [], classId: cls, respecUsed: false });
      expect(p.learned(first)).toBe(true);
      expect(p.learned(second)).toBe(false);
      expect(p.canLearn(second)).toEqual({ ok: false, reason: 'excluded' });
    });

    it(`${classId}: learning a capstone needs the master's book`, () => {
      const [id] = ids;
      const learned = branchOf(id).slice(0, -1);
      const save = { xp: 0, storyPoints: 12, learned, bar: [], classId: cls, respecUsed: false };
      const p = make(new Map([['story.gate.a3', true]]));
      p.load(save);
      expect(p.canLearn(id)).toMatchObject({ ok: false, reason: 'master' });
      const q = make(new Map([['story.gate.a3', true], [`trainer.${classId}.masterBook`, true]]));
      q.load(save);
      expect(q.learn(id)).toEqual({ ok: true });
    });
  }
});
