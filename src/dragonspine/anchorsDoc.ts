import { renderAnchorsDoc } from '../region/anchorsDoc';
import { DRAGONSPINE_DOC, DRAGONSPINE_LAYOUT } from './dragonspine.layout';

/** `src/dragonspine/ANCHORS.md` must equal this (see anchorsDoc.test.ts). K6b, K7, K9, K10 and K13 build against these ids. */
export const dragonspineAnchorsDoc = (): string => renderAnchorsDoc(DRAGONSPINE_LAYOUT, DRAGONSPINE_DOC);
