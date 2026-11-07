// M55's hammer trial (plans/act5-N6.md section 3): Ulthred (his model, no boss bar, not on the registry) in N2's Hammer Hall, three
// rounds of five slams. He walks to the slam site nearest Cael and slams toward Cael (the 1.2 s tell, no lava). A slam counts when
// it ends without landing on Cael (dodged, blocked, parried or out of reach); a round ends at five counted slams; 4 s between rounds.
// It runs on the shipped trial service when it is there (both sides held at 1 HP, the distance rule at the hall's centre); either
// way a guard keeps the trial's slams from taking Cael below 1 HP. Leaving the hall, a load, or the trial service ending the duel
// stops it with no win (N11's quest re-offers it, from round 1).
//
// Service `hammerTrial` (N11): `start()`, `stop()`, `running`, `round`, `counted`. Events `ulthred.trial.round { n }` as round n
// begins, and `ulthred.trial.won {}` after the third round.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import { ensureAct5Sfx } from '../../../audio/act5/act5SfxEnsure';
import type { GameContext } from '../../../core/Game';
import { yawToward } from '../../prior/geometry';
import type { UlthredClip, UlthredModel } from './UlthredModel';
import { distToSegment, GroundLine, lineEnd } from './ulthredFx';
import { HALL, SLAM, TRIAL } from './tuning';

export const TRIAL_KIND = 'ulthred-trial';
export const TRIAL_GUARD_ID = 'bosses.ulthred.trial.guard';

declare module '../../../core/events' {
  interface GameEventMap {
    /** N6: the M55 hammer trial's round `n` (1..3) begins. */
    'ulthred.trial.round': { n: number };
    /** N6: the M55 hammer trial is passed (three rounds of five slams). */
    'ulthred.trial.won': Record<string, never>;
  }
}

export interface HammerTrialService {
  /** Starts the trial in the Hammer Hall; false when not in the hall, already running, or Ulthred's fight is on. */
  start(): boolean;
  /** Stops a running trial (no win). */
  stop(): boolean;
  readonly running: boolean;
  /** The round (1..3), 0 when not running. */
  readonly round: number;
  /** Slams counted in this round. */
  readonly counted: number;
}

declare module '../../../core/Services' {
  interface GameServices {
    /** N6: M55's hammer trial (src/bosses/act5/ulthred/hammerTrial.ts). */
    hammerTrial: HammerTrialService;
  }
}

type Phase = 'walk' | 'tell' | 'recover' | 'between';

interface Run {
  actor: Actor;
  root: THREE.Object3D;
  model: UlthredModel | null;
  line: GroundLine;
  phase: Phase;
  t: number;
  target: THREE.Vector3;
  swing: number;
  clip: UlthredClip | null;
  offs: (() => void)[];
}

export interface HammerTrialOptions {
  makeModel?: () => UlthredModel | null;
  /** True while D10's fight runs in the hall (the trial refuses). */
  fightRunning?: () => boolean;
  warn?: (m: string) => void;
}

