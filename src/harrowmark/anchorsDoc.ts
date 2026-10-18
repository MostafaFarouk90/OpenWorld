import { renderAnchorsDoc } from '../region/anchorsDoc';
import { HARROWMARK_LAYOUT } from './harrowmark.layout';

/** `src/harrowmark/ANCHORS.md` must equal this (see anchorsDoc.test.ts). Threads 3a, 6, 12, 17b, 18 and 19 build against these ids. */
export const harrowmarkAnchorsDoc = (): string =>
  renderAnchorsDoc(HARROWMARK_LAYOUT, { title: 'Harrowmark anchors, triggers and structures', source: 'harrowmark.layout.ts' });
