// `?act5=<quest>&new` (dev and smoke only, contracts v0.9 item 16): jumps a fresh game into Act 5 before any fixture exists
// (N12 PR 1 owns the deterministic `act5-*.json` fixtures on this plumbing). Acts 1 to 4 are replayed through the shipped
// `?act4=` runner (to M46 and D08 complete) with every ending card and camp marked seen, so no card plays over the player.
// Then `story.gate.a5` is set, the Act 5 prerequisites are injected the Act 4 way, `story.m47.rimGateOpen` is set for any
// target after M47, `story.phase.foundryOpen` for Phase J targets (until N12 PR 2 retires that hold), and the player's XP
// is topped up to ACT5_START_XP. `&favour=marshal|keepers` loads the design's two worked playthroughs (design 3): the live
// tracks, their choice flags and, from the quest that takes each, the favour snapshots. The player lands 1.8 m in front of
// the giver when the giver has an Act 5 post, else at Rimfoot (M47) or the Rim Camp placeholder.
import { Act4Jump, ACT4_GIVER_STAND_OFF, QUIET_TICKS, act4EndingSeenFlags, type Act4JumpPorts, type Act4Pose } from './act4Jump';
import { registerActJump } from './actJump';
import { ACT2_JUMP_CLASSES } from './act2Jump';
import { ACT5_GATE_FLAG, FOUNDRY_OPEN_FLAG, RIM_CAMP_POINT, RIMFOOT_POINT, RIM_GATE_OPEN_FLAG } from '../region/act5Regions';
import { ACT5_PHASE_I, ACT5_PHASE_J } from './lint/act5Ids';
import { FAVOUR_TRACKS, snapshotFlag, type FavourTrack } from '../state/favour';

export { ACT5_PHASE_I, ACT5_PHASE_J };
export const ACT5_JUMP_IDS: readonly string[] = [...ACT5_PHASE_I, ...ACT5_PHASE_J];

/** Plan 2.3, direct prerequisites inside Act 5 (`story.gate.a5` opens M47). M54 waits for D09 and R27 only (Q12). */
export const ACT5_DIRECT: Readonly<Record<string, readonly string[]>> = {
  m47: [], m48: ['m47'], m49: ['m48'], r26: ['m49'], r29: ['m49'], m50: ['m49'], m51: ['m49'],
  m52: ['m47', 'm48', 'm49', 'm50', 'm51', 'r26'],
  r27: ['m52'], r28: ['m52'], r30: ['m52'], m53: ['m52'],
  d09: ['m53'], m54: ['d09', 'r27'], m55: ['m54'], d10: ['m55'], m56: ['d10'],
};

function closure(id: string, out = new Set<string>()): Set<string> {
  for (const d of ACT5_DIRECT[id] ?? []) {
    if (out.has(d)) continue;
    out.add(d);
    closure(d, out);
  }
  return out;
}

/** `ACT5_PREREQS[id]`: the Act 5 quests done before `id`, in play order. Acts 1 to 4 are not listed (always replayed). */
export const ACT5_PREREQS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  ACT5_JUMP_IDS.map((id) => {
    const own = closure(id);
    return [id, ACT5_JUMP_IDS.filter((q) => own.has(q))];
  }),
);
registerActJump(5, { prereqs: ACT5_PREREQS });

export type Act5Phase = 'I' | 'J';
export function act5PhaseOf(id: string): Act5Phase | undefined {
  if (ACT5_PHASE_I.includes(id)) return 'I';
  if (ACT5_PHASE_J.includes(id)) return 'J';
  return undefined;
}

/** Plan 2.1 and 2.2 givers (NPC ids; the quest threads place them). A giver not placed yet lands at the placeholder. */
export const ACT5_GIVERS: Readonly<Record<string, string>> = {
  m47: 'alric', m48: 'alric', m49: 'hrolf', r26: 'merrin', r29: 'ansgar', m50: 'alric', m51: 'ysmeryth', m52: 'wystan',
  r27: 'wenna', r28: 'wulfhild', r30: 'tobb', m53: 'edric', d09: 'alric', m54: 'alric', m55: 'ulthred', d10: 'alric', m56: 'alric',
};

/**
 * Plan 7.2: Act 5 starts at about 105,000 XP (full play, level 33). A PLACEHOLDER until L13's Phase H playthrough report
 * (plans/act4-phase-h-playthrough.md) gives the measured end-of-Act-4 figure; N12 PR 1 replaces it with that number.
 */
export const ACT5_START_XP = 105_000;
export const ACT5_GIVER_STAND_OFF = ACT4_GIVER_STAND_OFF;
/** Anchor prefixes that count as an Act 5 post (a giver still at an Act 4 post lands at the placeholder instead). */
export const ACT5_POST_PREFIXES: readonly string[] = ['caldera.'];

// ---- &favour=marshal|keepers (design 3, the two worked playthroughs) ----

