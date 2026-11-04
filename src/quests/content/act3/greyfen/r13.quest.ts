import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

export const R13_SEARCHES = ['note-r13-hymns', 'note-r13-font', 'note-r13-rope', 'note-r13-carving', 'note-r13-ledger'];
/** The chapel's four air pockets (K3): three on the nave route, the fourth under the altar. */
export const R13_POCKETS = ['greyfen.r13.pocket.1', 'greyfen.r13.pocket.2', 'greyfen.r13.pocket.3', 'greyfen.r13.altar'];
export const R13_POCKET_FLAG = (n: number): string => `story.r13.pocket${n}`;
export const R13_NAVE_TAG = 'r13.nave';
export const R13_NAVE_FLAG = 'story.r13.naveOut';
export const R13_ALTAR = 'use:r13-altar';
export const R13_LESSON = 'story.r13.lesson';
export const R13_SUNG = 'story.r13.sung';
export const R13_SONG_NPC = 'scene.r13.song';
export const R13_SONG_SCENE = 'scene-r13-song';
export const R13_CALMED = 'story.r13.calmed';
export const R13_KEEPER = 'bell-keeper';

const dive = (n: number) =>
  story(`dive${n}`, `quest.r13.dive${n}`, 'dive.surfaced', { match: { pocketId: R13_POCKETS[n - 1] }, doneWhen: { flag: R13_POCKET_FLAG(n), equals: true } });

/**
 * R13 Hathren's Lullaby. Gytha sends Cael into the Sunken Chapel to learn the water-song the drowned monks sang to Hathren.
 * The ghost bell keeper tells it and says goodbye, five searches (hymn board, font, bell rope, altar carving, flood ledger),
 * four dives from pocket to pocket, five leeches in the nave, and the song itself at the altar: a lesson run and the real run
 * on the rhythm runner (a miss restarts the run, it never fails the quest). The fen calms and the mist lifts; Gytha is told.
 */
export const r13: QuestDef = {
  id: 'r13',
  titleKey: 'quest.r13.title',
  summaryKey: 'quest.r13.summary',
  sequential: true,
  startWhen: { quest: 'm25', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'gytha', textKey: 'quest.r13.brief' },
    { id: 'keeper', type: 'talk', target: R13_KEEPER, textKey: 'quest.r13.keeper' },
    reads('hymns', 'quest.r13.hymns', [R13_SEARCHES[0]]),
    reads('font', 'quest.r13.font', [R13_SEARCHES[1]]),
    dive(1),
    dive(2),
    dive(3),
    reads('rope', 'quest.r13.rope', [R13_SEARCHES[2]]),
    { id: 'leeches', type: 'kill', target: 'fen-leech', required: 5, spawnTag: R13_NAVE_TAG, textKey: 'quest.r13.leeches' },
    dive(4),
    reads('carving', 'quest.r13.carving', [R13_SEARCHES[3]]),
    reads('ledger', 'quest.r13.ledger', [R13_SEARCHES[4]]),
    story('song', 'quest.r13.song', 'story.r13.sung', { doneWhen: { flag: R13_SUNG, equals: true } }),
    story('calm', 'quest.r13.calm', 'story.r13.calm', { doneWhen: { flag: R13_CALMED, equals: true } }),
    { id: 'farewell', type: 'talk', target: R13_KEEPER, textKey: 'quest.r13.farewell' },
    { id: 'report', type: 'talk', target: 'gytha', textKey: 'quest.r13.report' },
  ],
  rewards: [{ xp: 500 }, { give: [{ itemId: 'lullaby-reed-pipe', count: 1 }] }],
};
