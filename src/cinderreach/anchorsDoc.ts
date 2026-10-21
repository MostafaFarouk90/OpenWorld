import { renderAnchorsDoc } from '../region/anchorsDoc';
import { CINDERREACH_DOC, CINDERREACH_LAYOUT } from './cinderreach.layout';

/** `src/cinderreach/ANCHORS.md` must equal this (see anchorsDoc.test.ts). A5, A6b, A7, A9, A12 and A2 build against these ids. */
export const cinderreachAnchorsDoc = (): string => renderAnchorsDoc(CINDERREACH_LAYOUT, CINDERREACH_DOC);
