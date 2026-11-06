// Act 4 Harrowmark spawners (L2; plans/act4-L2.md section 4). Every group names band 'harrowmark' (its Act 4 band, 28 to
// 33 from story.gate.a4) or area 'harrowmark-a4' (the Act 4 interiors), so L0's Q1 cap (P + 3, first arrivals P + 2)
// applies and no literal band reaches Act 4. respawn 'never' throughout. No group stands in the streets before M38 on its
// own: every street fight comes from a quest beat (L10 writes the activation flags), so the city's kill XP stays inside
// quests (L13's census).
import type { EnemySkinId } from '../../enemies/skins';
import type { EnemyKind, SpawnerDef } from '../../enemies/types';
import type { WaveSetDef } from '../../waves/types';
import { ACT4_SPAWN_POINTS, M36_PATROL, M36_PATROL_ANCHOR, spawnAnchor } from './act4.layout';

const P = 'harrowmark.a4';
const FOOTMAN: EnemyKind = 'blighted-soldier';
const HOUND: EnemyKind = 'ember-hound';
const WATCH: EnemyKind = 'watch-guard';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** A street group on its probed spawn points (`harrowmark.a4.spawn.<points>.<k>`). */
function street(id: string, tag: string, enemy: EnemyKind, points: string, activation: SpawnerDef['activation'], extra: Partial<SpawnerDef> = {}): SpawnerDef {
  const pts = ACT4_SPAWN_POINTS[points];
  if (!pts) throw new Error(`act4 spawners: no spawn points "${points}"`);
  const memberAnchors = pts.map((_, i) => spawnAnchor(points, i + 1));
  return { id, tag, enemy, count: pts.length, anchor: memberAnchors[0]!, memberAnchors, band: 'harrowmark', activation, respawn: 'never', leash: true, ...extra };
}

/** An interior group on the interior's own anchors (area 'harrowmark-a4'). */
function inside(id: string, tag: string, enemy: EnemyKind, anchors: readonly string[], activation: SpawnerDef['activation'], extra: Partial<SpawnerDef> = {}): SpawnerDef {
  return { id, tag, enemy, count: anchors.length, anchor: anchors[0]!, memberAnchors: [...anchors], band: 'harrowmark', area: 'harrowmark-a4', activation, respawn: 'never', leash: true, ...extra };
}

const soot: { skin: EnemySkinId } = { skin: 'footman-soot' };
const masked: { skin: EnemySkinId } = { skin: 'footman-masked' };

/** The flags each group waits for (L10 writes them; listed here so its quests and my tests share one table). */
export const ACT4_SPAWN_FLAGS = {
  m35Ambush: 'story.m35.ambushSprung',
  m36Rooftops: 'story.m36.rooftops',
  /** Set by L10 when M36's daggerman is met, by being caught on the roofs or by the street route. */
  m36Daggerman: 'story.m36.daggerman',
  r19Deserters: 'story.r19.deserters',
  r20Force: (n: number) => `story.r20.force.cp${n}`,
  r20Stealth: (n: number) => `story.r20.stealth.cp${n}`,
  /** R21's "all of it" choice: the second cellar group comes up (a bool beside L10's choice string). */
  r21All: 'story.r21.cellarsAll',
  r23Forger: 'story.r23.forger',
} as const;

const F = ACT4_SPAWN_FLAGS;

