// N4 (Act 5): the siege's wave sets on the shipped director (plans/act5-N4.md section 3). M52 at the Rim Gate, R27 in the
// stokers' tunnel (sealed: three waves; F6 Leaders, the far end open: four). Anchors are N1's (`caldera.siege.*`) and
// N2's (`caldera.int.tunnel.*`).
import type { EnemyKind } from '../../enemies/types';
import type { WaveSetDef, WaveSpawnDef } from '../types';
import { GATE, MARCH, RAM, BRAZIER, SIEGE_MAX_ALIVE } from '../../siege/tuning';

/**
 * The Warhost kinds (N5). N5's `warhost-soldier` and `warhost-guard` are not EnemyKinds on this base yet: the siege
 * stands in the shipped `blighted-soldier` (the spike's stand-in, the Warhost's base) until N5's branch merges, then
 * this one map changes. The role and line ride on every row either way.
 */
export const SIEGE_KINDS: Readonly<{ soldier: EnemyKind; guard: EnemyKind }> = { soldier: 'blighted-soldier', guard: 'blighted-soldier' };

export const RIM_SIEGE_ANCHORS = {
  gate: [1, 2, 3, 4].map((n) => `caldera.siege.gate.${n}`),
  lanes: { '1': 'caldera.siege.lane.1', '2': 'caldera.siege.lane.2', '3': 'caldera.siege.lane.3', '4': 'caldera.siege.lane.4', ram: 'caldera.siege.ram' },
} as const;

export const TUNNEL_ANCHORS = {
  line: ['caldera.int.tunnel.line.1', 'caldera.int.tunnel.line.2'],
  lanes: {
    '1': 'caldera.int.tunnel.spawn.1', '2': 'caldera.int.tunnel.spawn.2', '3': 'caldera.int.tunnel.spawn.3',
    '4': 'caldera.int.tunnel.spawn.4', '5': 'caldera.int.tunnel.spawn.5', '6': 'caldera.int.tunnel.spawn.6',
    f1: 'caldera.int.tunnel.far.spawn.1', f2: 'caldera.int.tunnel.far.spawn.2', f3: 'caldera.int.tunnel.far.spawn.3', f4: 'caldera.int.tunnel.far.spawn.4',
  },
} as const;

export const TUNNEL_INTERIOR = 'stokers-tunnel';

/** Vey's household guard in M52's wave 4 (their own shield line, so their spawner is their own; N10's objective). */
export const M52_GUARD_LINE = 'm52.w4.guard';

const S = SIEGE_KINDS.soldier;
const row = (lane: string, count: number, delay: number, role: WaveSpawnDef['role'], line?: string, kind: EnemyKind = S, stagger = 1.2): WaveSpawnDef => ({
  lane, kind, count, delay, stagger, role, ...(line ? { line } : {}),
});

