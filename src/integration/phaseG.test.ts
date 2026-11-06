import { describe, expect, it } from 'vitest';
import { capOffenders, FIRST_ARRIVAL_TAGS, measurePhaseG, PHASE_G_EXPECTED, PHASE_G_ORDER, PHASE_G_RUN_A, PHASE_G_RUN_B } from './phaseG';
import { ACT4_PLANNED_PACE } from './act4PlannedPace';
import type { Act4PaceRow } from './act4Timing';
import type { PhaseCTrail } from './phaseC';

const at = (a: string) => ({ x: Number(a.slice(1)), z: 0 });
const pos = { position: { x: 0, z: 0 } };

describe('Phase G scaffolding', () => {
  it('plays plan 2.1 and 2.2 in order, and the two runs cover both delegate outcomes', () => {
    expect(PHASE_G_ORDER).toEqual(['m35', 'm36', 'r19', 'r20', 'r21', 'r22', 'r23', 'd07', 'm37', 'm38', 'm39', 'm40', 'm41']);
    expect(Object.values(PHASE_G_RUN_A.delegates)).toEqual(['won', 'won', 'won']);
    expect(Object.values(PHASE_G_RUN_B.delegates)).toContain('lost');
    expect(PHASE_G_RUN_B.spare).toBe(true);
    expect(PHASE_G_EXPECTED.quests).toBe(9_400);
  });

  it('flags a hostile over P + 3, a first-arrival one over P + 2, once each; bosses and the dead are exempt', () => {
    const first = [...FIRST_ARRIVAL_TAGS][0];
    expect(first, 'L2 ships first-arrival groups').toBeTruthy();
    const seen = new Set<string>();
    const list = [
      { kind: 'blighted-soldier', team: 'hostile', level: 29, root: pos, spawnTag: 'x' }, // P + 3: fine
      { kind: 'blighted-soldier', team: 'hostile', level: 30, root: pos, spawnTag: 'x' }, // P + 4
      { kind: 'blighted-soldier', team: 'hostile', level: 29, root: pos, spawnTag: first }, // first arrival P + 3
      { kind: 'bellows-engine', team: 'hostile', level: 40, root: pos },
      { kind: 'blighted-soldier', team: 'hostile', level: 40, root: pos, dead: true },
      { kind: 'tobb', team: 'ally', level: 40, root: pos },
    ];
    const out = capOffenders(list, 26, seen);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatch(/first arrival/);
    expect(capOffenders(list, 26, seen)).toEqual([]);
  });

  it('measures the rows on the nodes a run read and gates Phase G', () => {
    const rows: Act4PaceRow[] = ACT4_PLANNED_PACE.filter((p) => (PHASE_G_ORDER as readonly string[]).includes(p.quest)).map((p) => ({
      quest: p.quest, design: p.design, route: ['a0', `a${Object.values(p.metres).reduce((s, m) => s + (m ?? 0), 0)}`], legs: ['foot'], nodes: p.nodes, beats: p.beats,
    }));
    const trail = (n: number): PhaseCTrail => ({ talks: [{ npc: 'x', nodes: n }], scripted: [], order: [] }) as never;
    const full = Object.fromEntries(rows.map((r) => [r.quest, trail(r.nodes)]));
    expect(measurePhaseG(rows, full, at).gate.ok).toBe(true);
    const thin = Object.fromEntries(rows.map((r) => [r.quest, trail(2)]));
    expect(measurePhaseG(rows, thin, at).gate.ok).toBe(false);
    expect(() => measurePhaseG(rows, {}, at)).toThrow(/a trail for m35/);
  });
});
