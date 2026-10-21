import type { GateState } from './gate';

/** Published as the 'harrowmark' service. */
export interface HarrowmarkService {
  southGate: {
    state(): GateState;
    /** Forces a state (thread 21's story gate); `null` returns to the flags. */
    override(state: GateState | null): void;
  };
  /** The River Gate's shutter: open once Act 1 is done (`story.gate.a2`). */
  riverGate: { open(): boolean };
  /** Merged draw calls of the static city greybox. */
  drawCalls(): number;
  /** The asset swap's instanced model tier: meshes built, chunks and meshes in the shown chunks, triangles of the shown chunks. Zeros until the models load or when they cannot. */
  modelBatches?(): { built: number; chunks: number; shownChunks: number; shownMeshes: number; shownTriangles: number };
  /** The mini-ending's built counts. */
  worldChange(): { active: boolean; banners: number; braziers: number };
}

declare module '../core/Services' {
  interface GameServices {
    /** Provided by the harrowmark plugin (thread 17). */
    harrowmark: HarrowmarkService;
  }
}
