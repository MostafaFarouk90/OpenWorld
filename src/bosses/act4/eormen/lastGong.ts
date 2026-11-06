// The Last Gong (plans/act4-L6.md "PR 2", C): a bronze gong beside the nave's altar. It can be struck two ways, so every class
// can finish the fight: F at the gong (any class, any time), or any player hit on it (a sword, a bolt, a spell; the gong's kind
// is in STRUCK_PROP_KINDS). The struck gong is a neutral immortal actor with one hurtbox (the PR 1 valve pattern); a damage
// modifier turns a player hit on it into a strike and zeroes the hit. The gong decides nothing: it reports each strike to the
// encounter, which answers 'break' (inside the window after a toll) or 'dud' (a dull clank).
//
// While the window is open the gong shows it three ways (coordinator review 17:51), so it reads on every glow tier:
// - its pool light (one slot of the env glow pool, reserved for the fight, so it wins over the nave's other glow sources) brightens;
// - its rim shimmers (emissive, pulsing);
// - a floor decal ring round it glows and shrinks with the time left.
// On the low tier the pool has no lights, and the rim and the ring alone carry the window.
import * as THREE from 'three';
import type { Actor } from '../../../actors/Actor';
import type { ModifiableRequest } from '../../../actors/DamageResolver';
import { HurtboxSet } from '../../../combat/HurtboxSet';
import type { GameContext } from '../../../core/Game';
import type { FireLightSlot } from '../../../tutorial/CrisisDressing';
import { GONG, GONG_KIND, LOOK, TOLL } from './tuning';

export type GongSource = 'interact' | 'hit';
export type GongAnswer = 'break' | 'dud' | 'refused';

export const GONG_MODIFIER_ID = 'bosses.eormen.gong-hit';
export const GONG_INTERACT_ID = 'use:eormen-gong';
export const GONG_NAME_KEY = 'bosses.eormen.gong';
const GONG_MODIFIER_ORDER = 80;
/** Seconds between attempts to take a glow slot when none was free (a tier raised mid-fight). */
const RETRY_LIGHT = 1;

export interface LastGongOptions {
  at: THREE.Vector3;
  /** The yaw the gong's face turns to (toward the nave). */
  yaw: number;
  /** Draw its own posts and beam (false when it hangs in a frame the interior already builds). Default true. */
  ownFrame?: boolean;
  onStrike(source: GongSource): GongAnswer;
  warn(message: string): void;
}

