// The Waste quests' scenes on L0's sequencer (contracts v0.8 item 9): the first dream (M44, Q10: the hummed tune only, no
// lines), Ulthred's voice through the glass (M45, design 7.7: the first time it is heard) and the rim in sight (M46). Each ends on
// its flag (written at the end, watched or skipped). The dream's black veil and its hum are the director's (keyed on the scene's
// start and end), so the scene stays headless-safe. Prose is invented (Q6) and logged.
import type { SceneDef, SceneStep } from '../../../../scenes/types';
import { M44_DREAM_SCENE, M44_DREAM_SEEN } from './m44.quest';
import { M45_VOICE, M45_VOICE_SCENE } from './m45.quest';
import { M46_RIM, M46_RIM_SCENE } from './m46.quest';

const text: Record<string, string> = {};
const line = (scene: string, n: number, speakerId: string, t: string, seconds = 4): SceneStep => {
  const textKey = `scene.${scene}.${n}`;
  text[textKey] = t;
  return { line: { speakerId, textKey, seconds } };
};

/** Seconds of the dream's dark, while the hum plays (L8's `sfx.dream.hum` runs about 12 s). */
export const DREAM_SECONDS = 14;

export const SCENE_A4_DREAM: SceneDef = {
  id: M44_DREAM_SCENE,
  steps: [
    { wait: DREAM_SECONDS },
    { flag: { key: M44_DREAM_SEEN, value: true } },
  ],
};

const V = (n: number, who: string, t: string, s?: number) => line(M45_VOICE_SCENE, n, who, t, s);
export const SCENE_M45_VOICE: SceneDef = {
  id: M45_VOICE_SCENE,
  steps: [
    { wait: 1 },
    V(1, 'ulthred', 'There. The whole of it. I have not heard it sung whole since the anvil closed over me.', 5),
    V(2, 'cael', 'Who is that? Where are you?', 3),
    V(3, 'ulthred', 'Where I have always been. Under the fire, holding it up. You carry a piece of my heart, little knight. It hums to me.', 6),
    V(4, 'wulfhild', 'Do not answer it. The walkers have a rule about voices in the glass.', 4),
    V(5, 'ulthred', 'The walkers. Grandchildren of the ones who ran. Tell them their king remembers them.', 5),
    V(6, 'cael', 'The voice is gone. The pillars are still ringing.', 3),
    { flag: { key: M45_VOICE, value: true } },
  ],
};

const R = (n: number, who: string, t: string, s?: number) => line(M46_RIM_SCENE, n, who, t, s);
export const SCENE_M46_RIM: SceneDef = {
  id: M46_RIM_SCENE,
  steps: [
    R(1, 'hrolf', 'There it is. The rim. I have seen it in old maps and bad dreams, and it is uglier than both.', 5),
    R(2, 'cael', 'And brighter. You can feel it on your face from here.', 4),
    R(3, 'hrolf', 'Wulfhild\'s fire is just below. Come and sit. Whatever is up there will still be there in the morning.', 5),
    { flag: { key: M46_RIM, value: true } },
  ],
};

export const WASTE_A4_SCENES: readonly SceneDef[] = [SCENE_A4_DREAM, SCENE_M45_VOICE, SCENE_M46_RIM];
export const WASTE_A4_SCENE_STRINGS: Readonly<Record<string, string>> = text;
