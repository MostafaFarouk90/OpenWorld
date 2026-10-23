import type { Act2Note } from '../../notes';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page', codexId?: string): Act2Note =>
  ({ id, anchorId, speaker, lines, look, ...(codexId ? { codexId } : {}) });

/** Readable notes of M18 (the pipes, at A4's cavern anchor; the plaque is A9's own readable). */
export const M18M19_NOTE_LIST: Act2Note[] = [
  n('note-m18-pipes', 'oldsmoke.bellows.pipes', 'cael', [
    'The pipe run is older than the shaft. Six iron mains leave a single manifold and climb to six great leather lungs hung from the roof, and a valve wheel sits on each main.',
    'Every wheel has been turned out of true, some a full turn, some more. Someone spoiled this on purpose, and took their time doing it.',
  ], 'box'),
];