export class LastGong {
  readonly mesh = new THREE.Group();
  readonly actor: Actor;
  private readonly hurtboxes: HurtboxSet;
  private readonly offs: (() => void)[] = [];
  private readonly bronze = new THREE.MeshStandardMaterial({ color: LOOK.gongBronze, metalness: 0.85, roughness: 0.35 });
  private readonly rimMat = new THREE.MeshStandardMaterial({ color: LOOK.gongBronze, metalness: 0.9, roughness: 0.3, emissive: LOOK.gongGlow, emissiveIntensity: 0 });
  private readonly frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.85 });
  private readonly decalMat = new THREE.MeshBasicMaterial({ color: LOOK.gongGlow, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly disc: THREE.Mesh;
  private readonly decal: THREE.Mesh;
  private slot: FireLightSlot | null = null;
  private retryLight = 0;
  /** The glow tier the slot was taken on (a tier change re-takes it: a high-tier slot goes dark on medium). */
  private tierSeen: string | null = null;
  private open = false;
  private remaining = 0;
  private time = 0;
  /** Seconds left of a struck wobble. */
  private wobble = 0;
  private disposed = false;
  /** Strikes reported (tests, the real-game log). */
  strikes = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly opts: LastGongOptions,
  ) {
    const g = (geo: THREE.BufferGeometry) => (this.geos.push(geo), geo);
    this.mesh.name = 'eormen-last-gong';
    this.mesh.position.copy(opts.at);
    this.mesh.rotation.y = opts.yaw;
    const h = GONG.hurtHeight;
    const postL = new THREE.Mesh(g(new THREE.BoxGeometry(0.16, 2.6, 0.16)), this.frameMat);
    postL.position.set(-1.05, 1.3, 0);
    const postR = postL.clone();
    postR.position.x = 1.05;
    const beam = new THREE.Mesh(g(new THREE.BoxGeometry(2.4, 0.18, 0.18)), this.frameMat);
    beam.position.y = 2.6;
    this.disc = new THREE.Mesh(g(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 28)), this.bronze);
    this.disc.rotation.x = Math.PI / 2;
    this.disc.position.y = h;
    this.disc.name = 'gong-disc';
    const rim = new THREE.Mesh(g(new THREE.TorusGeometry(0.85, 0.06, 6, 28)), this.rimMat);
    rim.position.y = h;
    rim.name = 'gong-rim';
    const ring = new THREE.RingGeometry(GONG.decalRadius * 0.82, GONG.decalRadius, 36);
    ring.rotateX(-Math.PI / 2);
    this.decal = new THREE.Mesh(g(ring), this.decalMat);
    this.decal.position.y = 0.04;
    this.decal.name = 'gong-decal';
    this.decal.visible = false;
    const bone = new THREE.Object3D();
    bone.name = 'eormen-gong-bone';
    bone.position.y = h;
    if (opts.ownFrame === false) {
      for (const m of [postL, postR, beam]) m.visible = false;
    }
    this.mesh.add(postL, postR, beam, this.disc, rim, this.decal, bone);
    ctx.scene.add(this.mesh);
    this.mesh.updateMatrixWorld(true);
    this.hurtboxes = new HurtboxSet(
      this.mesh,
      [{ name: 'gong', bone: bone.name, start: { x: 0, y: -0.7, z: 0 }, end: { x: 0, y: 0.7, z: 0 }, radius: GONG.hurtRadius }],
      this.mesh,
    );
    this.actor = ctx.actors.spawn({ kind: GONG_KIND, team: 'neutral', immortal: true, maxHealth: 100, maxPoise: 0, root: this.mesh, owner: this.mesh });
    this.actor.data['audio'] = { material: 'metal' };
    try {
      this.wire(ctx, opts);
    } catch (err) {
      this.dispose();
      throw err;
    }
    this.takeLight();
  }

  private wire(ctx: GameContext, opts: LastGongOptions): void {
    this.offs.push(
      ctx.combat.addTarget(this.hurtboxes, this.actor.id),
      ctx.damage.addModifier(GONG_MODIFIER_ID, (req, target, attacker) => this.onHit(req, target, attacker), GONG_MODIFIER_ORDER),
      ctx.interaction.register({
        id: GONG_INTERACT_ID,
        kind: 'use',
        position: (out) => out.set(opts.at.x, opts.at.y + 1, opts.at.z),
        radius: GONG.interactRadius,
        promptKey: 'interact.use',
        name: ctx.strings.t(GONG_NAME_KEY),
        coneDegrees: 360,
        enabled: () => !this.disposed,
        onInteract: () => void this.strike('interact'),
      }),
    );
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The gong holds a slot of the glow pool (tests: false on the low tier). */
  get lit(): boolean {
    return this.slot !== null;
  }

  /** The floor ring shows (tests: the 0-light read). */
  get decalShown(): boolean {
    return this.decal.visible && this.decalMat.opacity > 0;
  }

  /** The rim's glow 0..~1.5 (tests: the 0-light read). */
  get rimGlow(): number {
    return this.rimMat.emissiveIntensity;
  }

  /** The window opened (`remaining` seconds) or closed. */
  setOpen(open: boolean, remaining = TOLL.windowSeconds): void {
    this.open = open;
    this.remaining = open ? Math.max(0, remaining) : 0;
    this.decal.visible = open;
    if (!open) {
      this.decalMat.opacity = 0;
      this.rimMat.emissiveIntensity = 0;
    }
  }

  /** The player struck the gong (F, a hit, or the headless driver). */
  strike(source: GongSource): GongAnswer {
    if (this.disposed) return 'refused';
    this.strikes++;
    this.wobble = 0.6;
    try {
      return this.opts.onStrike(source);
    } catch (err) {
      this.opts.warn(`gong strike failed (${String(err)})`);
      return 'refused';
    }
  }

  tick(dt: number): void {
    if (this.disposed || !(dt > 0)) return;
    this.time += dt;
    this.retryLight -= dt;
    if (this.retryLight <= 0) {
      const tier = this.glowTier();
      if (!this.slot || tier !== this.tierSeen) {
        this.slot?.release();
        this.slot = null;
        this.takeLight();
      } else this.retryLight = RETRY_LIGHT;
    }
    if (this.open) {
      this.remaining = Math.max(0, this.remaining - dt);
      const k = this.remaining / TOLL.windowSeconds;
      this.rimMat.emissiveIntensity = 0.9 + 0.6 * Math.sin(this.time * 14);
      this.decalMat.opacity = 0.35 + 0.45 * k;
      this.decal.scale.setScalar(0.55 + 0.45 * k);
    }
    if (this.wobble > 0) {
      this.wobble = Math.max(0, this.wobble - dt);
      this.disc.rotation.z = Math.sin(this.wobble * 40) * 0.06 * (this.wobble / 0.6);
    }
    const p = this.mesh.position;
    this.slot?.set({ x: p.x, y: p.y + GONG.hurtHeight + 0.4, z: p.z }, this.open ? GONG.lightOpen : GONG.lightIdle);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const off of this.offs.splice(0).reverse()) off();
    this.slot?.release();
    this.slot = null;
    if (this.ctx.actors.get(this.actor.id)) this.ctx.actors.despawn(this.actor.id);
    this.hurtboxes.dispose();
    this.mesh.removeFromParent();
    for (const geo of this.geos) geo.dispose();
    this.bronze.dispose();
    this.rimMat.dispose();
    this.frameMat.dispose();
    this.decalMat.dispose();
  }

  // ---- internals ----

  private glowTier(): string | null {
    try {
      return this.ctx.services.get('env')?.glow().tier ?? null;
    } catch {
      return null;
    }
  }

  private takeLight(): void {
    this.retryLight = RETRY_LIGHT;
    this.tierSeen = this.glowTier();
    try {
      this.slot = this.ctx.services.get('env')?.fireLights.acquire() ?? null;
    } catch (err) {
      this.slot = null;
      this.opts.warn(`no glow light for the gong (${String(err)})`);
    }
  }

  private onHit(req: ModifiableRequest, target: Actor, attacker: Actor | null): void {
    if (target.id !== this.actor.id) return;
    // The gong never takes damage; only a player's landed hit sounds it.
    req.amount = 0;
    req.poise = 0;
    if (attacker?.team !== 'player' || req.outcome !== 'hit' || req.kind === 'status') return;
    this.strike('hit');
  }
}