export const ACT4_HARROWMARK_SPAWNERS: readonly SpawnerDef[] = [
  // M35: the River Gate lane ambush, Cael's first meeting with Act 4's Footmen (first arrival, P + 2).
  street('m35.ambush.1', 'm35.ambush', FOOTMAN, 'm35.ambush.1', { quest: 'm35', flag: F.m35Ambush }, { ...masked, firstArrival: true }),
  street('m35.ambush.2', 'm35.ambush', FOOTMAN, 'm35.ambush.2', { quest: 'm35', flag: F.m35Ambush }, { ...masked, firstArrival: true }),
  // M36: three watch observers walk the Rooftop Ward's street (the M09 stealth system); the daggerman's four are a fight.
  street('m36.rooftops', 'm36.rooftops', WATCH, 'm36.rooftops', { quest: 'm36', flag: F.m36Rooftops }, { skin: 'watch-masked', patrol: M36_PATROL.map((_, i) => M36_PATROL_ANCHOR(i + 1)), leash: false }),
  street('m36.daggerman', 'm36.daggerman', FOOTMAN, 'm36.daggerman', { quest: 'm36', flag: F.m36Daggerman }, masked),
  // R19: Halvard's deserters, so the base look, no Vey skin.
  street('r19.deserters.1', 'r19.deserters', FOOTMAN, 'r19.deserters.1', { quest: 'r19', flag: F.r19Deserters }),
  street('r19.deserters.2', 'r19.deserters', FOOTMAN, 'r19.deserters.2', { quest: 'r19', flag: F.r19Deserters }),
  // R20: each checkpoint is a fight on the force branch or two observers on the stealth branch.
  ...range(3).map((n) => street(`r20.cp.${n}`, 'r20.force', FOOTMAN, `r20.cp.${n}`, { quest: 'r20', flag: F.r20Force(n) }, soot)),
  ...range(3).map((n) => {
    const s = street(`r20.stealth.${n}`, 'r20.stealth', WATCH, `r20.cp.${n}`, { quest: 'r20', flag: F.r20Stealth(n) }, { skin: 'watch-masked', leash: false });
    return { ...s, count: 2, memberAnchors: s.memberAnchors!.slice(0, 2) };
  }),
  // R21: the Guild Quarter's back lanes; "all of it" brings three more.
  street('r21.cellars', 'r21.cellars', FOOTMAN, 'r21.cellars', { quest: 'r21' }, soot),
  (() => {
    const s = street('r21.cellars.all', 'r21.cellars', FOOTMAN, 'r21.cellars', { quest: 'r21', flag: F.r21All }, soot);
    return { ...s, count: 3, memberAnchors: s.memberAnchors!.slice(0, 3) };
  })(),
  // R23: the forger's two minders behind the gatehouse.
  street('r23.forger', 'r23.forger', FOOTMAN, 'r23.forger', { quest: 'r23', flag: F.r23Forger }, masked),
  // D07: the Crucible Cellars, room by room, live on entering (the door is locked until D07 starts).
  inside('d07.vat-1', 'd07.cellars', HOUND, range(3).map((k) => `${P}.crucible.spawn.vat-1.${k}`), { interior: 'crucible-cellars' }, { leaderSlot: 0 }),
  inside('d07.cradles', 'd07.cellars', FOOTMAN, range(3).map((k) => `${P}.crucible.spawn.cradles.${k}`), { interior: 'crucible-cellars' }, soot),
  inside('d07.vat-2', 'd07.cellars', HOUND, range(3).map((k) => `${P}.crucible.spawn.vat-2.${k}`), { interior: 'crucible-cellars' }, { leaderSlot: 0 }),
  inside('d07.forge', 'd07.cellars', FOOTMAN, range(3).map((k) => `${P}.crucible.spawn.forge.${k}`), { interior: 'crucible-cellars' }, soot),
  // M38: the betrayal's six from the chamber's side doors, spawned by the scene's `spawn` step.
  inside('m38.chamber', 'm38.chamber', FOOTMAN, (['w1', 'e1', 'w2', 'e2', 'w3', 'e3'] as const).map((k) => `${P}.chamber.footman.${k}`), 'manual', soot),
  // M39: the stair head and the last landing's guard (the waves between are ACT4_M39_WAVES).
  inside('m39.stairhead', 'm39.stairs', FOOTMAN, range(4).map((k) => `${P}.stairs.wave.top.${k}`), 'manual', soot),
  inside('m39.guard', 'm39.stairs', FOOTMAN, range(4).map((k) => `${P}.stairs.wave.two.${k}`), 'manual', soot),
  // M40: two hound dens and the patrol in the deep run (the patrol is slip-past or fight).
  inside('deeprun.hounds-1', 'm40.deeprun', HOUND, range(3).map((k) => `${P}.deeprun.spawn.den-1.${k}`), { interior: 'deep-run' }, { leaderSlot: 0 }),
  inside('deeprun.hounds-2', 'm40.deeprun', HOUND, range(3).map((k) => `${P}.deeprun.spawn.den-2.${k}`), { interior: 'deep-run' }, { leaderSlot: 0 }),
  inside('deeprun.patrol', 'm40.patrol', FOOTMAN, range(4).map((k) => `${P}.deeprun.spawn.patrol.${k}`), { interior: 'deep-run' }, { ...soot, patrol: range(4).map((k) => `${P}.deeprun.patrol.${k}`), leash: false }),
];

/**
 * M39's hold on the Keep stairs: four waves of soot Footmen down the flights onto the second landing's barricade. L10
 * starts it (`waves.start('m39.stairs')`); capped like every Act 4 spawn through `area`. The wave director has no skin
 * field, so wave members wear the base look (logged for L0's next contract round).
 */
export const ACT4_M39_WAVES: WaveSetDef = {
  id: 'm39.stairs',
  barricadeId: 'm39.barricade',
  barricadeHealth: 600,
  barricadeAnchors: [`${P}.stairs.barricade`],
  lanes: { '1': `${P}.stairs.wave.top.1`, '2': `${P}.stairs.wave.top.3`, '3': `${P}.stairs.wave.one.2`, '4': `${P}.stairs.wave.one.4` },
  waves: [
    // one per lane (L10 PR 2): a lane of two puts the second on the spawner's ring, off the narrow stair floor, where it
    // fell to the terrain below the interior and the wave could never clear
    { spawns: [{ lane: '1', kind: FOOTMAN, count: 1, delay: 0, stagger: 0 }, { lane: '2', kind: FOOTMAN, count: 1, delay: 2, stagger: 0 }], carts: [] },
    { spawns: [{ lane: '1', kind: FOOTMAN, count: 1, delay: 0, stagger: 0 }, { lane: '2', kind: FOOTMAN, count: 1, delay: 1, stagger: 0 }], carts: [] },
    { spawns: [{ lane: '3', kind: FOOTMAN, count: 1, delay: 0, stagger: 0 }, { lane: '4', kind: FOOTMAN, count: 1, delay: 1, stagger: 0 }], carts: [] },
    { spawns: [{ lane: '1', kind: FOOTMAN, count: 1, delay: 0, stagger: 0 }, { lane: '3', kind: FOOTMAN, count: 1, delay: 2, stagger: 0 }], carts: [] },
  ],
  defenders: [],
  band: 'harrowmark',
  area: 'harrowmark-a4',
  spawnTag: 'm39.waves',
  radius: 40,
  // fought inside the Keep stairs (L10 PR 2: without it the wave director pauses indoors and the hold never ends)
  interior: 'keep-stairs',
};