/** M52 "The Siege of the Rim": 10, 8 and two brazier carts, 8 and the ram, 10 and the second ram (36 foes, 4 structures). */
export const RIM_SIEGE: WaveSetDef = {
  id: 'rim-siege',
  barricadeId: 'caldera.siege.gate',
  barricadeHealth: GATE.m52Health,
  barricadeAnchors: RIM_SIEGE_ANCHORS.gate,
  lanes: RIM_SIEGE_ANCHORS.lanes,
  band: 'caldera',
  area: 'caldera-siege',
  spawnTag: 'm52.siege',
  defenders: [],
  intermission: 3600, // the siege runner ends each break (an order, or the timeout, then the gong)
  radius: 220,
  maxAlive: SIEGE_MAX_ALIVE,
  breach: { patchToPct: GATE.patchToPct },
  cartImpact: { brazier: GATE.m52Health * BRAZIER.strikePct, ram: GATE.m52Health * RAM.strikePct },
  // The lane heads lie far down the stairs: foot soldiers join the stairs below the landing (the rams' target), in reach.
  join: { metres: MARCH.joinMetres, toward: 'ram' },
  waves: [
    // Wave 1: two shield lines and pikes, in two pulses.
    {
      spawns: [
        row('2', 3, 0, 'shield', 'm52.w1.a'), row('2', 1, 1, 'pike', 'm52.w1.a'),
        row('3', 3, 0, 'shield', 'm52.w1.b'), row('3', 1, 1, 'pike', 'm52.w1.b'),
        row('1', 1, 14, 'pike'), row('4', 1, 14, 'pike'),
      ],
      carts: [],
    },
    // Wave 2: torch-bearers and two brazier carts; the storm comes.
    {
      spawns: [row('1', 2, 0, 'torch'), row('4', 2, 0, 'torch'), row('2', 2, 10, 'torch'), row('3', 1, 10, 'shield', 'm52.w2'), row('2', 1, 10, 'shield', 'm52.w2')],
      carts: [{ lane: '2', delay: 6 }, { lane: '3', delay: 18 }],
    },
    // Wave 3: the Siege Ram behind a four-shield screen, pikes and torches.
    {
      spawns: [row('ram', 4, 2, 'shield', 'm52.w3', S, 0.8), row('1', 2, 8, 'pike'), row('4', 2, 8, 'torch')],
      carts: [{ lane: 'ram', delay: 0, role: 'ram' }],
    },
    // Wave 4: Vey's household guard with torch-bearers and the second ram; the storm again.
    {
      spawns: [
        row('ram', 2, 2, 'shield', M52_GUARD_LINE, SIEGE_KINDS.guard, 1), row('ram', 2, 4, 'shield', 'm52.w4'),
        row('1', 2, 6, 'torch'), row('2', 2, 12, 'torch'), row('3', 1, 12, 'torch'), row('4', 1, 12, 'torch'),
      ],
      carts: [{ lane: 'ram', delay: 6, role: 'ram' }],
    },
  ],
};

const tunnelWaves = (open: boolean): WaveSetDef['waves'] => {
  const w = [
    { spawns: [row('1', 2, 0, 'shield', 'r27.w1'), row('2', 2, 0, 'shield', 'r27.w1'), row('3', 2, 6, 'torch')], carts: [] },
    { spawns: [row('4', 2, 0, 'shield', 'r27.w2'), row('5', 1, 0, 'pike', 'r27.w2'), row('6', 2, 6, 'torch'), row('1', 2, 10, 'pike')], carts: [] },
    { spawns: [row('2', 3, 0, 'shield', 'r27.w3'), row('3', 1, 0, 'pike', 'r27.w3'), row('5', 2, 8, 'torch'), row('6', 2, 12, 'pike')], carts: [] },
  ];
  if (open) w.push({ spawns: [row('f1', 2, 0, 'shield', 'r27.w4'), row('f2', 2, 0, 'shield', 'r27.w4'), row('f3', 2, 6, 'torch'), row('f4', 2, 10, 'pike')], carts: [] });
  return w;
};

const tunnelSet = (id: string, open: boolean): WaveSetDef => ({
  id,
  barricadeId: 'caldera.tunnel.line',
  barricadeHealth: GATE.r27Health,
  barricadeAnchors: TUNNEL_ANCHORS.line,
  lanes: TUNNEL_ANCHORS.lanes,
  band: 'caldera',
  area: 'caldera-siege',
  spawnTag: 'r27.siege',
  defenders: [],
  intermission: 3600,
  radius: 120,
  interior: TUNNEL_INTERIOR,
  maxAlive: SIEGE_MAX_ALIVE,
  breach: { patchToPct: GATE.patchToPct },
  waves: tunnelWaves(open),
});

/** R27 sealed (F6 All, or before the far end opens): three waves. */
export const TUNNEL_SIEGE = tunnelSet('stokers-tunnel', false);
/** R27 with the far end open (F6 Leaders): a fourth wave from the far gallery. */
export const TUNNEL_SIEGE_OPEN = tunnelSet('stokers-tunnel-open', true);

export const ACT5_WAVE_SETS: readonly WaveSetDef[] = [RIM_SIEGE, TUNNEL_SIEGE, TUNNEL_SIEGE_OPEN];
