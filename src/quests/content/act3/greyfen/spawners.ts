import type { SpawnerDef } from '../../../../enemies/types';
import { HUNTER_PACK_KINDS, HUNTER_PACK_LEADER_SLOT } from '../../../../enemies/hunters/def';
import { M23_KNOT_FLAGS, M23_KNOT_TAGS } from './m23.quest';
import { M24_WRECK_FLAG, M24_WRECK_TAG } from './m24.quest';
import { R12_BEDS, R12_BURN_LEECHES, R12_BURN_TAG, R12_CUT_FLAG, R12_CUT_LEECHES, R12_CUT_TAG, R12_TORCH_FLAG } from './r12.quest';
import { M25_BEDS_FLAG, M25_BEDS_TAG } from './m25.quest';
import { R14_LEECH_FLAG, R14_LEECH_TAG, R14_PACK_FLAG, R14_PACK_TAG } from './r14.quest';
import { R13_NAVE_FLAG, R13_NAVE_TAG } from './r13.quest';
import { M26_HUNTERS_TAG, M26_LEECHES_TAG, M26_NETGUARD_FLAG } from './m26.quest';
import { M27_PACK1_FLAG, M27_PACK1_TAG, M27_PACK2_FLAG, M27_PACK2_TAG } from './m27.quest';
import { D05_ROOMS, D05_ROOM_FLAG, D05_ROOM_TAG } from './d05.quest';

const range = (prefix: string, from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);
/** Every quest group sits on the Greyfen block (levels follow K9's lock), never refills, and activates on a flag the director writes when its step is current. */
const common = { band: 'greyfen', block: 'greyfen' as const, respawn: 'never' as const, leash: true };
const leeches = (id: string, tag: string, anchorPrefix: string, from: number, to: number, quest: string, flag: string): SpawnerDef => ({
  id, tag, enemy: 'fen-leech', count: to - from + 1, anchor: `${anchorPrefix}${from}`, memberAnchors: range(anchorPrefix, from, to), activation: { quest, flag }, ...common,
});
const shambler = (id: string, tag: string, anchor: string, quest: string, flag: string): SpawnerDef => ({
  id, tag, enemy: 'peat-shambler', count: 1, anchor, activation: { quest, flag }, ...common,
});
const pack = (id: string, tag: string, anchorPrefix: string, quest: string, flag: string, extra: Partial<SpawnerDef> = {}): SpawnerDef => ({
  id, tag, enemy: 'hunter-spearman', memberKinds: HUNTER_PACK_KINDS, leaderSlot: HUNTER_PACK_LEADER_SLOT, count: 4, anchor: `${anchorPrefix}1`,
  memberAnchors: range(anchorPrefix, 1, 4), activation: { quest, flag }, ...common, ...extra,
});

