import type { QuestDef } from '../types';
import { t03 } from './t03.quest';
import { t12 } from './t12.quest';
import { m01 } from './m01.quest';
import { m02 } from './m02.quest';
import { m03 } from './m03.quest';
import { m04 } from './m04.quest';
import { m05 } from './m05.quest';
import { d01 } from './d01.quest';
import { r01 } from './r01.quest';
import { r02 } from './r02.quest';

import { m06 } from './m06.quest';
import { m07 } from './m07.quest';
import { m08 } from './m08.quest';
import { m09 } from './m09.quest';
import { m10 } from './m10.quest';
import { d02 } from './d02.quest';
import { r03 } from './r03.quest';
import { r04 } from './r04.quest';

import { ACT2_QUEST_DEFS } from './act2';
import { ACT3_QUEST_DEFS } from './act3';

export const questDefs: QuestDef[] = [t03, t12, m01, m02, m03, m04, m05, d01, r01, r02,
  m06, m07, m08, m09, m10, r03, r04, d02, ...ACT2_QUEST_DEFS, ...ACT3_QUEST_DEFS];
