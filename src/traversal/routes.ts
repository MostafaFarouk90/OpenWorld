// K7's dive routes for the shipped 40 m lint (src/water/routes.ts): the M24 pool.
import { m24Route, M24_POOL } from './sites';
import type { DiveRouteStandsDef } from './dive/types';

export const M24_DIVE_ROUTES: readonly DiveRouteStandsDef[] = [m24Route(M24_POOL)];
