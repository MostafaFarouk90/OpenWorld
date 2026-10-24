// The Dragonspine layout (lower slopes) as the shipped constant: K1's exports on the real ground. The builders live in layout.ts.
import { DRAGONSPINE_DOC, dragonspineBuild } from './layout';
import type { LayoutData } from '../region/layoutTypes';

export { DRAGONSPINE_DOC };
export const DRAGONSPINE_LAYOUT: LayoutData = dragonspineBuild().layout;