export class HammerTrial implements HammerTrialService {
  private run: Run | null = null;
  private r = 0;
  private c = 0;
  private readonly warn: (m: string) => void;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly opts: HammerTrialOptions = {},
  ) {
    this.warn = opts.warn ?? ((m) => console.warn(`[ulthred-trial] ${m}`));
    this.offs.push(
      ctx.events.on('interior.exited', (e) => {
        if (e.interiorId === HALL.interiorId) this.stop();
      }),
      ctx.events.on('save.loaded', () => this.stop()),
      ctx.events.on('trial.ended', (e) => {
        if (e.trialId === TRIAL.id && this.run) this.end(false);
      }),
      ctx.events.on('actor.died', (e) => {
        if (e.actorId === ctx.player.actor.id) this.stop();
      }),
      ctx.damage.addModifier(TRIAL_GUARD_ID, (req) => this.guard(req), 98),
    );
  }

  get running(): boolean {
    return this.run !== null;
  }

  get round(): number {
    return this.run ? this.r : 0;
  }

  get counted(): number {
    return this.run ? this.c : 0;
  }

  start(): boolean {
    if (this.run) return false;
    if (this.ctx.services.get('interiors')?.current !== HALL.interiorId) return false;
    if (this.opts.fightRunning?.()) return false;
    const mark = this.ctx.anchors.find(HALL.centre);
    if (!mark) {
      this.warn(`${HALL.centre} missing; the trial does not start`);
      return false;
    }
    let model: UlthredModel | null = null;
    try {
      model = this.opts.makeModel?.() ?? null;
    } catch (err) {
      this.warn(`trial model failed (${String(err)})`);
    }
    const root = model?.root ?? new THREE.Group();
    root.name = 'ulthred-trial';
    root.position.set(mark.position.x, mark.position.y, mark.position.z);
    root.rotation.set(0, mark.yaw, 0);
    const line = new GroundLine('ulthred-trial-line');
    this.ctx.scene.add(root, line.mesh);
    const actor = this.ctx.actors.spawn({ kind: TRIAL_KIND, team: 'hostile', level: 40, maxHealth: 9999, maxPoise: 999, root, owner: model?.owner, hittable: true });
    actor.data['audio'] = { material: 'metal' };
    const offs: (() => void)[] = [];
    if (model) offs.push(this.ctx.combat.addTarget(model.hurtboxes, actor.id));
    this.run = { actor, root, model, line, phase: 'walk', t: 0, target: new THREE.Vector3(), swing: 0, clip: null, offs };
    this.r = 1;
    this.c = 0;
    const trials = this.ctx.services.get('trials');
    const centre = this.hallCentre();
    trials?.start({ id: TRIAL.id, opponentId: actor.id, breaksToWin: 999, onLoss: 'restart', leaveDistance: TRIAL.leaveDistance, ...(centre ? { arenaCentre: centre } : {}) });
    model?.play('roar');
    this.ctx.events.emit('ulthred.trial.round', { n: 1 });
    this.pickSite();
    return true;
  }

  stop(): boolean {
    if (!this.run) return false;
    this.end(false);
    return true;
  }

  fixedUpdate(dt: number): void {
    const run = this.run;
    if (!run || !(dt > 0)) return;
    run.model?.update(dt);
    run.t += dt;
    const feet = this.ctx.player.feet;
    const pos = run.root.position;
    switch (run.phase) {
      case 'walk': {
        const d = Math.hypot(run.target.x - pos.x, run.target.z - pos.z);
        if (d > 0.2 && run.t < 6) {
          const step = Math.min(d, TRIAL.walkSpeed * dt);
          pos.x += ((run.target.x - pos.x) / d) * step;
          pos.z += ((run.target.z - pos.z) / d) * step;
          run.root.rotation.y = yawToward(pos, run.target);
          this.loop(run, 'walk');
          return;
        }
        run.root.rotation.y = yawToward(pos, feet);
        run.swing++;
        run.phase = 'tell';
        run.t = 0;
        run.clip = null;
        run.model?.play('slam');
        this.ctx.events.emit('telegraph', { actorId: run.actor.id, kind: SLAM.telegraph, attackId: SLAM.attackId, moveId: SLAM.attackId, swingId: run.swing, leadSeconds: SLAM.windupSeconds });
        return;
      }
      case 'tell': {
        const k = Math.min(1, run.t / SLAM.windupSeconds);
        run.model?.setHammerGlow(k);
        run.line.show(pos, lineEnd(pos, run.root.rotation.y, TRIAL.length), SLAM.halfWidth, k);
        if (run.t >= SLAM.windupSeconds) this.slam(run);
        return;
      }
      case 'recover':
        if (run.t >= SLAM.stuckSeconds + SLAM.recoverSeconds) {
          run.line.hide();
          this.pickSite();
        }
        return;
      case 'between':
        if (run.t >= TRIAL.betweenRoundsSeconds) {
          this.r++;
          this.c = 0;
          this.ctx.events.emit('ulthred.trial.round', { n: this.r });
          this.pickSite();
        }
        return;
    }
  }

  dispose(): void {
    this.end(false);
    for (const off of this.offs.splice(0)) off();
  }

  // ---- internals ----

  private slam(run: Run): void {
    const pos = run.root.position;
    const end = lineEnd(pos, run.root.rotation.y, TRIAL.length);
    run.model?.setHammerGlow(0);
    run.line.show(pos, end, SLAM.halfWidth, 1);
    try {
      ensureAct5Sfx('sfx.ulthred.hammer');
      this.ctx.services.get('audio')?.playAt('sfx.ulthred.hammer', pos);
    } catch {
      // N8's key; silent when missing
    }
    const feet = this.ctx.player.feet;
    let landed = false;
    if (Math.abs(feet.y - pos.y) <= 2.5 && distToSegment(feet, pos, end) <= SLAM.halfWidth) {
      const r = this.ctx.damage.apply({ attackerId: run.actor.id, targetId: this.ctx.player.actor.id, amount: SLAM.damage, poise: SLAM.poise, kind: 'melee', attackId: SLAM.attackId, swingId: run.swing });
      // Blocked or parried counts as answered; only a landed hit does not count.
      landed = r?.outcome === 'hit';
    }
    run.phase = 'recover';
    run.t = 0;
    if (landed) return;
    this.c++;
    if (this.c < TRIAL.slamsPerRound) return;
    if (this.r >= TRIAL.rounds) {
      this.end(true);
      return;
    }
    run.phase = 'between';
    run.t = 0;
    run.line.hide();
    this.loop(run, 'idle');
  }

  /** The slam site nearest Cael (N2's eight `.hammer.slam.*` anchors); his own spot when none is found. */
  private pickSite(): void {
    const run = this.run;
    if (!run) return;
    const feet = this.ctx.player.feet;
    let best: THREE.Vector3Like | null = null;
    let bestD = Infinity;
    for (const id of HALL.slams) {
      const a = this.ctx.anchors.find(id);
      if (!a) continue;
      const d = Math.hypot(a.position.x - feet.x, a.position.z - feet.z);
      if (d < bestD) {
        bestD = d;
        best = a.position;
      }
    }
    run.target.set(best?.x ?? run.root.position.x, run.root.position.y, best?.z ?? run.root.position.z);
    run.phase = 'walk';
    run.t = 0;
  }

  private hallCentre(): { x: number; z: number } | null {
    const entry = this.ctx.anchors.find(HALL.entry);
    if (!entry) return null;
    return { x: entry.position.x - HALL.entryLocal.x + HALL.centreLocal.x, z: entry.position.z - HALL.entryLocal.z + HALL.centreLocal.z };
  }

  /** The trial never takes Cael below 1 HP, whatever the trial service does. */
  private guard(req: ModifiableRequest): void {
    const run = this.run;
    if (!run || req.attackerId !== run.actor.id || req.targetId !== this.ctx.player.actor.id) return;
    const player = this.ctx.player.actor;
    req.amount = Math.min(req.amount, Math.max(0, player.health - 1));
  }

  private loop(run: Run, clip: UlthredClip): void {
    if (run.clip === clip) return;
    run.clip = clip;
    run.model?.play(clip, { loop: true });
  }

  private end(won: boolean): void {
    const run = this.run;
    if (!run) return;
    this.run = null;
    const trials = this.ctx.services.get('trials');
    if (trials?.state()?.id === TRIAL.id) trials.stop(TRIAL.id);
    for (const off of run.offs.splice(0)) off();
    if (this.ctx.actors.get(run.actor.id)) this.ctx.actors.despawn(run.actor.id);
    run.line.dispose();
    if (run.model) run.model.dispose();
    else run.root.removeFromParent();
    this.r = 0;
    this.c = 0;
    if (won) this.ctx.events.emit('ulthred.trial.won', {});
  }
}
