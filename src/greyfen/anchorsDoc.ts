import { renderAnchorsDoc } from '../region/anchorsDoc';
import { GREYFEN_DOC, GREYFEN_LAYOUT } from './greyfen.layout';

/** `src/greyfen/ANCHORS.md` must equal this (see anchorsDoc.test.ts). K7, K8, K9 and K12 build against these ids. */
export const greyfenAnchorsDoc = (): string => renderAnchorsDoc(GREYFEN_LAYOUT, GREYFEN_DOC);