/** Quest-scoped groups of the nine Greyfen quests, on K3's `greyfen.spawn.*` anchors. */
export const GREYFEN_SPAWNERS: readonly SpawnerDef[] = [
  // M23: three leech knots on the causeway
  ...[1, 2, 3].map((n) => leeches(`greyfen.q.m23.knot.${n}`, M23_KNOT_TAGS[n - 1], `greyfen.spawn.m23.knot.${n}.`, 1, 3, 'm23', M23_KNOT_FLAGS[n - 1])),
  // M24: four leeches round the wreck
  leeches('greyfen.q.m24.wreck', M24_WRECK_TAG, 'greyfen.spawn.m24.wreck.', 1, 4, 'm24', M24_WRECK_FLAG),
  // R12: the torch drives leeches out of a bed (two at the first, one at the rest); the sickle wakes three at each
  ...R12_BEDS.map((n) => leeches(`greyfen.q.r12.burn.${n}`, R12_BURN_TAG, `greyfen.spawn.r12.bed.${n}.`, 1, R12_BURN_LEECHES[n - 1], 'r12', R12_TORCH_FLAG(n))),
  ...R12_BEDS.map((n) => leeches(`greyfen.q.r12.cut.${n}`, R12_CUT_TAG, `greyfen.spawn.r12.bed.${n}.`, 1, R12_CUT_LEECHES, 'r12', R12_CUT_FLAG(n, 1))),
  // M25: a shambler and five leeches in the herb beds
  shambler('greyfen.q.m25.shambler', M25_BEDS_TAG, 'greyfen.spawn.m25.herbs.1', 'm25', M25_BEDS_FLAG),
  leeches('greyfen.q.m25.leeches', M25_BEDS_TAG, 'greyfen.spawn.m25.herbs.', 2, 6, 'm25', M25_BEDS_FLAG),
  // R14: three leeches and the hunter pack at post 4
  leeches('greyfen.q.r14.leeches', R14_LEECH_TAG, 'greyfen.spawn.r14.leech.', 1, 3, 'r14', R14_LEECH_FLAG),
  pack('greyfen.q.r14.pack', R14_PACK_TAG, 'greyfen.spawn.r14.post4.', 'r14', R14_PACK_FLAG),
  // R13: five leeches in the chapel nave
  leeches('greyfen.q.r13.nave', R13_NAVE_TAG, 'greyfen.spawn.r13.nave.', 1, 5, 'r13', R13_NAVE_FLAG),
  // M26: four spearmen and a harpooner at the nets, three leeches in the shallows
  {
    id: 'greyfen.q.m26.hunters', tag: M26_HUNTERS_TAG, enemy: 'hunter-spearman', count: 5, anchor: 'greyfen.spawn.m26.nets.1', memberAnchors: range('greyfen.spawn.m26.nets.', 1, 5),
    memberKinds: ['hunter-spearman', 'hunter-spearman', 'hunter-spearman', 'hunter-spearman', 'hunter-harpooner'], leaderSlot: 4, activation: { quest: 'm26', flag: M26_NETGUARD_FLAG }, ...common,
  },
  leeches('greyfen.q.m26.leeches', M26_LEECHES_TAG, 'greyfen.spawn.m26.nets.', 6, 8, 'm26', M26_NETGUARD_FLAG),
  // M27: pack 1 under the blinds (unaware to a quiet player), pack 2 at the cages (always fights)
  pack('greyfen.q.m27.pack1', M27_PACK1_TAG, 'greyfen.spawn.m27.pack.1.', 'm27', M27_PACK1_FLAG, { despawnOnQuestEnd: true }),
  pack('greyfen.q.m27.pack2', M27_PACK2_TAG, 'greyfen.spawn.m27.pack.2.', 'm27', M27_PACK2_FLAG, { despawnOnQuestEnd: true }),
  // D05: ten leeches and two shamblers, room by room (K3's ledges, never in the water)
  leeches('greyfen.q.d05.cell-1', D05_ROOM_TAG('cell-1'), 'greyfen.spawn.d05.cell-1.', 1, 3, 'd05', D05_ROOM_FLAG('cell-1')),
  leeches('greyfen.q.d05.sluice-1', D05_ROOM_TAG('sluice-1'), 'greyfen.spawn.d05.sluice-1.', 1, 2, 'd05', D05_ROOM_FLAG('sluice-1')),
  shambler('greyfen.q.d05.sluice-1.shambler', D05_ROOM_TAG('sluice-1'), 'greyfen.spawn.d05.sluice-1.3', 'd05', D05_ROOM_FLAG('sluice-1')),
  leeches('greyfen.q.d05.cell-3', D05_ROOM_TAG('cell-3'), 'greyfen.spawn.d05.cell-3.', 1, 3, 'd05', D05_ROOM_FLAG('cell-3')),
  leeches('greyfen.q.d05.sluice-2', D05_ROOM_TAG('sluice-2'), 'greyfen.spawn.d05.sluice-2.', 1, 2, 'd05', D05_ROOM_FLAG('sluice-2')),
  shambler('greyfen.q.d05.sluice-2.shambler', D05_ROOM_TAG('sluice-2'), 'greyfen.spawn.d05.sluice-2.3', 'd05', D05_ROOM_FLAG('sluice-2')),
];

export const GREYFEN_ROOMS = D05_ROOMS;