export type Act5FavourPreset = 'marshal' | 'keepers';
export const ACT5_FAVOUR_PRESETS: readonly Act5FavourPreset[] = ['marshal', 'keepers'];
type Five = readonly [number, number, number, number, number];

/**
 * The design's tables, in track order halvard / oswin / grisel / dragons / ashwalkers. M52: the siege snapshot at M52's
 * start. D09: taken at the Foundry door before D09's choice, so it equals M52's (no favour row lies between). M56: the
 * final favour, read at M56's start (the epilogue).
 */
export const ACT5_PRESET_FAVOUR: Readonly<Record<Act5FavourPreset, { m52: Five; d09: Five; m56: Five }>> = {
  marshal: { m52: [71, 20, 25, 10, 19], d09: [71, 20, 25, 10, 19], m56: [75, 18, 25, 10, 21] },
  keepers: { m52: [21, 52, 34, 51, 53], d09: [21, 52, 34, 51, 53], m56: [17, 56, 34, 51, 61] },
};

/** The worked playthroughs' choice flags the Act 5 readers use (F1 M21, F2 M31, F3 the M36 delegates, F8 R24). */
export const ACT5_PRESET_FLAGS: Readonly<Record<Act5FavourPreset, Readonly<Record<string, string>>>> = {
  marshal: {
    'story.m21.choice': 'confront',
    'story.m31.choice': 'won',
    'story.m36.delegate.halvard': 'won',
    'story.m36.delegate.oswin': 'won',
    'story.m36.delegate.grisel': 'lost',
    'story.r24.choice': 'half',
  },
  keepers: {
    'story.m21.choice': 'spy',
    'story.m31.choice': 'yielded',
    'story.m36.delegate.halvard': 'lost',
    'story.m36.delegate.oswin': 'won',
    'story.m36.delegate.grisel': 'won',
    'story.r24.choice': 'all',
  },
};

/** The snapshot each target carries: a snapshot is written for its own quest and every quest after it. */
const SNAPSHOT_FROM: Readonly<Record<'m52' | 'd09' | 'm56', string>> = { m52: 'm52', d09: 'd09', m56: 'm56' };

/** The snapshots a jump to `id` writes (in order), from ACT5_JUMP_IDS order. */
export function presetSnapshots(id: string): ('m52' | 'd09' | 'm56')[] {
  const at = ACT5_JUMP_IDS.indexOf(id);
  if (at < 0) return [];
  return (Object.keys(SNAPSHOT_FROM) as ('m52' | 'd09' | 'm56')[]).filter((s) => {
    const q = SNAPSHOT_FROM[s];
    // A snapshot is taken at its quest's start, so a jump to that quest carries it, as does any target after it in the
    // prerequisite chain (R27, R28 and R30 come after M52 but not after D09).
    return q === id || (ACT5_PREREQS[id] ?? []).includes(q);
  });
}

/** The live favour a preset sets for `id`: the latest snapshot it carries, else M52's numbers (Phase I before the siege). */
export function presetLiveFavour(preset: Act5FavourPreset, id: string): Record<FavourTrack, number> {
  const snaps = presetSnapshots(id);
  const t = ACT5_PRESET_FAVOUR[preset];
  // After D09 (its choice made), the live tracks are the final favour.
  const five = (ACT5_PREREQS[id] ?? []).includes('d09') ? t.m56 : snaps.length ? t[snaps[snaps.length - 1]] : t.m52;
  return Object.fromEntries(FAVOUR_TRACKS.map((tr, i) => [tr, five[i]])) as Record<FavourTrack, number>;
}

export function parseAct5(search: string): { id: string; classId: string; favour: Act5FavourPreset | null; fresh: true } | { error: string } | null {
  const params = new URLSearchParams(search);
  const raw = params.get('act5');
  if (raw === null) return null;
  if (!ACT5_JUMP_IDS.includes(raw)) return { error: `unknown quest "${raw}" (one of ${ACT5_JUMP_IDS.join(', ')})` };
  if (!params.has('new')) return { error: 'needs &new so the jump never runs over a real save' };
  const classId = params.get('class') ?? 'knight';
  if (!(ACT2_JUMP_CLASSES as readonly string[]).includes(classId)) return { error: `unknown class "${classId}"` };
  const f = params.get('favour');
  if (f !== null && !(ACT5_FAVOUR_PRESETS as readonly string[]).includes(f)) return { error: `unknown favour preset "${f}" (marshal or keepers)` };
  return { id: raw, classId, favour: (f as Act5FavourPreset | null) ?? null, fresh: true };
}

export interface Act5JumpPorts extends Act4JumpPorts {
  /** Sets a live favour track to `value` (0..100). */
  setFavourTo?(track: FavourTrack, value: number): void;
  /** Sets a flag to a value (the choice flags and the snapshot numbers). */
  setFlagValue?(flag: string, value: string | number | boolean): void;
}

