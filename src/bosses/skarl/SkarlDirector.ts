import * as THREE from 'three';
import { playEnsured } from '../../audio/act2SfxEnsure';
import { bossOutcomeFlag } from '../../actors/BossRegistry';
import type { GameContext } from '../../core/Game';
import { heightAt as terrainHeightAt } from '../../terrain/heightfield';
import type { BossModelState } from '../arena/BossArena';
import { SkarlEncounter, type SkarlEnd, type SkarlPlaces } from './SkarlEncounter';
import type { SkarlModel } from './SkarlModel';
import { ARENA, D06_STARTED_FLAG, PRESENTATION, SFX, SKARL_BOSS_ID, skarlLevel } from './tuning';

export const OUTCOME_FLAG = bossOutcomeFlag(SKARL_BOSS_ID);

export interface SkarlDirectorOptions {
  makeModel?: () => SkarlModel | null;
  modelState?: () => BossModelState;
  warn?: (message: string) => void;
  /** Ground height under (x, z) (default: the terrain heightfield). */
  heightAt?: (x: number, z: number) => number;
}

/**
 * The D06 fight's lifecycle (plans/act3-K8-pr2.md 3.1). K4's Aerie courtyard is outdoors with no gate, so this is a small
 * director of its own rather than the interior `BossArena`, with the same rules: armed on `story.d06.started` with no outcome
 * flag; the player within 20 m of the courtyard centre (at its height) starts the intro (3 s, Skarl steps out with a horn; 1.2 s
 * on a retry), then the encounter registers. A player death, 3 s outside the 34 m ring (not while his kick's shove holds them),
 * a load or an outcome flag set from outside ends the fight without an outcome; the next approach starts it again.
 */
export class SkarlDirector {
  private readonly ctx: GameContext;
  private readonly opts: SkarlDirectorOptions;
  private readonly warn: (m: string) => void;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly offs: (() => void)[] = [];
  private encounter: SkarlEncounter | null = null;
  private intro: { t: number; total: number; first: boolean; cued: boolean } | null = null;
  private started = false;
  private outside = 0;
  private warnedPlaces = false;
  private outcomeChanged = false;
  private disposed = false;

