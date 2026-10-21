import { HERD } from './tuning';

export interface Point {
  x: number;
  z: number;
}

export interface Circle extends Point {
  radius: number;
}

/** What a sheep needs to be drawn; the plugin backs it with a quadruped body, tests with a fake. */
export interface SheepView {
  place(x: number, z: number, yaw: number): void;
  setSpeed(mps: number): void;
  update(dt: number): void;
  dispose(): void;
}

export interface HerdEnv {
  player(): Point | null;
  makeView(): SheepView;
  rng(): number;
}

export type SheepMode = 'graze' | 'follow' | 'lost';

interface Sheep {
  x: number;
  z: number;
  yaw: number;
  home: Point;
  mode: SheepMode;
  /** Scatter heading and seconds left in the run. */
  heading: number;
  runLeft: number;
  wander: Point;
  wanderLeft: number;
  view: SheepView;
}

export interface HerdEvents {
  /** The herd began or stopped following (`n` sheep following). */
  joined?(n: number): void;
  /** `n` sheep scattered into the fog this tick. */
  scattered?(n: number): void;
}

export interface HerdOptions {
  /** One start point per sheep (the flock anchors); the herd has min(anchors, `size`) sheep. */
  anchors: readonly Point[];
  size?: number;
  /** Ash-fog hollows: a sheep inside one scatters. */
  fog?: readonly Circle[];
}

/**
 * A flock of up to 8 sheep for R05 (design 15 item 77): they graze at their anchors, follow the player once told to, scatter
 * when they wander into ash-fog, and are counted home. Cosmetic actors: no Actor, nothing can hit or kill them. Pure
 * simulation over `SheepView`s; the quest (A12) decides when the herd follows and what a count means.
 */
export class Herd {
  private readonly sheep: Sheep[] = [];
  private _following = false;
  private readonly fog: readonly Circle[];

  constructor(
    readonly id: string,
    private readonly env: HerdEnv,
    opts: HerdOptions,
    private readonly events: HerdEvents = {},
  ) {
    const n = Math.max(0, Math.min(HERD.maxSize, Math.floor(opts.size ?? opts.anchors.length), opts.anchors.length));
    this.fog = opts.fog ?? [];
    for (let i = 0; i < n; i++) {
      const a = opts.anchors[i]!;
      const view = env.makeView();
      const s: Sheep = { x: a.x, z: a.z, yaw: env.rng() * Math.PI * 2, home: { x: a.x, z: a.z }, mode: 'graze', heading: 0, runLeft: 0, wander: { x: a.x, z: a.z }, wanderLeft: 0, view };
      view.place(s.x, s.z, s.yaw);
      this.sheep.push(s);
    }
  }

  get size(): number {
    return this.sheep.length;
  }

  get following(): boolean {
    return this._following;
  }

  /** Sheep currently following the player. */
  get followers(): number {
    return this.sheep.filter((s) => s.mode === 'follow').length;
  }

  modes(): SheepMode[] {
    return this.sheep.map((s) => s.mode);
  }

  positions(): Point[] {
    return this.sheep.map((s) => ({ x: s.x, z: s.z }));
  }

  setFollowing(on: boolean): void {
    if (on === this._following) return;
    this._following = on;
    for (const s of this.sheep) {
      if (on && s.mode === 'graze') s.mode = 'follow';
      else if (!on && s.mode === 'follow') s.mode = 'graze';
    }
    this.events.joined?.(on ? this.followers : 0);
  }

  /** Sheep within `radius` of `home` that are not lost in the fog (a lost sheep does not count home). */
  count(home: Point, radius: number): number {
    return this.sheep.filter((s) => s.mode !== 'lost' && Math.hypot(s.x - home.x, s.z - home.z) <= radius).length;
  }

  step(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    const player = this.env.player();
    let scattered = 0;
    for (let i = 0; i < this.sheep.length; i++) {
      const s = this.sheep[i]!;
      if (s.mode !== 'lost' && this.inFog(s)) {
        s.mode = 'lost';
        s.runLeft = HERD.scatterSeconds;
        const c = this.fog.find((f) => Math.hypot(s.x - f.x, s.z - f.z) <= f.radius)!;
        const away = Math.atan2(s.x - c.x, s.z - c.z) + (this.env.rng() - 0.5) * 1.6;
        s.heading = Number.isFinite(away) ? away : this.env.rng() * Math.PI * 2;
        scattered++;
      }
      let vx = 0;
      let vz = 0;
      if (s.mode === 'lost') {
        if (s.runLeft > 0) {
          s.runLeft -= dt;
          vx = Math.sin(s.heading) * HERD.scatterSpeed;
          vz = Math.cos(s.heading) * HERD.scatterSpeed;
        } else if (this._following && player && Math.hypot(player.x - s.x, player.z - s.z) <= HERD.rejoinRadius && !this.inFog(s)) {
          s.mode = 'follow';
        }
      } else if (s.mode === 'follow') {
        if (!player || Math.hypot(player.x - s.x, player.z - s.z) > HERD.loseDistance) {
          s.mode = 'graze';
        } else {
          const dx = player.x - s.x;
          const dz = player.z - s.z;
          const d = Math.hypot(dx, dz);
          if (d > HERD.followDistance) {
            vx = (dx / d) * HERD.followSpeed;
            vz = (dz / d) * HERD.followSpeed;
          }
          // Keep apart from the flock.
          for (let j = 0; j < this.sheep.length; j++) {
            if (j === i) continue;
            const o = this.sheep[j]!;
            const ox = s.x - o.x;
            const oz = s.z - o.z;
            const od = Math.hypot(ox, oz);
            if (od > 0 && od < HERD.separation) {
              vx += (ox / od) * 1.2;
              vz += (oz / od) * 1.2;
            }
          }
        }
      } else if (this._following && player && Math.hypot(player.x - s.x, player.z - s.z) <= HERD.rejoinRadius && !this.inFog(s)) {
        // A sheep left grazing while the herd follows (it started, or strayed, further than loseDistance from the player)
        // joins again when the player comes to it: the herd would otherwise never follow a player who arrives after it started.
        s.mode = 'follow';
      } else {
        // Graze: pick a nearby spot now and then, drift to it.
        s.wanderLeft -= dt;
        if (s.wanderLeft <= 0) {
          const a = this.env.rng() * Math.PI * 2;
          const r = this.env.rng() * HERD.grazeRadius;
          s.wander = { x: s.home.x + Math.cos(a) * r, z: s.home.z + Math.sin(a) * r };
          s.wanderLeft = 3 + this.env.rng() * 4;
        }
        const dx = s.wander.x - s.x;
        const dz = s.wander.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          vx = (dx / d) * HERD.grazeSpeed;
          vz = (dz / d) * HERD.grazeSpeed;
        }
      }
      s.x += vx * dt;
      s.z += vz * dt;
      const speed = Math.hypot(vx, vz);
      if (speed > 0.05) s.yaw = Math.atan2(-vx, -vz);
      s.view.place(s.x, s.z, s.yaw);
      s.view.setSpeed(speed);
      s.view.update(dt);
    }
    if (scattered > 0) this.events.scattered?.(scattered);
  }

  dispose(): void {
    for (const s of this.sheep) s.view.dispose();
    this.sheep.length = 0;
  }

  private inFog(s: Sheep): boolean {
    return this.fog.some((f) => Math.hypot(s.x - f.x, s.z - f.z) <= f.radius);
  }
}
