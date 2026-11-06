// L10 PR 2: the three set pieces on L0's scene sequencer (contracts v0.8 item 9): the betrayal in the Council Chamber (M38),
// Gaut's fall on the Keep stairs (M39) and the gathering at the camp (M41). Each ends on its quest's flag (written at the end,
// whether watched or skipped) and has a checkpoint before its turn, so a load replays only the tail. The betrayal's six are
// spawned by the director at the `signal` checkpoint (or on the end flag when skipped), never by a scene step, which a
// skip would drop. The director registers
// them and plays each when its step comes up. Prose is invented (Q6) and logged in design/changes-applied.md.
import type { SceneDef, SceneStep } from '../../../../scenes/types';
import { M38_BETRAYAL, M38_TURNED } from './m38.quest';
import { M39_FALL, M39_FALLEN } from './m39.quest';
import { M41_CAMP_SCENE, M41_GATHERED } from './m41.quest';

const text: Record<string, string> = {};
const line = (scene: string, n: number, speakerId: string, t: string, seconds = 4): SceneStep => {
  const textKey = `scene.${scene}.${n}`;
  text[textKey] = t;
  return { line: { speakerId, textKey, seconds } };
};

const B = (n: number, who: string, t: string, s?: number) => line(M38_BETRAYAL, n, who, t, s);
export const SCENE_M38_BETRAYAL: SceneDef = {
  id: M38_BETRAYAL,
  steps: [
    B(1, 'vey', 'There will be no vote. A boy with a box of papers is not a king, and this Council is not a court.'),
    B(2, 'edric', 'You do not get to decide that, Regent. The Houses do.'),
    B(3, 'vey', 'The Houses have decided. Lord Grisel?'),
    B(4, 'aldous', 'Grisel stands with the Regent. The boy\'s grandfather bled this city white. We will not have another.'),
    { checkpoint: 'signal' },
    B(5, 'vey', 'Doors.', 2),
    B(6, 'wystan', 'The side doors! Guard the King!', 3),
    B(7, 'edric', 'Let go of me! Let go!', 3),
    { wait: 1 },
    B(8, 'cael', 'Hold on. I am coming.', 2),
    { flag: { key: M38_TURNED, value: true } },
  ],
};

const F = (n: number, who: string, t: string, s?: number) => line(M39_FALL, n, who, t, s);
export const SCENE_M39_FALL: SceneDef = {
  id: M39_FALL,
  steps: [
    F(1, 'gaut', 'Here he comes. The big one. Vey keeps his champion for the end.'),
    F(2, 'gaut', 'Stand back, lad. This one is mine.'),
    { checkpoint: 'blow' },
    F(3, 'cael', 'Gaut!', 2),
    F(4, 'gaut', 'Got him. Got him, and he got me. Fair trade, at my age.', 5),
    F(5, 'gaut', 'Take it. The sword. I knighted you with it in a frosted field. It knows your hand.', 5),
    F(6, 'gaut', 'Go down. Get the boy out. Do not look back at me; I would hate you to see me lose my temper with a staircase.', 6),
    F(7, 'gaut', 'I am proud of you. I said it already. I will say it again.', 5),
    { wait: 2 },
    { flag: { key: M39_FALLEN, value: true } },
  ],
};

const K = (n: number, who: string, t: string, s?: number) => line(M41_CAMP_SCENE, n, who, t, s);
export const SCENE_M41_CAMP: SceneDef = {
  id: M41_CAMP_SCENE,
  steps: [
    K(1, 'edric', 'He should be here. He should be sitting by this fire telling me I am holding the cup wrong.'),
    K(2, 'rook', 'Someone is coming along the wall. More than one.'),
    { checkpoint: 'arrivals' },
    K(3, 'wystan', 'Majesty. The Bastion is lost, but the men are not. Some of them, anyway.'),
    K(4, 'merrin', 'The Counting-House books, and the silver that got out. Vey can have the building.'),
    K(5, 'wenna', 'Every miner who would come. My father can keep his court.'),
    K(6, 'dunstan', 'And a forge on a cart, if anyone wants a blade mended before we walk.'),
    K(7, 'edric', 'Then there are enough of us. Bring out the map.'),
    { flag: { key: M41_GATHERED, value: true } },
  ],
};

export const HARROWMARK_A4_SCENES: readonly SceneDef[] = [SCENE_M38_BETRAYAL, SCENE_M39_FALL, SCENE_M41_CAMP];
export const HARROWMARK_A4_SCENE_STRINGS: Readonly<Record<string, string>> = text;
