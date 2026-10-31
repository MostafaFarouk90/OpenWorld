import type { QuestDef } from '../../../types';
import { reads, story } from '../../act2/helpers';

export const D05_BOSS = 'murkjaw';
/** K8's outcome flag: 'defeated' is the only value Murkjaw writes (frozen name, plans/act3-briefs/K8.md). */
export const D05_OUTCOME_FLAG = `boss.${D05_BOSS}.outcome`;
export const D05_STARTED = 'story.d05.started';
export const D05_SLUICE_FLAGS = ['story.d05.sluice1', 'story.d05.sluice2'] as const;
export const D05_SLUICES = ['use:d05-sluice-1', 'use:d05-sluice-2'];
export const D05_SEARCHES = ['note-d05-log', 'note-d05-reliquary', 'note-d05-marks', 'note-d05-spoil'];
export const D05_POCKETS = [1, 2, 3, 4].map((n) => `greyfen.d05.pocket.${n}`);
export const D05_POCKET_FLAG = (n: number): string => `story.d05.pocket${n}`;
export const D05_ROOMS = ['cell-1', 'sluice-1', 'cell-3', 'sluice-2'] as const;
export const D05_ROOM_TAG = (r: string): string => `d05.${r}`;
export const D05_ROOM_FLAG = (r: string): string => `story.d05.${r}Out`;
export const D05_ECHO_NPC = 'monk-echo';
export const D05_OUTCOME_NPC = 'scene.d05.outcome';
export const D05_OUTCOME_SCENE = 'scene-d05-outcome';
export const D05_UNDERCROFT_NPC = 'scene.d05.undercroft';
export const D05_UNDERCROFT_SCENE = 'scene-d05-undercroft';

const dive = (n: number) =>
  story(`dive${n}`, `quest.d05.dive${n}`, 'dive.surfaced', { match: { pocketId: D05_POCKETS[n - 1] }, doneWhen: { flag: D05_POCKET_FLAG(n), equals: true } });

/**
 * D05 Into the Mirewater. Gytha opens the Deeps door; the undercroft is entered (a scene), the drowned monk's echo is heard
 * at the first air pocket, and Cael dives through four pockets, clears the leeches and shamblers room by room, reads four
 * things, turns the two sluice wheels (which write `story.d05.sluice1/2`; K3's water sets read them) and fights Murkjaw. The
 * boss step is coded against frozen names: boss id `murkjaw`, `boss.defeated { bossId }`, `boss.murkjaw.outcome = 'defeated'`.
 */
export const d05: QuestDef = {
  id: 'd05',
  titleKey: 'quest.d05.title',
  summaryKey: 'quest.d05.summary',
  sequential: true,
  startWhen: { quest: 'm27', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'gytha', textKey: 'quest.d05.brief' },
    { id: 'undercroft', type: 'talk', target: D05_UNDERCROFT_NPC, textKey: 'quest.d05.undercroft' },
    dive(1),
    reads('log', 'quest.d05.log', [D05_SEARCHES[0]]),
    { id: 'cell1', type: 'kill', target: 'fen-leech', required: 3, spawnTag: D05_ROOM_TAG('cell-1'), textKey: 'quest.d05.cell1' },
    dive(2),
    { id: 'echo', type: 'talk', target: D05_ECHO_NPC, textKey: 'quest.d05.echo' },
    { id: 'sluice1', type: 'interact', target: D05_SLUICES[0], textKey: 'quest.d05.sluice1' },
    story('room1', 'quest.d05.room1', 'story.d05.room1Down', { doneWhen: { flag: 'story.d05.room1Down', equals: true } }),
    reads('reliquary', 'quest.d05.reliquary', [D05_SEARCHES[1]]),
    dive(3),
    { id: 'cell3', type: 'kill', target: 'fen-leech', required: 3, spawnTag: D05_ROOM_TAG('cell-3'), textKey: 'quest.d05.cell3' },
    reads('marks', 'quest.d05.marks', [D05_SEARCHES[2]]),
    dive(4),
    story('room2', 'quest.d05.room2', 'story.d05.room2Down', { doneWhen: { flag: 'story.d05.room2Down', equals: true } }),
    { id: 'sluice2', type: 'interact', target: D05_SLUICES[1], textKey: 'quest.d05.sluice2' },
    reads('spoil', 'quest.d05.spoil', [D05_SEARCHES[3]]),
    story('murkjaw', 'quest.d05.murkjaw', 'boss.defeated', { match: { bossId: D05_BOSS }, doneWhen: { flag: D05_OUTCOME_FLAG, equals: 'defeated' } }),
    { id: 'outcome', type: 'talk', target: D05_OUTCOME_NPC, textKey: 'quest.d05.outcome' },
  ],
  rewards: [{ xp: 900 }, { give: [{ itemId: 'murkjaw-tooth', count: 1 }] }],
};
