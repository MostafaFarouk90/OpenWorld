import type { QuestDef } from '../../types';
import { interacts, reads, story } from './helpers';

export const M12_PREP = ['use:m12-prep-1', 'use:m12-prep-2', 'use:m12-prep-3'];
export const M12_TEND = ['use:m12-tend-1', 'use:m12-tend-2'];
export const M12_READ = ['note-m12-roll', 'note-m12-tally'];

/**
 * M12 Cinderford Under Siege. Osgar's plan, three barricade-prep jobs, A7's three-wave raid (`cinderford-raid`), the
 * wounded afterwards (two carried to the refuge, two tended where they lie, two notes read at the barricade (the militia roll, the cart tally)).
 */
export const m12: QuestDef = {
  id: 'm12',
  titleKey: 'quest.m12.title',
  summaryKey: 'quest.m12.summary',
  sequential: true,
  startWhen: { quest: 'm11', state: 'completed' },
  objectives: [
    { id: 'brief', type: 'talk', target: 'osgar', textKey: 'quest.m12.brief' },
    interacts('prep', 'quest.m12.prep', M12_PREP),
    story('raid', 'quest.m12.raid', 'wave.cleared', { match: { defId: 'cinderford-raid', index: 2 } }),
    { id: 'carry', type: 'carry', target: 'trg.q12.m12.refuge', required: 2, textKey: 'quest.m12.carry' },
    interacts('tend', 'quest.m12.tend', M12_TEND),
    reads('read', 'quest.m12.read', M12_READ),
    { id: 'report', type: 'talk', target: 'osgar', textKey: 'quest.m12.report' },
  ],
  rewards: [{ xp: 500 }, { giveGold: 200 }],
};
