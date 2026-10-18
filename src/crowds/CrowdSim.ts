// The crowd simulation: walkers on lane samples and idle group members, with soft player avoidance and story density.
// Plain records in preallocated pools: no actors, colliders or interactables, and no allocation per frame.
import { mulberry32 } from '../enemies/ai/moveSelect';
import type { ResolvedCluster } from './clusters';
import { clusterOn, laneRange, laneTarget, type Density } from './density';
import { clampToFree, lanePoint, sampleIndex, type Lane } from './lanes';
import { CROWD_TUNING, LANE_WALKERS, QUEUE_LANES } from './tuning';

export interface Walker {
  active: boolean;
  lane: number;
  /** +1 walks with the lane's point order, -1 against it. */
  dir: 1 | -1;
  s: number;
  /** Lateral offset along the lane's right normal; a walker keeps to its own right (sign = dir). */
  l: number;
  slot: number;
  speed: number;
  pause: number;
  stuck: number;
  /** Game time at which a surplus walker vanishes; -1 when staying. */
  leaveAt: number;
  phase: number;
  freq: number;
  colour: number;
  walking: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface IdleMember {
  active: boolean;
  cluster: number;
  homeX: number;
  homeZ: number;
  ox: number;
  oz: number;
  colour: number;
  phase: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface PlayerPos {
  x: number;
  y: number;
  z: number;
}

export interface CrowdSimOptions {
  lanes: Lane[];
  clusters: ResolvedCluster[];
  seed?: number;
  /** Walkers per lane name at full density (defaults to LANE_WALKERS). */
  laneWalkers?: Record<string, number>;
}

const FULL: Density = { scale: 1, guarded: false, lod0Range: CROWD_TUNING.lod0Range };

export class CrowdSim {
  readonly walkers: Walker[];
  readonly idle: IdleMember[];
  readonly lanes: Lane[];
  readonly clusters: ResolvedCluster[];
  /** Pool growths after construction (pinned at 0 by the allocation test). */
  allocations = 0;
  /** Player proximity tests in the last update (one per live figure). */
  checks = 0;
  /** Record visits since construction, a deterministic work count: the budget test pins that it grows linearly. */
  ops = 0;
  private density: Density = FULL;
  private freeHint = 0;
  private time = 0;
  private rng: () => number;
  private readonly seed: number;
  private readonly base: number[];
  private readonly ranges: Array<[number, number] | null>;
  private readonly targets: Int32Array;
  private readonly counts: Int32Array;
  private readonly clusterShown: boolean[];
  private readonly clusterLeaveAt: number[];
  private readonly p = { x: 0, y: 0, z: 0 };
  private readonly bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };

  constructor(opts: CrowdSimOptions) {
    this.lanes = opts.lanes;
    this.clusters = opts.clusters;
    this.seed = opts.seed ?? 0x17b;
    this.rng = mulberry32(this.seed);
    const per = opts.laneWalkers ?? LANE_WALKERS;
    // A lane that clips a building carries no walkers (the content test names it; thread 17 owns the fix).
    this.base = this.lanes.map((l) => (l.blocked.length ? 0 : per[l.name] ?? 0));
    const cap = this.base.reduce((a, b) => a + b, 0);
    this.walkers = Array.from({ length: cap }, () => blankWalker());
    this.idle = [];
    this.clusters.forEach((c, ci) =>
      c.spots.forEach((s) => this.idle.push({ active: false, cluster: ci, homeX: s.x, homeZ: s.z, ox: 0, oz: 0, colour: 0, phase: 0, x: s.x, y: s.y, z: s.z, yaw: s.yaw })),
    );
    this.ranges = this.lanes.map(() => null);
    this.targets = new Int32Array(this.lanes.length);
    this.counts = new Int32Array(this.lanes.length);
    this.clusterShown = this.clusters.map(() => false);
    this.clusterLeaveAt = this.clusters.map(() => -1);
    for (const l of this.lanes) for (const s of l.samples) this.grow(s.x, s.z);
    for (const c of this.clusters) this.grow(c.cx, c.cz);
    this.setDensity(FULL);
  }

  get capacity(): number {
    return this.walkers.length;
  }

  get currentDensity(): Density {
    return this.density;
  }

  setDensity(d: Density): void {
    this.density = d;
    for (let i = 0; i < this.lanes.length; i++) {
      const lane = this.lanes[i];
      this.ranges[i] = this.base[i] > 0 ? laneRange(lane.name, lane.length, d) : null;
      this.targets[i] = Math.min(this.base[i], laneTarget(this.base[i], lane.length, this.ranges[i], d));
    }
  }

  /** True when the player is far enough from every lane and group that the crowd can sleep. */
  farFrom(player: PlayerPos | null): boolean {
    if (!player) return true;
    const b = this.bounds;
    const dx = Math.max(b.minX - player.x, 0, player.x - b.maxX);
    const dz = Math.max(b.minZ - player.z, 0, player.z - b.maxZ);
    return Math.hypot(dx, dz) > CROWD_TUNING.sleepDistance;
  }

  /** Forgets every figure and repopulates from the seed (a loaded save): the same result as a fresh visit. */
  reseed(player: PlayerPos | null): void {
    this.rng = mulberry32(this.seed);
    this.time = 0;
    for (const w of this.walkers) w.active = false;
    for (const m of this.idle) m.active = false;
    this.clusterShown.fill(false);
    this.clusterLeaveAt.fill(-1);
    this.manage(player, true);
    this.clearPlayer(player);
  }

  /** After a sleep or a teleport: walkers within the no-pop radius move along their lane until they are clear. */
  clearPlayer(player: PlayerPos | null): void {
    if (!player) return;
    const r = CROWD_TUNING.noPopRadius;
    for (const w of this.walkers) {
      if (!w.active) continue;
      const lane = this.lanes[w.lane];
      let moved = 0;
      while (dist2(w.x, w.z, player) < r * r && moved < lane.length) {
        this.advance(w, lane, 5);
        moved += 5;
        this.place(w, lane);
      }
      if (dist2(w.x, w.z, player) < r * r) w.active = false;
    }
    // Groups near the player hide; `manage` shows them again once the player has moved away.
    for (let c = 0; c < this.clusters.length; c++) {
      if (this.clusterShown[c] && dist2(this.clusters[c].cx, this.clusters[c].cz, player) <= r * r) this.showCluster(c, false);
    }
  }

  update(dt: number, player: PlayerPos | null): void {
    this.time += dt;
    this.checks = 0;
    this.manage(player, false);
    for (const w of this.walkers) {
      this.ops++;
      if (w.active) this.stepWalker(w, dt, player);
    }
    for (const m of this.idle) {
      this.ops++;
      if (m.active) this.stepIdle(m, dt, player);
    }
  }

  // ------------------------------------------------------------------ population

  private manage(player: PlayerPos | null, initial: boolean): void {
    const t = CROWD_TUNING;
    const r2 = t.noPopRadius * t.noPopRadius;
    this.counts.fill(0);
    for (const w of this.walkers) {
      this.ops++;
      if (!w.active) continue;
      if (w.leaveAt >= 0 && this.time >= w.leaveAt) {
        w.active = false;
        continue;
      }
      if (w.leaveAt >= 0) continue;
      const range = this.ranges[w.lane];
      if (!range || w.s < range[0] || w.s > range[1]) {
        // Off its lane's range (the gate turned guarded): it leaves, whatever the count; it never jumps to the range.
        if (!player || dist2(w.x, w.z, player) > r2) w.active = false;
        else w.leaveAt = this.time + t.leaveGrace;
        continue;
      }
      this.counts[w.lane]++;
    }
    for (let i = 0; i < this.lanes.length; i++) {
      // Density came back within the grace: in-range leavers stay rather than vanish near the player.
      if (this.counts[i] < this.targets[i]) {
        const range = this.ranges[i];
        for (const w of this.walkers) {
          this.ops++;
          if (this.counts[i] >= this.targets[i]) break;
          if (!w.active || w.lane !== i || w.leaveAt < 0 || !range || w.s < range[0] || w.s > range[1]) continue;
          w.leaveAt = -1;
          this.counts[i]++;
        }
      }
      // An emptied lane (the chase) lets everyone go in one pass.
      if (this.targets[i] === 0 && this.counts[i] > 0) {
        for (const w of this.walkers) {
          this.ops++;
          if (!w.active || w.lane !== i || w.leaveAt >= 0) continue;
          if (!player || dist2(w.x, w.z, player) > r2) w.active = false;
          else w.leaveAt = this.time + t.leaveGrace;
        }
        this.counts[i] = 0;
      }
      // Surplus: the farthest from the player first.
      while (this.counts[i] > this.targets[i]) {
        const w = this.pickSurplus(i, player);
        if (!w) break;
        if (!player || dist2(w.x, w.z, player) > r2) w.active = false;
        else w.leaveAt = this.time + t.leaveGrace;
        this.counts[i]--;
      }
      // Missing walkers appear beyond the no-pop radius; one per lane per frame keeps a density rise from hitching.
      let spawns = initial ? this.targets[i] : 1;
      while (this.counts[i] < this.targets[i] && spawns-- > 0) {
        if (!this.spawn(i, player)) break;
        this.counts[i]++;
      }
    }
    const d = this.density;
    for (let c = 0; c < this.clusters.length; c++) {
      const want = clusterOn(this.clusters[c].spec, c, d);
      const near = !!player && dist2(this.clusters[c].cx, this.clusters[c].cz, player) <= r2;
      if (want) {
        this.clusterLeaveAt[c] = -1;
        if (!this.clusterShown[c] && !near) this.showCluster(c, true);
      } else if (this.clusterShown[c]) {
        if (!near) this.showCluster(c, false);
        else if (this.clusterLeaveAt[c] < 0) this.clusterLeaveAt[c] = this.time + t.leaveGrace;
        else if (this.time >= this.clusterLeaveAt[c]) this.showCluster(c, false);
      }
    }
  }

  /** The farthest staying walker of a lane from the player (out-of-range walkers already left in `manage`). */
  private pickSurplus(lane: number, player: PlayerPos | null): Walker | null {
    let best: Walker | null = null;
    let bestScore = -Infinity;
    for (const w of this.walkers) {
      this.ops++;
      if (!w.active || w.lane !== lane || w.leaveAt >= 0) continue;
      const score = player ? dist2(w.x, w.z, player) : 0;
      if (score > bestScore) {
        bestScore = score;
        best = w;
      }
    }
    return best;
  }

  private spawn(laneIndex: number, player: PlayerPos | null): boolean {
    const range = this.ranges[laneIndex];
    if (!range) return false;
    // Free slots are searched from where the last one was found, so a full repopulation stays linear.
    let w: Walker | null = null;
    const n = this.walkers.length;
    for (let k = 0; k < n; k++) {
      this.ops++;
      const j = (this.freeHint + k) % n;
      if (!this.walkers[j].active) {
        w = this.walkers[j];
        this.freeHint = (j + 1) % n;
        break;
      }
    }
    if (!w) return false;
    const t = CROWD_TUNING;
    const lane = this.lanes[laneIndex];
    const queue = QUEUE_LANES.has(lane.name);
    const rng = this.rng;
    for (let tries = 0; tries < 6; tries++) {
      const s = range[0] + rng() * (range[1] - range[0]);
      const dir: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const slot = t.slots[Math.floor(rng() * t.slots.length) % t.slots.length];
      const [v0, v1] = queue ? t.queueSpeed : t.walkSpeed;
      const speed = v0 + rng() * (v1 - v0);
      w.lane = laneIndex;
      w.s = s;
      w.dir = dir;
      w.slot = slot;
      w.speed = speed;
      w.pause = 0;
      w.stuck = 0;
      w.leaveAt = -1;
      w.phase = rng() * Math.PI * 2;
      w.freq = speed * 5.2;
      w.colour = Math.floor(rng() * t.palette.length) % t.palette.length;
      const free = lane.samples[sampleIndex(lane, s)].free;
      const lim = lane.halfWidth - t.laneEdgeMargin;
      w.l = clampToFree(free, dir * slot * lim);
      this.place(w, lane);
      if (!player || dist2(w.x, w.z, player) > t.noPopRadius * t.noPopRadius) {
        w.active = true;
        w.walking = true;
        return true;
      }
    }
    return false;
  }

  private showCluster(c: number, on: boolean): void {
    this.clusterShown[c] = on;
    this.clusterLeaveAt[c] = -1;
    const pal = CROWD_TUNING.palette.length;
    for (const m of this.idle) {
      this.ops++;
      if (m.cluster !== c) continue;
      m.active = on;
      if (!on) continue;
      m.ox = 0;
      m.oz = 0;
      m.x = m.homeX;
      m.z = m.homeZ;
      m.colour = Math.floor(this.rng() * pal) % pal;
      m.phase = this.rng() * Math.PI * 2;
    }
  }

  // ------------------------------------------------------------------ motion

  private stepWalker(w: Walker, dt: number, player: PlayerPos | null): void {
    const t = CROWD_TUNING;
    const a = t.avoid;
    const lane = this.lanes[w.lane];
    const k = sampleIndex(lane, w.s);
    const smp = lane.samples[k];
    const lim = lane.halfWidth - t.laneEdgeMargin;
    let target = w.dir * w.slot * lim;
    let factor = 1;
    if (player) {
      this.checks++;
      const fx = smp.tx * w.dir;
      const fz = smp.tz * w.dir;
      const px = player.x - w.x;
      const pz = player.z - w.z;
      if (Math.abs(player.y - w.y) < a.verticalGate) {
        const ahead = px * fx + pz * fz;
        const side = pz * fx - px * fz; // along the walker's on-screen right (-fz, fx)
        if (ahead > -0.5 && ahead < a.ahead && Math.abs(side) < a.side) {
          factor = ahead > -0.2 && ahead < a.stop ? 0 : a.slow;
          const playerL = w.l + (px * smp.nx + pz * smp.nz);
          target = playerL >= w.l ? playerL - a.side : playerL + a.side;
        }
      }
    }
    if (w.pause > 0) {
      w.walking = false;
      w.pause -= dt;
      if (w.pause <= 0) {
        w.pause = 0;
        w.dir = w.dir === 1 ? -1 : 1;
      }
    } else if (factor === 0) {
      w.walking = false;
      w.stuck += dt;
      if (w.stuck > a.stuckTurn) {
        w.stuck = 0;
        w.dir = w.dir === 1 ? -1 : 1;
      }
    } else {
      w.walking = true;
      w.stuck = 0;
      this.advance(w, lane, w.speed * factor * dt);
    }
    // Lateral: ease towards the target inside the free space, then clamp hard to the free space where the walker stands.
    const free = lane.samples[sampleIndex(lane, w.s)].free;
    const goal = clampToFree(free, Math.max(-lim, Math.min(lim, target)));
    const maxStep = t.lateralSpeed * dt;
    w.l += Math.max(-maxStep, Math.min(maxStep, goal - w.l));
    w.l = clampToFree(free, w.l);
    this.place(w, lane);
  }

  /** Moves a walker `ds` metres in its direction; open lanes pause and turn at the ends of the walker's range. */
  private advance(w: Walker, lane: Lane, ds: number): void {
    if (lane.loop) {
      w.s = (((w.s + w.dir * ds) % lane.length) + lane.length) % lane.length;
      return;
    }
    const range = this.ranges[w.lane];
    // A leaver outside its range walks on (inside the lane) until its grace ends; it never jumps into the range.
    const inRange = !!range && w.s >= range[0] && w.s <= range[1];
    const lo = inRange ? range![0] : 0;
    const hi = inRange ? range![1] : lane.length;
    w.s += w.dir * ds;
    const t = CROWD_TUNING;
    if (w.s >= hi || w.s <= lo) {
      w.s = Math.max(lo, Math.min(hi, w.s));
      w.pause = t.endPause[0] + this.rng() * (t.endPause[1] - t.endPause[0]);
      w.walking = false;
    }
  }

  private place(w: Walker, lane: Lane): void {
    lanePoint(lane, w.s, w.l, this.p);
    w.x = this.p.x;
    w.y = this.p.y;
    w.z = this.p.z;
    const smp = lane.samples[sampleIndex(lane, w.s)];
    w.yaw = Math.atan2(-smp.tx * w.dir, -smp.tz * w.dir);
  }

  private stepIdle(m: IdleMember, dt: number, player: PlayerPos | null): void {
    const t = CROWD_TUNING.idle;
    let tx = 0;
    let tz = 0;
    if (player) {
      this.checks++;
      const dx = m.homeX - player.x;
      const dz = m.homeZ - player.z;
      const d = Math.hypot(dx, dz);
      if (d < t.nudgeRadius && Math.abs(player.y - m.y) < CROWD_TUNING.avoid.verticalGate) {
        const push = Math.min(t.nudgeMax, t.nudgeRadius - d + 0.4);
        tx = d > 1e-6 ? (dx / d) * push : push;
        tz = d > 1e-6 ? (dz / d) * push : 0;
      }
    }
    const step = (tx || tz ? t.driftSpeed * 3 : t.driftSpeed) * dt;
    const ex = tx - m.ox;
    const ez = tz - m.oz;
    const e = Math.hypot(ex, ez);
    if (e > step) {
      m.ox += (ex / e) * step;
      m.oz += (ez / e) * step;
    } else {
      m.ox = tx;
      m.oz = tz;
    }
    m.x = m.homeX + m.ox;
    m.z = m.homeZ + m.oz;
  }

  private grow(x: number, z: number): void {
    const b = this.bounds;
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minZ = Math.min(b.minZ, z);
    b.maxZ = Math.max(b.maxZ, z);
  }
}

function dist2(x: number, z: number, p: { x: number; z: number }): number {
  const dx = x - p.x;
  const dz = z - p.z;
  return dx * dx + dz * dz;
}

function blankWalker(): Walker {
  return { active: false, lane: 0, dir: 1, s: 0, l: 0, slot: 0.6, speed: 1.2, pause: 0, stuck: 0, leaveAt: -1, phase: 0, freq: 6, colour: 0, walking: false, x: 0, y: 0, z: 0, yaw: 0 };
}