/** The landing for `id`: in front of the giver at the stand-off, facing them; else Rimfoot (M47) or the Rim Camp. */
export function act5Landing(id: string, pose: Act4Pose | undefined): { at: { x: number; z: number; y?: number }; yaw: number; giver: boolean } {
  if (pose) {
    const fx = -Math.sin(pose.yaw);
    const fz = -Math.cos(pose.yaw);
    return { at: { x: pose.x + fx * ACT5_GIVER_STAND_OFF, y: pose.y, z: pose.z + fz * ACT5_GIVER_STAND_OFF }, yaw: pose.yaw + Math.PI, giver: true };
  }
  const p = id === 'm47' ? RIMFOOT_POINT : RIM_CAMP_POINT;
  // Yaw 0 faces -Z; the bowl lies north (+Z) of both points, so face it.
  return { at: { x: p.x, z: p.z }, yaw: Math.PI, giver: false };
}

export type Act5JumpPhase = 'replay' | 'act4-end' | 'act5' | 'quiet' | 'place' | 'done';

/** Ticked once per rules step until `done`. */
export class Act5Jump {
  phase: Act5JumpPhase = 'replay';
  private readonly inner: Act4Jump;
  private quietTicks = 0;

  constructor(
    readonly id: string,
    private readonly ports: Act5JumpPorts,
    readonly classId = 'knight',
    readonly favour: Act5FavourPreset | null = null,
  ) {
    // The Act 4 runner to M46 does Acts 1 to 4 except M46 itself; its own placement is skipped.
    this.inner = new Act4Jump('m46', { ...ports, placePose: () => true }, classId);
  }

  get finished(): boolean {
    return this.phase === 'done';
  }

  /** On a game already carried through the whole of Act 4 (N12's fixtures' base save): only the Act 5 steps run. */
  fromCarriedSave(): this {
    this.phase = 'act5';
    return this;
  }

  tick(): void {
    if (this.finished) return;
    const p = this.ports;
    if (this.phase === 'replay') {
      this.inner.tick();
      if (!this.inner.finished) return;
      this.phase = 'act4-end';
    }
    if (this.phase === 'act4-end') {
      // Both Act 4 seen flags before M46 completes, so the ending card and the camp never play over the player.
      for (const f of act4EndingSeenFlags()) p.setFlag(f, true);
      // The inner runner injected ACT4_PREREQS.m46 (D08 among them); M46 itself is the Act 4 ending's last quest.
      this.inject('m46', 'act4');
      p.setFlag(ACT5_GATE_FLAG, true);
      this.phase = 'act5';
    }
    if (this.phase === 'act5') {
      if (ACT5_JUMP_IDS.indexOf(this.id) > 0) p.setFlag(RIM_GATE_OPEN_FLAG, true);
      if (act5PhaseOf(this.id) === 'J') p.setFlag(FOUNDRY_OPEN_FLAG, true);
      for (const q of ACT5_PREREQS[this.id] ?? []) this.inject(q, 'act5');
      if (this.favour) this.applyPreset(this.favour);
      p.topUpXp?.(ACT5_START_XP);
      this.phase = 'quiet';
    }
    if (this.phase === 'quiet') {
      if (p.closeDialogue?.()) this.quietTicks = 0;
      else if (++this.quietTicks >= QUIET_TICKS) {
        p.quiet?.(false);
        this.phase = 'place';
      }
      return;
    }
    if (this.phase === 'place') {
      const land = act5Landing(this.id, p.giverPose?.(ACT5_GIVERS[this.id]));
      if (p.placePose(land.at, land.yaw)) this.phase = 'done';
    }
  }

  private applyPreset(preset: Act5FavourPreset): void {
    const p = this.ports;
    if (!p.setFlagValue || !p.setFavourTo) {
      p.warn(`act5: the favour preset "${preset}" needs the flag and favour ports; skipped`);
      return;
    }
    for (const [k, v] of Object.entries(ACT5_PRESET_FLAGS[preset])) p.setFlagValue(k, v);
    const live = presetLiveFavour(preset, this.id);
    for (const t of FAVOUR_TRACKS) p.setFavourTo(t, live[t]);
    for (const s of presetSnapshots(this.id)) {
      const five = ACT5_PRESET_FAVOUR[preset][s];
      FAVOUR_TRACKS.forEach((t, i) => p.setFlagValue!(snapshotFlag(s, t), five[i]));
      p.setFlagValue(snapshotFlag(s, 'taken'), true);
    }
  }

  private inject(q: string, tag: string): void {
    const p = this.ports;
    if (p.hasQuest(q)) {
      if (p.quests.state(q) === 'inactive') p.quests.start(q);
      if (p.quests.state(q) !== 'completed' && !p.quests.complete(q)) p.warn(`${tag}: could not complete ${q}`);
    }
    p.setFlag(`story.${q}.complete`, true);
  }
}
