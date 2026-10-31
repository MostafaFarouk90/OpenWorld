import { buildTree } from '../../act2/build';
import { all } from '../../act2/cond';
import { C, voice } from './common';
import { M23_SIGHT_SCENE } from '../../../../quests/content/act3/greyfen/m23.quest';
import { R13_SONG_SCENE } from '../../../../quests/content/act3/greyfen/r13.quest';
import { M26_VOICE_SCENE } from '../../../../quests/content/act3/greyfen/m26.quest';
import { M27_ALONE_SCENE, M27_AFTER_SCENE } from '../../../../quests/content/act3/greyfen/m27.quest';
import { D05_OUTCOME_SCENE, D05_UNDERCROFT_SCENE } from '../../../../quests/content/act3/greyfen/d05.quest';

/** The Greyfen set pieces as one-way scene trees: the director starts each (no start rule beyond "always"), the talk objective is credited at its end. */
const scene = (id: string, lines: ReturnType<ReturnType<typeof voice>>[]) => buildTree({
  id, start: [{ when: all(), seg: 'scene' }], segments: { scene: { lines } },
});

const F = voice('fen');
const H = voice('hathren');
const L = voice('leofa');
const B = voice('bell-keeper');
const G = voice('gytha');
const M = voice('monk-echo');

export const SCENE_M23_SIGHT = scene(M23_SIGHT_SCENE, [
  C('The planks end. Ahead, the water is not still.'),
  F('Rings spread across the Mere, one, then three, then a dozen, as though something very large had breathed out under the surface.'),
  C('Something is down there.'),
  F('A low note, felt in the teeth more than heard. It rises, wavers, and stops, like a song cut off in the middle of a word.'),
  C('The reed-folk were right. It sang. Now it does not.'),
  F('The rings fade. The reeds lean toward the water, all together, and wait.'),
]);

export const SCENE_R13_SONG = scene(R13_SONG_SCENE, [
  B('The altar. Put your hands where the carving has worn thin; the monks\' hands made those hollows.'),
  C('I have the four verses. I do not have the tune.'),
  B('The tune is the water. Listen to how it drops against the stone, and match it. A beat, a rest, a beat.'),
  C('Like a heartbeat.'),
  B('Like a very old heartbeat. Try it once for practice. A miss will not hurt you; the song only wants to be sung.'),
  B('Then sing it for real. For her, and for us.'),
]);

export const SCENE_M26_VOICE = scene(M26_VOICE_SCENE, [
  H('Little ember. You have cut my nets.'),
  C('I have. Are you free?'),
  H('Free is a word for creatures who were ever bound. I was held. Held is not the same.'),
  C('The hunters will come again.'),
  H('Let them. I woke once. I will not sleep as lightly again.'),
  H('You carry my kin\'s fire in your blood and you did not use it on me. Why?'),
  C('You were not my enemy.'),
  H('No. That is why I let you stand on my back. Few have.'),
  H('Take what I leave on the shore. A scale, no more. When the fire in you grows too loud, hold it, and remember that someone once let you walk unburned.'),
  H('Now go. The Mere is mine again, and I would like to be alone with it.'),
]);

export const SCENE_M27_LEOFA = scene(M27_ALONE_SCENE, [
  L('I have no one to send with you, {name}. The deserter is in the stocks, and the rest of the post is spread too thin.'),
  C('I will go alone.'),
  L('You will. But you will not be unwatched. I will be on the ridge with the long bow, and I will take any hunter who looks too long at your back.'),
  C('Thank you.'),
  L('Do not thank me. Come out alive, and bring the young. That is thanks enough.'),
  L('Go quiet. Go slow. The blinds are thick; use them.'),
]);

export const SCENE_M27_AFTERMATH = scene(M27_AFTER_SCENE, [
  F('The young stream out of the reeds in a long green line, tails flicking, and go down to the water without looking back.'),
  C('They are going home.'),
  F('The last of them stops, turns its small head, and looks at you for the space of three breaths. Then it is gone.'),
  C('Whoever pays for these will pay for something else now.'),
  F('Behind you the cages stand open, empty, the iron still warm from the sun.'),
  C('Leofa will want to see the seal.'),
]);

export const SCENE_D05_UNDERCROFT = scene(D05_UNDERCROFT_SCENE, [
  G('Hold the door. Let me look at it first.'),
  C('It is a flooded stair.'),
  G('It is a stair, and the water on it is older than the stair. The monks built the cells above and the arena below. They built the sluices to control the water, and the water never forgave them.'),
  C('And Murkjaw?'),
  G('Below. You will hear him before you see him. A long groan, like a ship\'s timber.'),
  G('Breathe, {name}. Breathe deeply. And do not trust the dark.'),
]);

export const SCENE_D05_OUTCOME = scene(D05_OUTCOME_SCENE, [
  M('It is quiet. I have not heard it quiet in a hundred years.'),
  C('Murkjaw is dead.'),
  M('Dead. And the brothers are gone with him. I felt them go, one by one, the way you feel the tide leave.'),
  C('Were they his?'),
  M('They were never his. He kept them because no one else would. You have freed him as well as them.'),
  M('The sluices stand open. The water will drain, and the Deeps will be only a cellar. A very old cellar, with a very old door.'),
  C('Is there anything I can do for you?'),
  M('Ring the bell at the chapel. I always wanted to hear it again. Farewell, knight.'),
]);

export const SCENE_TREES = [SCENE_M23_SIGHT, SCENE_R13_SONG, SCENE_M26_VOICE, SCENE_M27_LEOFA, SCENE_M27_AFTERMATH, SCENE_D05_UNDERCROFT, SCENE_D05_OUTCOME];

/** Names of the speakers that are not NPC definitions (the dialogue panel reads `npc.<speaker>.name`). */
export const SPEAKER_NAMES: Record<string, string> = {
  'npc.fen.name': 'The fen',
  'npc.hathren.name': 'Hathren Quench-Tongue',
  'npc.crow.name': 'Gytha\'s crow',
};
