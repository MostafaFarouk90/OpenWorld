import type { BeatDef, BeatId } from './types';

export const FULL_ORDER: BeatId[] = [
  't01', 't02', 't03', 't04', 't05', 't06', 't07', 't08', 't09', 't10', 't11', 't12', 't13', 't14', 't15',
];
export const VETERAN_ORDER: BeatId[] = ['t01', 't02', 't03', 't04', 't05', 'skirmish', 't12', 't13', 't14', 't15'];
export const KETTLEWICK_ORDER: BeatId[] = ['t15'];

/** Verbs the director can lock; each is unlocked by the beat that teaches it. */
export const LOCKABLE_VERBS: string[] = [
  'attack2', 'attack3', 'attack4', 'block', 'dodge', 'lockOn', 'surge',
  'ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6',
];

/**
 * NPC anchors defined by the plugin (plan section 9 item 12). yawDeg: 0 faces -Z, 90 faces +X
 * (the same convention as the player yaw), so a player facing -Z is looked at with yaw 0 and one facing +Z with 180.
 * The player advances along +Z, so NPCs on the lane face -Z (yaw 0) back toward the oncoming player.
 */
export const TUTORIAL_ANCHORS: { id: string; x: number; z: number; yawDeg: number }[] = [
  // Chapel yard: Gaut faces west toward the chapel door and the kneeling player.
  { id: 'tutorial.gaut.chapel', x: 36, z: 58, yawDeg: 270 },
  // Lane: the player runs along the lane toward +Z; Gaut waves them on, facing -Z (back at the player).
  { id: 'tutorial.gaut.lane', x: 2, z: 62, yawDeg: 0 },
  { id: 'tutorial.gaut.square', x: -4, z: 126, yawDeg: 0 },
  { id: 'tutorial.gaut.gate', x: -4, z: 160, yawDeg: 0 },
  // Aelfreda stands across the gate path from Gaut, also facing the player's approach (-Z).
  { id: 'tutorial.aelfreda.gate', x: 4, z: 160, yawDeg: 0 },
];

const P = (mechanic: string, action: string, textKey: string) => ({ mechanic, action, textKey });
const prompt = (mechanic: string, action: string = mechanic) => P(mechanic, action, `tutorial.prompt.${mechanic}`);

const t04Npcs = { gaut: 'tutorial.gaut.chapel', aelfreda: 'npc-post.aelfreda' };

