// The Rim quests' scenes on the v0.8 sequencer (with v0.9's variants). Each writes its flag at the end (finished or skipped), so
// a skip never stalls a step; M49's arrival writes the allies' flag last (they stand at their camp posts from there).
// The director registers the named tests (a won House's delegate, R11's spared wyrm), since the delegate and choice flags hold
// strings a FlagCondition cannot compare. Prose is invented (Q6) and logged under "Act 5 N10".
import type { SceneDef, SceneStep } from '../../../../scenes/types';
import { M47_SIGHT, M47_SIGHT_SCENE } from './m47.quest';
import { M48_VENTS_ROAR, M48_VENTS_SCENE } from './m48.quest';
import { M49_ARRIVAL_SCENE, M49_ARRIVED, M49_HOUSES, M49_RISEN, M49_RISE_SCENE, type M49House } from './m49.quest';
import { R26_IN, R26_SCENE } from './r26.quest';
import { R29_SCENE, R29_SOUNDED } from './r29.quest';
import { M50_COMPLETE, M50_COOLED, M50_COOL_SCENE } from './m50.quest';
import { M51_DRAGONS_SCENE, M51_FIRES, M51_FIRES_SCENE, M51_LANDED } from './m51.quest';

/** Named scene tests the director registers (`scenes.registerTest`). */
export const TEST_DELEGATE = (h: M49House): string => `a5r.delegate.${h}`;
export const TEST_R11_SPARED = 'a5r.r11.spared';
export const TEST_R26_FAST = 'a5r.r26.fast';

const text: Record<string, string> = {};
const line = (scene: string, n: number | string, speakerId: string, t: string, seconds = 4): SceneStep => {
  const textKey = `scene.${scene}.${n}`;
  text[textKey] = t;
  return { line: { speakerId, textKey, seconds } };
};
const flag = (key: string): SceneStep => ({ flag: { key, value: true } });

const S = (n: number, who: string, t: string, s?: number) => line(M47_SIGHT_SCENE, n, who, t, s);
export const SCENE_M47_SIGHT: SceneDef = {
  id: M47_SIGHT_SCENE,
  steps: [
    S(1, 'cael', 'So that is the Caldera. A whole country of fire, sunk in the mountain like a coal in a grate.', 5),
    S(2, 'alric', 'The Sunforge Anvil, at the heart. The light you see is not lava. It is the forge, still burning after three hundred years.', 6),
    S(3, 'alric', 'Somewhere under it, the old king. Vey wants him woken. The stokers swore he would sleep.', 5),
    S(4, 'cael', 'Then we keep the stokers\' oath.', 3),
    flag(M47_SIGHT),
  ],
};

const V = (n: number, who: string, t: string, s?: number) => line(M48_VENTS_SCENE, n, who, t, s);
export const SCENE_M48_VENTS: SceneDef = {
  id: M48_VENTS_SCENE,
  steps: [
    { wait: 1 },
    V(1, 'cael', 'All four wheels open. Listen to it.', 3),
    V(2, 'alric', 'The vents breathing together. The stokers used to say the mountain sighs when it is tended.', 5),
    V(3, 'alric', 'The last channel will crust over while they roar. Cross now, before it remembers how to burn.', 5),
    flag(M48_VENTS_ROAR),
  ],
};

const A = (n: number | string, who: string, t: string, s?: number) => line(M49_ARRIVAL_SCENE, n, who, t, s);
const houseLine: Record<M49House, [string, string]> = {
  halvard: ['wystan', 'Halvard\'s pikes, up the stairs in good order. Lord Wystan sends his regards and his best men.'],
  oswin: ['merrin', 'Oswin\'s wagons are at the foot. Whatever the mountain needs, House Oswin has counted twice.'],
  grisel: ['wenna', 'Grisel\'s archers. We climbed faster than the pikes and we will tell them so.'],
};
export const SCENE_M49_ARRIVAL: SceneDef = {
  id: M49_ARRIVAL_SCENE,
  steps: [
    A(1, 'hrolf', 'There. Torches on the stairs. That is not Vey\'s colour.', 4),
    ...M49_HOUSES.map((h): SceneStep => ({ variant: { cases: [{ when: { test: TEST_DELEGATE(h) }, step: A(`h.${h}`, houseLine[h][0], houseLine[h][1], 5) }] } })),
    A(2, 'wulfhild', 'The walkers came too. Nobody asked us. We came anyway.', 4),
    A(3, 'rook', 'And me, of course. Somebody has to keep the nobles honest.', 4),
    A(4, 'hrolf', 'Go and speak to them, all of them. They climbed a mountain for you. The least you can do is say thank you.', 5),
    // the coordinator's ruling: the allies stand at their camp posts when the scene ends
    flag(M49_ARRIVED),
  ],
};

