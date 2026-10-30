// Act 3 fog faces (contracts v0.7 item 3, plan Part 3.4): the open conditions and toasts of the two shipped faces that
// Act 3 opens, and the four new faces as ids, conditions and toasts. K1 gives the new faces their anchors and lengths and
// registers them (a face that is not registered is inert: no wall, no trigger, no toast). Toast texts are invented
// (logged in CHANGES-v0.7 and design/changes-applied.md).
import type { FlagCondition } from '../core/flagCondition';
import { SUMMIT_OPEN_WHEN } from './act3Containment';
import type { FogWallDef } from './fogWall';
import { REGION_INFO } from './regions';

const NEVER: FlagCondition = { any: ['region.never'] };

export const FOG_TOAST_GREYFEN_GATE = 'region.fog.greyfen.toast';
export const FOG_TOAST_DRAGONSPINE_GATE = 'region.fog.dragonspine.toast';
export const FOG_TOAST_DRAGONSPINE_PHASE_E = 'region.fog.dragonspine.phaseE.toast';
export const FOG_TOAST_SUMMIT = 'region.fog.summit.toast';
/** The shipped never-open text (Act 2's `region.fog.shut.toast`), kept for the Waste faces. */
export const FOG_TOAST_SHUT_KEY = 'region.fog.shut.toast';

export const ACT3_FOG_STRINGS_EN: Record<string, string> = {
  [FOG_TOAST_GREYFEN_GATE]: 'Fen mist rolls down the north road. Harrowmark still needs you before you follow the dragons.',
  [FOG_TOAST_DRAGONSPINE_GATE]: 'Snow and ash choke the track to the peaks. Harrowmark still needs you before you follow the dragons.',
  [FOG_TOAST_DRAGONSPINE_PHASE_E]: 'Snow and ash choke the track to the peaks. The way will clear in a later update.',
  [FOG_TOAST_SUMMIT]: "Ysmeryth's roost is above the cloud. Finish what the fen and the lodge ask of you first.",
};

/** Phase E: Act 3 is open but the Dragonspine hold still stands. */
const PHASE_E_TOASTS: FogWallDef['toastWhen'] = [{ when: { all: ['story.gate.a3'] }, key: FOG_TOAST_DRAGONSPINE_PHASE_E }];

/** The fields Act 3 sets on the shipped `fog.greyfen` and `fog.dragonspine` faces (act2World.ts spreads them in). */
export const ACT3_SHIPPED_FACE_RULES: Readonly<Record<'fog.greyfen' | 'fog.dragonspine', Pick<FogWallDef, 'openWhen' | 'toastKey' | 'toastWhen'>>> = {
  'fog.greyfen': { openWhen: REGION_INFO.greyfen.openWhen, toastKey: FOG_TOAST_GREYFEN_GATE },
  'fog.dragonspine': { openWhen: REGION_INFO.dragonspine.openWhen, toastKey: FOG_TOAST_DRAGONSPINE_GATE, toastWhen: PHASE_E_TOASTS },
};

export type Act3FogFaceId = 'fog.spine-road' | 'fog.summit' | 'fog.wyrmwatch-waste' | 'fog.fen-waste';

/** A face's rules without its placement (K1 adds `anchorId`, `axis`, `halfLength`, `blockedSide`). */
export type Act3FogFace = Pick<FogWallDef, 'openWhen' | 'toastKey' | 'toastWhen'> & { id: Act3FogFaceId };

export const ACT3_FOG_FACES: readonly Act3FogFace[] = [
  { id: 'fog.spine-road', openWhen: REGION_INFO.dragonspine.openWhen, toastKey: FOG_TOAST_DRAGONSPINE_GATE, toastWhen: PHASE_E_TOASTS },
  { id: 'fog.summit', openWhen: SUMMIT_OPEN_WHEN, toastKey: FOG_TOAST_SUMMIT },
  { id: 'fog.wyrmwatch-waste', openWhen: NEVER, toastKey: FOG_TOAST_SHUT_KEY },
  { id: 'fog.fen-waste', openWhen: NEVER, toastKey: FOG_TOAST_SHUT_KEY },
];

/** A face's rules by id (K1 builds `FogWallDef`s as `{ ...act3FogFace(id), anchorId, axis, halfLength, blockedSide }`). */
export function act3FogFace(id: Act3FogFaceId): Act3FogFace {
  const f = ACT3_FOG_FACES.find((x) => x.id === id);
  if (!f) throw new Error(`act3Fog: unknown face "${id}"`);
  return f;
}