  constructor(ctx: GameContext, opts: SkarlDirectorOptions = {}) {
    this.ctx = ctx;
    this.opts = opts;
    this.warn = opts.warn ?? ((m: string) => console.warn(`[corvin-skarl] ${m}`));
    this.heightAt = opts.heightAt ?? terrainHeightAt;
    const player = () => ctx.player.actor.id;
    this.offs.push(
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === player()) this.end();
      }),
      ctx.events.on('save.loaded', () => this.end()),
      ctx.gates.watch(
        (s) => s.hasFlag(OUTCOME_FLAG),
        (open, cause) => {
          if (open && cause !== 'init') this.outcomeChanged = true;
        },
        { keys: [OUTCOME_FLAG] },
      ),
    );
  }

  get current(): SkarlEncounter | null {
    return this.encounter;
  }

  get introRunning(): boolean {
    return this.intro !== null;
  }

  /** Seconds the player has been outside the ring in a live fight (tests). */
  get outsideSeconds(): number {
    return this.outside;
  }

  fixedUpdate(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    if (this.outcomeChanged) {
      this.outcomeChanged = false;
      // The flag appeared without this encounter playing an outcome (a script, a fixture): end the fight.
      const e = this.encounter;
      if (e && !e.done && !e.outcomePlaying) this.end();
    }
    if (!this.encounter) this.maybeStart();
    if (this.intro) this.tickIntro(dt);
    const e = this.encounter;
    if (!e) return;
    e.tick(dt);
    if (this.encounter && e.contested) this.watchRing(dt);
  }

  dispose(): void {
    this.disposed = true;
    for (const off of this.offs.splice(0)) off();
    this.encounter?.reset({ unregisterFirst: true });
    this.encounter = null;
    this.intro = null;
  }

  private maybeStart(): void {
    if (!this.ctx.state.hasFlag(D06_STARTED_FLAG) || this.ctx.state.hasFlag(OUTCOME_FLAG)) return;
    if (this.ctx.player.actor.dead) return;
    const c = this.ctx.anchors.find(ARENA.centre);
    if (!c) {
      this.places(); // warns once
      return;
    }
    const f = this.ctx.player.feet;
    if (Math.hypot(f.x - c.position.x, f.z - c.position.z) > ARENA.startRadius || Math.abs(f.y - c.position.y) > ARENA.startHeight) return;
    const state = this.opts.modelState?.() ?? 'none';
    if (state === 'loading' || state === 'failed') return;
    const places = this.places();
    if (!places) return;
    let model: SkarlModel | null = null;
    if (this.opts.makeModel) {
      try {
        model = this.opts.makeModel();
      } catch (err) {
        this.warn(`could not build Skarl's model; the fight does not start (${String(err)})`);
        return;
      }
    }
    const playerLevel = this.ctx.services.get('progression')?.level;
    this.encounter = new SkarlEncounter(this.ctx, { model, places, level: skarlLevel(playerLevel), warn: this.warn, onEnd: (end) => this.onEnd(end) });
    const first = !this.started;
    this.started = true;
    this.intro = { t: 0, total: first ? PRESENTATION.introSeconds : PRESENTATION.retrySeconds, first, cued: false };
    this.outside = 0;
  }

  private tickIntro(dt: number): void {
    const i = this.intro!;
    i.t += dt;
    if (i.first && !i.cued && i.t >= PRESENTATION.introHornAt) {
      i.cued = true;
      try {
        const audio = this.ctx.services.get('audio');
        if (audio) playEnsured(audio, SFX.horn);
      } catch {
        // the audio thread owns the key
      }
    }
    if (i.t < i.total) return;
    this.intro = null;
    if (!this.encounter?.register()) this.end();
  }

  /** Out of the ring for `ARENA.outsideSeconds` ends the fight; the time a kick's shove holds the player does not count. */
  private watchRing(dt: number): void {
    const c = this.ctx.anchors.find(ARENA.centre);
    const f = this.ctx.player.feet;
    const inside = !!c && Math.hypot(f.x - c.position.x, f.z - c.position.z) <= ARENA.ring;
    if (inside) this.outside = 0;
    else if (!this.encounter!.shoving) this.outside += dt;
    if (this.outside >= ARENA.outsideSeconds) this.end();
  }

  /** Ends any intro or fight without an outcome. */
  private end(): void {
    this.intro = null;
    this.outside = 0;
    const e = this.encounter;
    if (e && !e.done) e.reset();
    this.encounter = null;
  }

  private onEnd(_end: SkarlEnd): void {
    this.encounter = null;
    this.intro = null;
    this.outside = 0;
  }

  private places(): SkarlPlaces | null {
    const find = (id: string) => this.ctx.anchors.find(id);
    const centre = find(ARENA.centre);
    const skarl = find(ARENA.skarl);
    const post = find(ARENA.post);
    if (!centre || !skarl || !post) {
      if (!this.warnedPlaces) {
        this.warnedPlaces = true;
        this.warn(`Aerie arena anchors missing (${ARENA.centre}, ${ARENA.skarl}, ${ARENA.post}); Skarl does not start`);
      }
      return null;
    }
    const c = new THREE.Vector3(centre.position.x, centre.position.y, centre.position.z);
    const base = this.heightAt(c.x, c.z);
    const groundAt = (x: number, z: number) => {
      const h = this.heightAt(x, z);
      return Number.isFinite(h) && Number.isFinite(base) ? c.y + (h - base) : c.y;
    };
    return {
      centre: c,
      skarl: new THREE.Vector3(skarl.position.x, skarl.position.y, skarl.position.z),
      skarlYaw: skarl.yaw,
      post: new THREE.Vector3(post.position.x, post.position.y, post.position.z),
      groundAt,
    };
  }
}