const B = (n: number, who: string, t: string, s?: number) => line(M49_RISE_SCENE, n, who, t, s);
export const SCENE_M49_BANNERS: SceneDef = {
  id: M49_RISE_SCENE,
  steps: [
    B(1, 'cael', 'The banners are up. You can see them from the plain.', 3),
    B(2, 'edric', 'So can Vey. Good. Let him count them and think twice.', 4),
    B(3, 'hrolf', 'He will not think twice. But his soldiers might.', 4),
    flag(M49_RISEN),
  ],
};

const C = (n: number | string, who: string, t: string, s?: number) => line(R26_SCENE, n, who, t, s);
export const SCENE_R26_CONVOY: SceneDef = {
  id: R26_SCENE,
  steps: [
    C(1, 'r26-convoy-master', 'Rim Camp. I did not think I would see it. Unhitch the mules before they change their minds.', 5),
    { variant: {
      cases: [{ when: { test: TEST_R26_FAST }, step: C('fast', 'merrin', 'Every crate, and two guards on stretchers. That is the price of the short road. They will mend.', 5) }],
      otherwise: C('long', 'merrin', 'Two crates short, and every guard on their feet. I would make that trade again.', 5),
    } },
    flag(R26_IN),
  ],
};

const G = (n: number, who: string, t: string, s?: number) => line(R29_SCENE, n, who, t, s);
export const SCENE_R29_GONG: SceneDef = {
  id: R29_SCENE,
  steps: [
    { wait: 2 },
    G(1, 'ansgar', 'Hear that? It is going all the way round the rim. Every stoker post. Every shelf.', 5),
    G(2, 'cael', 'The dead on the shelf have stopped. They are listening.', 4),
    G(3, 'ansgar', 'The gong called them to the shift. Now it calls them home. Strike it again when the walls are under attack, and every one of us will hear.', 6),
    flag(R29_SOUNDED),
  ],
};

const K = (n: number, who: string, t: string, s?: number) => line(M50_COOL_SCENE, n, who, t, s);
export const SCENE_M50_COOL: SceneDef = {
  id: M50_COOL_SCENE,
  steps: [
    { wait: 1 },
    K(1, 'cael', 'The channels are running together. The floor is going dark under my feet.', 4),
    K(2, 'alric', 'The hall has cooled. Listen: the forge door. It has not moved since the night we barred it.', 5),
    flag(M50_COOLED),
    flag(M50_COMPLETE),
  ],
};

const D = (n: number | string, who: string, t: string, s?: number) => line(M51_DRAGONS_SCENE, n, who, t, s);
export const SCENE_M51_DRAGONS: SceneDef = {
  id: M51_DRAGONS_SCENE,
  steps: [
    { wait: 2 },
    D(1, 'ysmeryth', 'You called, small one, and the old horn still answers to my name. Here we are.', 5),
    D(2, 'orsk', 'Orsk. I came because she asked. I stay because the mountain is warm.', 4),
    D(3, 'hathren', 'Hathren. Do not mind Orsk. He has been sulking since the Peaks.', 4),
    { variant: { cases: [{ when: { test: TEST_R11_SPARED }, step: D('wyrm', 'ysmeryth', 'And one more. The hill wyrm you spared followed us. It does not talk. It remembers.', 5) }] } },
    flag(M51_LANDED),
  ],
};

const F = (n: number, who: string, t: string, s?: number) => line(M51_FIRES_SCENE, n, who, t, s);
export const SCENE_M51_FIRES: SceneDef = {
  id: M51_FIRES_SCENE,
  steps: [
    F(1, 'hathren', 'Look down. The plain.', 3),
    F(2, 'cael', 'Fires. Hundreds of them. The Warhost has come.', 4),
    F(3, 'ysmeryth', 'And look, already climbing the east terraces. Scouts. Vey wants to count us before he fights us.', 5),
    flag(M51_FIRES),
  ],
};

export const RIM_A5_SCENES: readonly SceneDef[] = [
  SCENE_M47_SIGHT, SCENE_M48_VENTS, SCENE_M49_ARRIVAL, SCENE_M49_BANNERS, SCENE_R26_CONVOY, SCENE_R29_GONG, SCENE_M50_COOL,
  SCENE_M51_DRAGONS, SCENE_M51_FIRES,
];
export const RIM_A5_SCENE_STRINGS: Readonly<Record<string, string>> = text;
