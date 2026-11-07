// Act 5 fog faces (contracts v0.9 item 3, plan Part 3.2): the four Caldera rim faces placed in Act 4 (act4/act4World.ts)
// take Act 5 rules here: the south face is the Rim Gate, opening on `story.gate.a5` plus M47's winch; the other three
// never open and, from the gate, say where the way in is. The Inner Gate's face stands on N1's anchor `caldera.fog.inner`
// (`innerGateFaceDef`); the round hole `hole.caldera.floor` does the holding, the face is what the player sees and bumps.
import type { FlagCondition } from '../core/flagCondition';
import type { FogWallDef } from './fogWall';
import { ACT5_GATE_FLAG, RIM_GATE_OPEN_FLAG } from './act5Regions';
import { INNER_GATE_OPEN_WHEN, ACT5_CONTAINMENT_STRINGS_EN } from './act5Containment';

const NEVER: FlagCondition = { any: ['region.never'] };

export const FOG_TOAST_RIM_GATE_BARRED = 'region.fog.rimGate.barred';
export const FOG_TOAST_CALDERA_RIM_SHEER = 'region.fog.calderaRim.sheer';
export const FOG_TOAST_INNER_GATE = 'region.fog.innerGate';

/** Invented text (logged under "Act 5 N0" in design/changes-applied.md). */
export const ACT5_FOG_STRINGS_EN: Record<string, string> = {
  [FOG_TOAST_RIM_GATE_BARRED]: 'The Rim Gate is barred from within. The winch is on the gatehouse stair.',
  [FOG_TOAST_CALDERA_RIM_SHEER]: 'The rim is sheer here. The way in is the Rim Gate above Rimfoot.',
  [FOG_TOAST_INNER_GATE]: "Vey's household holds the Inner Gate.",
  ...ACT5_CONTAINMENT_STRINGS_EN,
};

/** The Rim Gate opens once Act 5 is open and M47's winch has turned. */
export const RIM_GATE_OPEN_WHEN: FlagCondition = { all: [ACT5_GATE_FLAG, RIM_GATE_OPEN_FLAG] };

const FROM_GATE = { all: [ACT5_GATE_FLAG] } as const;

/** The rules the four Act 4 rim faces take from Act 5 (act4Fog.ts spreads them in; Act 4's own toast stays the default). */
export const ACT5_RIM_FACE_RULES = {
  'fog.caldera-rim.s': { openWhen: RIM_GATE_OPEN_WHEN, toastWhen: [{ when: FROM_GATE, key: FOG_TOAST_RIM_GATE_BARRED }] },
  'fog.caldera-rim.n': { openWhen: NEVER, toastWhen: [{ when: FROM_GATE, key: FOG_TOAST_CALDERA_RIM_SHEER }] },
  'fog.caldera-rim.e': { openWhen: NEVER, toastWhen: [{ when: FROM_GATE, key: FOG_TOAST_CALDERA_RIM_SHEER }] },
  'fog.caldera-rim.w': { openWhen: NEVER, toastWhen: [{ when: FROM_GATE, key: FOG_TOAST_CALDERA_RIM_SHEER }] },
} as const satisfies Record<string, Pick<FogWallDef, 'openWhen' | 'toastWhen'>>;

export const INNER_GATE_FACE_ID = 'fog.caldera.inner';
export const INNER_GATE_ANCHOR = 'caldera.fog.inner';

/** The Inner Gate's rules; N1 adds its placement on `caldera.fog.inner` and registers it with the shipped builder. */
export const INNER_GATE_FACE: Pick<FogWallDef, 'id' | 'anchorId' | 'openWhen' | 'toastKey'> = {
  id: INNER_GATE_FACE_ID,
  anchorId: INNER_GATE_ANCHOR,
  openWhen: INNER_GATE_OPEN_WHEN,
  toastKey: FOG_TOAST_INNER_GATE,
};

/** N1: the Inner Gate's full face from its rules and its placement. */
export function innerGateFaceDef(placement: Pick<FogWallDef, 'axis' | 'halfLength' | 'blockedSide'> & Partial<Pick<FogWallDef, 'pushBackTo' | 'cullBeyond' | 'pushDepth'>>): FogWallDef {
  return { ...INNER_GATE_FACE, pushBackTo: 1, ...placement };
}
