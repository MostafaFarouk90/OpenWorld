import type { Act2SfxKey } from './act2Sfx';

/** The `telegraph` move ids of the A6b ground enemies and the sound each plays (the wind-up cue of the attack). */
export const MOVE_SFX: Readonly<Record<string, Act2SfxKey>> = {
  'golem.stomp': 'sfx.golem.stomp',
  'golem.slam': 'sfx.golem.slam',
  'golem.rock': 'sfx.golem.throw',
  'crawler.bite': 'sfx.crawler.bite',
  'crawler.spit': 'sfx.crawler.spit',
  'crawler.drop': 'sfx.crawler.drop',
  'hunter.thrust': 'sfx.hunter.thrust',
  'harpooner.thrust': 'sfx.hunter.thrust',
  'hunter.net': 'sfx.hunter.net',
  'harpooner.harpoon': 'sfx.hunter.harpoon',
};

export const GOLEM_KIND = 'cinder-golem';
/** The puzzle id of the Weeping Bellows (A9; `BELLOWS.puzzleId`). */
export const BELLOWS_PUZZLE_ID = 'weeping-bellows';

interface Point {
  x: number;
  y: number;
  z: number;
}

/** What the router needs from the game; every lookup may come back empty (the router then plays flat or nothing). */
export interface Act2SfxPorts {
  /** The audio service, looked up per call (it is absent without an audio context). */
  audio(): { play(key: string): unknown; playAt(key: string, at: Point): unknown } | undefined;
  /** An actor's world position and kind, or undefined for an unknown or unplaced actor. */
  actor(id: string): { kind: string; position: Point | null } | undefined;
  /** `waves.structure(id)`. */
  structure(id: string): { kind: 'cart' | 'barricade'; maxHealth: number } | undefined;
}

/**
 * Maps the events the Act 2 systems already emit to sound keys. It listens to nothing itself: the plugin forwards each
 * event to the matching method. A missing audio service, or a key nobody registered, is a silent no-op.
 */
export class Act2SfxRouter {
  constructor(private readonly ports: Act2SfxPorts) {}

  /** `telegraph`: a ground enemy's wind-up. */
  telegraph(e: { actorId: string; moveId: string }): void {
    const key = MOVE_SFX[e.moveId];
    if (key) this.at(key, e.actorId);
  }

  /** `actor.died`: a golem settles or crumbles. */
  died(e: { actorId: string; kind: string }): void {
    if (e.kind === GOLEM_KIND) this.at('sfx.golem.crumble', e.actorId);
  }

  /** `actor.staggered`: a golem staggers only when its back core is hit. */
  staggered(e: { actorId: string }): void {
    if (this.ports.actor(e.actorId)?.kind === GOLEM_KIND) this.at('sfx.golem.corebreak', e.actorId);
  }

  /** `cooling.hit`: a slag crawler quenched. */
  cooled(e: { actorId: string }): void {
    this.at('sfx.crawler.hiss', e.actorId);
  }

  /** `structure.damaged`: the barricade rammed, or a cart struck (the first, full-health event of a cart is its spawn). */
  structureDamaged(e: { id: string; health: number }): void {
    const s = this.ports.structure(e.id);
    if (!s) return;
    if (s.kind === 'barricade') this.flat('sfx.barricade.ram');
    else if (e.health < s.maxHealth) this.flat('sfx.cart.hit');
  }

  /** `structure.destroyed`. */
  structureDestroyed(e: { id: string }): void {
    const s = this.ports.structure(e.id);
    if (!s) return;
    this.flat(s.kind === 'barricade' ? 'sfx.barricade.fall' : 'sfx.cart.break');
  }

  /** `interact`: a valve wheel turned. */
  interact(e: { kind: string; action: string }): void {
    if (e.kind === 'valve' && e.action === 'interact') this.flat('sfx.bellows.valve');
  }

  /** `puzzle.state`: the Bellows pressure clock starts. */
  puzzleState(e: { id: string; phase: string }): void {
    if (e.id === BELLOWS_PUZZLE_ID && e.phase === 'pressure') this.flat('sfx.bellows.hiss');
  }

  /** `puzzle.solved`. */
  puzzleSolved(e: { id: string }): void {
    if (e.id === BELLOWS_PUZZLE_ID) this.flat('sfx.bellows.solved');
  }

  /** `puzzle.failed`. */
  puzzleFailed(e: { id: string }): void {
    if (e.id === BELLOWS_PUZZLE_ID) this.flat('sfx.bellows.vent');
  }

  private flat(key: Act2SfxKey): void {
    try {
      this.ports.audio()?.play(key);
    } catch {
      // an unregistered key is silent
    }
  }

  private at(key: Act2SfxKey, actorId: string): void {
    const audio = this.ports.audio();
    if (!audio) return;
    try {
      const p = this.ports.actor(actorId)?.position;
      if (p) audio.playAt(key, p);
      else audio.play(key);
    } catch {
      // an unregistered key is silent
    }
  }
}
