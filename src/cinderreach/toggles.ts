// The flag-driven pieces: which flag shows which toggled structure. Specs are validated on their own (flat footprint, known
// kind) but are not in the layout (see toggleStructure.ts).
import type { StructureSpec } from '../region/layoutTypes';
import { CINDERFORD_CLEANSED_FLAG, CINDERFORD_SEALED_FLAG, DEN_SPARED_FLAG } from './flags';
import { WELL } from './cinderford';
import { open, solid } from './helpers';
import { DEN_SHELF } from './sites';
import { FORT_GATE } from './scorchhold';

export interface ToggleDef {
  id: string;
  spec: StructureSpec;
  /** The derived flag the toggle reads, and whether the structure shows while it is set (`show: true`) or while it is clear. */
  flag: string;
  show: boolean;
}

export const CINDERREACH_TOGGLES: readonly ToggleDef[] = [
  // R06 sealed: the well is boarded (the waystone still works).
  { id: 'boarded-well', spec: solid('cinderreach-cinderford-boards', 'cinder-boarded-well', WELL.x, WELL.z, 4, 4), flag: CINDERFORD_SEALED_FLAG, show: true },
  // R06 cleansed: the blight stain round the well is gone.
  { id: 'well-blight', spec: open('cinderreach-cinderford-blight', 'cinder-blightbloom', WELL.x, WELL.z, 8, 8), flag: CINDERFORD_CLEANSED_FLAG, show: false },
  // R11 spared: a marker stone shows the resting wyrm's den (A12 spawns the wyrm).
  { id: 'den-marker', spec: open('cinderreach-den-marker', 'cinder-marker', DEN_SHELF.x, DEN_SHELF.z + 6, 4, 4), flag: DEN_SPARED_FLAG, show: true },
  // D03: the fort gate stands shut until the three charges are set (A12 writes the flag).
  { id: 'fort-gate', spec: solid('cinderreach-scorchhold-gate-shut', 'cinder-fort-gate', FORT_GATE.x, FORT_GATE.z, FORT_GATE.w, FORT_GATE.d), flag: 'story.d03.gateDown', show: false },
];
