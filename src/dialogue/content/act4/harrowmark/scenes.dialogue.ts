// The set pieces as one-way scene trees: the director (or a seat prop) starts each, and the talk objective is credited at its end.
import { buildTree, type BuiltTree, type Line } from '../../act2/build';
import { all } from '../../act2/cond';
import { M36_DAGGER_SCENE } from '../../../../quests/content/act4/harrowmark/m36.quest';
import { M37_BOND_SCENE, M37_END_SCENE } from '../../../../quests/content/act4/harrowmark/m37.quest';
import { C, voice } from './common';

const scene = (id: string, lines: Line[]): BuiltTree => buildTree({ id, start: [{ when: all(), seg: 'scene' }], segments: { scene: { lines } } });

const DG = voice('daggerman');
const T = voice('tobb');
const H = voice('hrolf');
const A = voice('aelfreda');
const G = voice('gaut');

export const SCENE_M36_DAGGER = scene(M36_DAGGER_SCENE, [
  DG('Off the roofs, are we? I had money on the street.'),
  C('Who sent you?'),
  DG('A man with a clean hand and a dirty seal. You will meet him. Everyone does, in the end.'),
  DG('Three delegates, three doors, tomorrow night. You were never on the list. You should have stayed off it.'),
  DG('Lads.'),
]);

export const SCENE_M37_TOBB = scene(M37_BOND_SCENE('tobb'), [
  T('Do you remember the first night? Kettlewick, the inn with the leaking roof, and you asked me if I knew the way to Harrowmark.'),
  C('You said you did.'),
  T('I did not. I had never been past the ford. I just wanted to see where you were going.'),
  T('I am still watching. It has been worth the walk.'),
  C('You could have gone home a dozen times.'),
  T('Home is wherever you are making trouble, it turns out. Pass the ham.'),
  T('Whatever happens in that hall tomorrow, I am at your back. That is not a speech. It is just where I stand.'),
]);

export const SCENE_M37_HROLF = scene(M37_BOND_SCENE('hrolf'), [
  H('In Stonefold, the night before a fight, we tell the worst story we know. So the fight cannot be worse.'),
  H('Mine is the night my master fell through the ice and I pulled him out by the beard. He never forgave me. He was very proud of that beard.'),
  C('And did the fight turn out better than the story?'),
  H('Always. Nothing is worse than a man with half a beard telling you you have ruined his life.'),
  H('You have done something I did not think a lowlander could, little knight. You have made me care about a city.'),
  H('Do not tell anyone. I have a reputation.'),
  C('Your secret is safe.'),
]);

export const SCENE_M37_AELFREDA = scene(M37_BOND_SCENE('aelfreda'), [
  A('I have been praying for the Council. Not for the vote. For the people in the hall, that they come out of it alive.'),
  C('Do you think they will?'),
  A('I think the Regent has not spent a year building a furnace under the Keep to lose a vote politely.'),
  A('So I am praying for them, and I am sharpening my knife. The Maker helps those who carry a spare.'),
  C('That does not sound like the chapel\'s teaching.'),
  A('The chapel was never in an occupied city. Eat something, {name}. You will need your strength, and I cannot heal hunger.'),
  A('And thank you. For bringing me this far. I would not have chosen any other road.'),
]);

export const SCENE_M37_TOAST = scene(M37_END_SCENE, [
  T('Right. Glasses up, all of you. Gaut, that means you too, stair or no stair.'),
  H('To the boy king, who trips on his own sword.'),
  A('To the city, and everyone still in it tomorrow night.'),
  G('To the knight. I knew it in the frost field.'),
  T('And to supper, which we did not have to fight anyone for. First time in a month.'),
  C('To all of you.'),
  T('Now bed. The Council sits at dawn, and Edric will want you there before the bell.'),
  T('And if anything goes wrong in that hall, we come for you. That is not a toast, that is a promise.'),
]);

export const SCENE_TREES: readonly BuiltTree[] = [SCENE_M36_DAGGER, SCENE_M37_TOBB, SCENE_M37_HROLF, SCENE_M37_AELFREDA, SCENE_M37_TOAST];

/** Display names of the scene speakers that are not on the npcs service. */
export const SPEAKER_NAMES: Record<string, string> = { 'npc.daggerman.name': 'The daggerman' };
