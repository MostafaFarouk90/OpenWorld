import { renderAnchorsDoc } from '../region/anchorsDoc';
import { OLDSMOKE_DOC, OLDSMOKE_LAYOUT } from './oldsmoke.layout';

/** `src/oldsmoke/ANCHORS.md` must equal this (see anchorsDoc.test.ts). A13, A9, A2 and A6b build against these ids. */
export const oldsmokeAnchorsDoc = (): string => renderAnchorsDoc(OLDSMOKE_LAYOUT, OLDSMOKE_DOC);
