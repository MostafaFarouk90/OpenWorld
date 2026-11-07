// Act 5 thread N1 PR 1 (plans/act5-N1.md section 5; design 7.5, ruling Q10): the Rim Beacon, a one-way link from the
// Last Anvil's stone to the Rim Camp. Offered from `story.gate.a5` once M47's winch has opened the Rim Gate, only if the Last Anvil was restored in Act 3
// (`world.last-anvil.rimBeacon`); both read live, so a load re-derives it. Using it runs the waystones' own safe
// teleport to the Rim Camp's stone (ground + 0.05), refused whenever fast travel is (combat, a cutscene, the siege's
// movement mode). It never lights the Rim Camp's stone, and nothing at the Rim Camp leads back by it.
import { ACT5_GATE_FLAG, RIM_GATE_OPEN_FLAG } from '../region/act5Regions';
import { LAST_ANVIL } from '../shrine/act3/tuning';

export const RIM_BEACON_FLAG = LAST_ANVIL.rimBeaconFlag;
export const RIM_BEACON_INTERACTABLE = 'beacon:rim';
/** Beside the Last Anvil's stone (its anchor), so the two prompts never share a spot. */
export const RIM_BEACON_SOURCE_ANCHOR = LAST_ANVIL.waystoneAnchor;
export const RIM_BEACON_OFFSET = { x: 1.6, z: 0 } as const;
export const RIM_BEACON_TARGET_ANCHOR = 'waystone.rim-camp';
/** Above the ground the target stands (the safe teleport's rule). */
export const RIM_BEACON_LIFT = 0.05;

export const RIM_BEACON_STRINGS_EN: Record<string, string> = {
  'caldera.beacon.prompt': 'Follow the Rim Beacon',
  'caldera.beacon.refused': 'The beacon will not carry you now.',
  'caldera.beacon.noTarget': 'The beacon finds no fire on the rim.',
};

export interface RimBeaconPorts {
  flag(key: string): boolean;
  /** Why fast travel is refused right now (the waystones' reason or the movement mode's), or null. */
  blocked(): string | null;
  target(): { x: number; y: number; z: number; yaw: number } | null;
  heightAt(x: number, z: number): number;
  teleport(feet: { x: number; y: number; z: number }, yaw: number): Promise<{ ok: boolean }>;
  toast(key: string): void;
}

export class RimBeacon {
  private busy = false;
  constructor(private readonly p: RimBeaconPorts) {}

  /** The beacon is offered: Act 5 open, the Rim Gate's winch turned (M47 is never skipped) and the Last Anvil restored. */
  offered(): boolean {
    return this.p.flag(ACT5_GATE_FLAG) && this.p.flag(RIM_GATE_OPEN_FLAG) && this.p.flag(RIM_BEACON_FLAG);
  }

  async use(): Promise<'travelled' | 'not-offered' | 'refused' | 'no-target' | 'failed' | 'busy'> {
    if (!this.offered()) return 'not-offered';
    if (this.busy) return 'busy';
    if (this.p.blocked() !== null) {
      this.p.toast('caldera.beacon.refused');
      return 'refused';
    }
    const t = this.p.target();
    if (!t) {
      this.p.toast('caldera.beacon.noTarget');
      return 'no-target';
    }
    this.busy = true;
    try {
      const r = await this.p.teleport({ x: t.x, y: this.p.heightAt(t.x, t.z) + RIM_BEACON_LIFT, z: t.z }, t.yaw);
      return r.ok ? 'travelled' : 'failed';
    } finally {
      this.busy = false;
    }
  }
}