export const BEATS: Readonly<Record<BeatId, BeatDef>> = {
  t01: {
    id: 't01', questId: 't01', startAnchor: 'beat.t01.start',
    npcs: { gaut: 'npc-post.gaut' },
    prompts: [prompt('move', 'moveForward'), prompt('attack1')],
    steps: [[{ kind: 'trigger', id: 'trg.t01.gate' }, { kind: 'flag', key: 'place.scarecrow.toppled' }]],
    lines: ['tutorial.line.t01.1'],
  },
  t02: {
    id: 't02', questId: 't02', startAnchor: 'beat.t02.start',
    npcs: { gaut: 'npc-post.gaut' },
    // 'look' has no input action of its own; the prompt service needs a known action.
    prompts: [prompt('look', 'moveForward')],
    steps: [[{ kind: 'gaze', anchors: ['chapel.banner-1', 'chapel.banner-2', 'chapel.banner-3'], degrees: 4, dwell: 0.25 }]],
    lines: ['tutorial.line.t02.1'],
  },
  t03: {
    id: 't03', questId: 't03', startAnchor: 'beat.t03.start',
    prompts: [prompt('interact')],
    steps: [[{ kind: 'quest', questId: 't03' }]],
  },
  t04: {
    id: 't04', questId: 't04', startAnchor: 'beat.t04.start',
    npcs: t04Npcs,
    cutscene: 'knighting',
    prompts: [P('interact', 'interact', 'tutorial.kneel.prompt')],
    steps: [
      [{ kind: 'trigger', id: 'trg.t04.chapel' }],
      [{ kind: 'interact', id: 'kneel:chapel' }],
      [{ kind: 'vow', dialogueId: 't04-vow' }],
    ],
  },
  t05: {
    id: 't05', questId: 't05', startAnchor: 'beat.t05.start',
    crisis: true,
    cutscene: 'crack',
    npcs: t04Npcs,
    prompts: [prompt('attack1')],
    waves: [[{ spawnerId: 't05.churchyard', aggro: true }]],
    steps: [
      [{ kind: 'kill', creature: 'ash-wraith', spawnTag: 't05.churchyard', count: 3 }],
      [{ kind: 'cleared', spawnerIds: ['t05.churchyard'] }],
    ],
    lines: ['tutorial.line.t05.1'],
  },
  t06: {
    id: 't06', questId: 't06', startAnchor: 'beat.t06.start',
    crisis: true,
    npcs: { gaut: 'tutorial.gaut.lane' },
    prompts: [prompt('sprint')],
    steps: [[{ kind: 'sprint', meters: 40, count: 2 }], [{ kind: 'trigger', id: 'trg.t06.end' }]],
    lines: ['tutorial.line.t06.1'],
  },
  t07: {
    id: 't07', questId: 't07', startAnchor: 'beat.t07.start',
    crisis: true,
    prompts: [prompt('jump')],
    steps: [[{ kind: 'trigger', id: 'trg.t07.cart' }], [{ kind: 'trigger', id: 'trg.t07.fence' }]],
  },
  t08: {
    id: 't08', questId: 't08', startAnchor: 'beat.t08.start',
    crisis: true,
    unlocks: ['attack2', 'attack3', 'attack4'],
    npcs: { gaut: 'tutorial.gaut.square' },
    prompts: [prompt('attack2'), prompt('attack3'), prompt('attack4')],
    waves: [[{ spawnerId: 't08.lane', healthScale: 2, aggro: true }]],
    steps: [
      [{ kind: 'attacks', slots: [2, 3, 4], chain: 4, window: 1.5 }],
      [{ kind: 'cleared', spawnerIds: ['t08.lane'] }],
    ],
    lines: ['tutorial.line.t08.1'],
  },
  t09: {
    id: 't09', questId: 't09', startAnchor: 'beat.t09.start',
    crisis: true,
    unlocks: ['block'],
    npcs: { gaut: 'tutorial.gaut.square' },
    prompts: [prompt('block')],
    waves: [[{ spawnerId: 't09.soldier', moves: ['soldier.chop'], aggro: true }]],
    steps: [[{ kind: 'count', event: 'blocked', count: 3 }], [{ kind: 'cleared', spawnerIds: ['t09.soldier'] }]],
  },
  t10: {
    id: 't10', questId: 't10', startAnchor: 'beat.t10.start',
    crisis: true,
    unlocks: ['dodge'],
    npcs: { gaut: 'tutorial.gaut.square' },
    prompts: [prompt('dodge')],
    waves: [[{ spawnerId: 't10.sweeper', moves: ['wraith.sweep'], aggro: true }]],
    steps: [[{ kind: 'count', event: 'dodged', count: 3 }], [{ kind: 'cleared', spawnerIds: ['t10.sweeper'] }]],
  },
  t11: {
    id: 't11', questId: 't11', startAnchor: 'beat.t11.start',
    crisis: true,
    unlocks: ['lockOn'],
    npcs: { gaut: 'tutorial.gaut.square' },
    prompts: [prompt('lockOn')],
    waves: [[{ spawnerId: 't11.square', aggro: true }]],
    steps: [[{ kind: 'lockSwap', kills: 2 }], [{ kind: 'cleared', spawnerIds: ['t11.square'] }]],
  },
  t12: {
    id: 't12', questId: 't12', startAnchor: 'beat.t12.start',
    npcs: { gaut: 'tutorial.gaut.square', edda: 'npc-post.edda' },
    prompts: [prompt('inventory'), prompt('journal')],
    steps: [
      [
        { kind: 'equipped', items: [{ slot: 'weapon', itemId: 'squires-arming-sword' }, { slot: 'armour', itemId: 'gauts-spare-tabard' }] },
        { kind: 'consume' },
      ],
      [{ kind: 'quest', questId: 't12' }],
    ],
  },
  t13: {
    id: 't13', questId: 't13', startAnchor: 'beat.t13.start',
    unlocks: ['ability1', 'ability2', 'ability3', 'ability4', 'ability5', 'ability6'],
    npcs: { gaut: 'tutorial.gaut.square' },
    prompts: [prompt('skills'), prompt('ability', 'ability1')],
    steps: [[{ kind: 'skill', actives: ['knight.rallyCry'], passives: ['knight.rimBash', 'knight.riposteEdge'] }]],
  },
  t14: {
    id: 't14', questId: 't14', startAnchor: 'beat.t14.start',
    npcs: { gaut: 'tutorial.gaut.square', hob: 'npc-post.hob' },
    prompts: [prompt('map'), prompt('fastTravel', 'map')],
    steps: [
      [{ kind: 'trigger', id: 'trg.t14.chapel' }],
      [{ kind: 'lit', waystoneId: 'chapel' }],
      [{ kind: 'travel' }],
    ],
  },
  t15: {
    id: 't15', questId: 't15', startAnchor: 'beat.t15.start',
    crisis: true,
    unlocks: ['surge'],
    npcs: { gaut: 'tutorial.gaut.gate', aelfreda: 'tutorial.aelfreda.gate' },
    prompts: [prompt('surge'), prompt('rest', 'interact')],
    waves: [[{ spawnerId: 't15.gate', aggro: true }]],
    waveSteps: [1],
    steps: [
      [{ kind: 'trigger', id: 'trg.t15.gate' }],
      [{ kind: 'spell', spellId: 'heartshard-surge' }, { kind: 'cleared', spawnerIds: ['t15.gate'] }],
      [{ kind: 'rest' }],
    ],
    lines: ['tutorial.line.t15.1'],
  },
  skirmish: {
    id: 'skirmish', questId: 't-skirmish', startAnchor: 'beat.t11.start',
    crisis: true,
    unlocks: ['attack2', 'attack3', 'attack4', 'block', 'dodge', 'lockOn'],
    npcs: { gaut: 'tutorial.gaut.square' },
    prompts: [prompt('attack2'), prompt('block'), prompt('dodge'), prompt('lockOn')],
    waves: [
      [{ spawnerId: 't08.lane', aggro: true }, { spawnerId: 't10.sweeper', moves: ['wraith.sweep'], aggro: true }],
      [{ spawnerId: 't09.soldier', moves: ['soldier.chop'], aggro: true }, { spawnerId: 't11.square', aggro: true }],
    ],
    // The sweeper's sweep cannot be blocked, so dodge is needed (review change 10). The first wave
    // refills if it is cleared before that dodge.
    waveSteps: [0, 2],
    steps: [
      [{ kind: 'count', event: 'dodged', count: 1 }],
      [{ kind: 'cleared', spawnerIds: ['t08.lane', 't10.sweeper'] }],
      [{ kind: 'cleared', spawnerIds: ['t09.soldier', 't11.square'] }],
    ],
  },
};
