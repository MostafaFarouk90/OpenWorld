// The occupied city (L2; plans/act4-L2.md section 6, Q2): from story.m38.complete Harrowmark is Vey's. The working gates'
// shutters close through gate.ts's `closedWhen` (harrowmark.plugin.ts); this file places L0's fog faces outside them and
// sets the city's kill XP factor. The faces' rules (open condition, toast) are L0's (region/act4Fog.ts).
import { cityGateFaceDef } from '../../region/act4Fog';
import type { FogWallDef } from '../../region/fogWall';
import { gateBearing, GATE_NAMES, type GateName } from '../city';
import { A4_FLAG, GATE_FACE_HALF_LENGTH, GATE_FACE_PUSH_DEPTH, WORKING_GATES } from './sites';

/** Q1: kill XP in Harrowmark pays x 2.4 from Act 4's start (L0's `when`), so Act 1 kills there pay as shipped. */
export const HARROWMARK_ACT4_XP_FACTOR = 2.4;
export const HARROWMARK_XP_WHEN = { all: [A4_FLAG] } as const;

/** Faces are drawn only near their gate (the veil is 120 m wide; the city is seen from far off). */
export const GATE_FACE_CULL = 200;

/**
 * A working gate's face: an axis-aligned wall on the gate's dominant axis (L0's fog wall pushes on x or z only), blocking
 * the city side, so a player who reaches it from outside is held and one pushed from inside lands outside (never
 * stranded). halfLength 10 and pushDepth 20 keep the push clear of L1's wall track about 45 m out.
 */
export function gateFacePlacement(gate: GateName): Pick<FogWallDef, 'axis' | 'halfLength' | 'blockedSide' | 'pushDepth' | 'cullBeyond'> {
  const b = (gateBearing(GATE_NAMES.indexOf(gate)) * Math.PI) / 180;
  const out = { x: Math.sin(b), z: Math.cos(b) }; // compass bearing: 0 = +Z, 90 = +X
  const axis: 'x' | 'z' = Math.abs(out.x) >= Math.abs(out.z) ? 'x' : 'z';
  const d = axis === 'x' ? out.x : out.z;
  return { axis, halfLength: GATE_FACE_HALF_LENGTH, blockedSide: d > 0 ? -1 : 1, pushDepth: GATE_FACE_PUSH_DEPTH, cullBeyond: GATE_FACE_CULL };
}

export function gateFaceDefs(): FogWallDef[] {
  return WORKING_GATES.map((g) => cityGateFaceDef(g, gateFacePlacement(g)));
}
