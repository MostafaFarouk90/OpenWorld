// Act 4 L4 (plans/act4-L4.md sections 1.1 to 1.3): the `escorts` service. It turns an EscortDef into a running escort:
// the route walker (EscortRun), the members (EscortMembers), the cart (EscortCart), the junction talk, the call-outs,
// the movement mode, the hand-in weather hold and the save. One escort runs at a time.
//
// Contract for L10 and L11 (written up in plans/act4-L4.md section 2):
//   escorts.start(def)        -> true, or false (unknown member id, missing anchor, another escort running)
//   escorts.go(id)            -> the junction talk (also the F talk on the lead member)
//   escorts.stop(id)          -> despawns it at the hand-in; releases the mode and the weather hold
//   events: escort.started { escortId } (A5's shape), escort.halted { escortId, reason }, escort.resumed, escort.junction
//           { escortId, junction }, escort.arrived
//   a load mid-escort puts the column (and, through the `escort` movement mode's safe point, the player) at the last
//   junction, waiting for Cael; a load of a save without one despawns any running escort.
import type { GameContext } from '../core/Game';
import type { NpcModelLoader } from '../npcs/types';
import type { P3 } from '../chase/route';
import { memberSpec } from './allies';
import { ESCORT_CART, EscortCart, type CartHealth } from './EscortCart';
import { ESCORT_MEMBER, EscortMembers, type EscortMemberSpec } from './EscortMembers';
import { EscortRun, type EscortRunEvent, type EscortStop } from './EscortRun';
import { ESCORT_KNEEL_CLEAR_RADIUS, ESCORT_PLAYER_FAR, type EscortDef, type EscortHaltReason, type EscortsService } from './types';

/** L4's optional fields on top of L0's EscortDef. */
export interface Act4EscortDef extends EscortDef {
  /** Anchor ids on the route where a storm halt waits (L1's rope-line shelters). None: it waits where it is. */
  shelters?: readonly string[];
  /** The talk that resumes a junction: junction anchor id to dialogue id (spoken with the lead). */
  junctionDialogue?: Readonly<Record<string, string>>;
  /** Spawner groups whose clearing brings a stopped cart back (none: no standing hostile within 8 m). */
  threatGroups?: readonly string[];
  /** The escort bar's title. */
  nameKey?: string;
}

export const ESCORT_ENGINE = {
  /** The lead calls out at once when Cael falls behind, then this often while he stays away. */
  calloutSeconds: 20,
  /** Within this many metres of the end, weather is held clear (storms never during a hand-in). */
  handInHoldM: 30,
  persistKey: 'escorts',
  persistVersion: 1,
  holdReason: (id: string) => `escort.${id}`,
} as const;

export interface EscortSave {
  running: { def: Act4EscortDef; junctionIndex: number; cartHealth: number | null } | null;
}

export interface EscortState {
  id: string;
  reason: EscortHaltReason | null;
  junction: string | null;
  arrived: boolean;
}

/** What an escort bar or test reads. */
export interface EscortView {
  id: string;
  nameKey: string | null;
  members: { id: string; kneeling: boolean }[];
  cart: CartHealth | null;
}

export interface Act4EscortsService extends EscortsService {
  start(def: Act4EscortDef): boolean;
  stop(id: string): void;
  go(id: string): boolean;
  state(id: string): EscortState | null;
  view(): EscortView | null;
}

type Host = Pick<GameContext, 'scene' | 'actors' | 'combat' | 'damage' | 'events' | 'services' | 'anchors' | 'player' | 'state' | 'interaction' | 'strings'> & {
  assets?: unknown;
};

interface Running {
  def: Act4EscortDef;
  run: EscortRun;
  members: EscortMembers;
  /** Member index of each npc member in the column (the cart takes its own index). */
  order: { id: string; kind: 'npc' | 'cart' }[];
  cart: EscortCart | null;
  cartIndex: number;
  releaseMode: (() => void) | null;
  releaseHold: (() => void) | null;
  unregisterTalk: (() => void) | null;
  calloutLeft: number;
  arrivedSent: boolean;
}

const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '-');

export class EscortEngine implements Act4EscortsService {
  private cur: Running | null = null;
  private pendingLoad: EscortSave | null = null;
  private loadedThisRound = false;
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly ctx: Host,
    /** Where Cael stands (tests stand in a position; the game reads the player's feet). */
    private readonly playerFeet: () => P3 = () => ctx.player.feet,
  ) {
    this.offs.push(ctx.events.on('save.loaded', () => this.onLoaded()));
  }

  // ---- service --------------------------------------------------------------------------------------------------

  active(): string | null {
    return this.cur?.def.id ?? null;
  }

  lastJunction(id: string): string | null {
    const r = this.cur;
    if (!r || r.def.id !== id) return null;
    return r.run.plan.junctions[r.run.junctionIndex]?.id ?? null;
  }

  state(id: string): EscortState | null {
    const r = this.cur;
    if (!r || r.def.id !== id) return null;
    return { id, reason: r.run.reason, junction: r.run.junctionId, arrived: r.run.arrived };
  }

  view(): EscortView | null {
    const r = this.cur;
    if (!r) return null;
    return {
      id: r.def.id,
      nameKey: r.def.nameKey ?? null,
      members: r.members.all.map((m) => ({ id: m.spec.id, kneeling: m.kneeling })),
      cart: r.cart ? r.cart.health() : null,
    };
  }

  start(def: Act4EscortDef): boolean {
    if (this.cur) {
      if (this.cur.def.id === def?.id) return true; // a quest re-deriving its escort after a load
      this.warn(`start("${def?.id}") refused: "${this.cur.def.id}" is running`);
      return false;
    }
    const built = this.build(def, -1, null);
    if (!built) return false;
    this.ctx.events.emit('escort.started', { escortId: def.id });
    return true;
  }

  go(id: string): boolean {
    const r = this.cur;
    if (!r || r.def.id !== id || !r.run.atJunction) return false;
    this.emitRun(r, r.run.go());
    return true;
  }

  stop(id: string): void {
    if (!this.cur || this.cur.def.id !== id) return;
    this.teardown();
    this.ctx.events.emit('escort.stopped', { escortId: id });
  }

  // ---- save -----------------------------------------------------------------------------------------------------

  serialize(): EscortSave {
    const r = this.cur;
    if (!r || r.run.arrived) return { running: null };
    return { running: { def: r.def, junctionIndex: r.run.junctionIndex, cartHealth: r.cart ? r.cart.health().health : null } };
  }

  /** Called by the save loader before `save.loaded`; acted on there (the anchors and actors are ready by then). */
  load(data: unknown, version: number): void {
    this.loadedThisRound = true;
    const d = data as EscortSave | null;
    this.pendingLoad = version === ESCORT_ENGINE.persistVersion && d && typeof d === 'object' ? d : { running: null };
  }

  // ---- tick -----------------------------------------------------------------------------------------------------

  fixedUpdate(dt: number): void {
    const r = this.cur;
    if (!r) return;
    r.members.fixedUpdate(dt);
    r.cart?.fixedUpdate();
    // the cart comes back once its group is cleared
    if (r.cart?.down && this.cartGroupCleared(r)) r.cart.revive();
    const feet = this.playerFeet();
    const storm = this.ctx.services.get('weather')?.state().kind === 'storm';
    const before = r.run.s;
    const events = r.run.step({ dt, player: { x: feet.x, y: feet.y, z: feet.z }, down: r.members.anyDown || !!r.cart?.down, storm });
    const moving = r.run.s !== before;
    this.place(r, moving);
    this.emitRun(r, events);
    this.callouts(r, dt);
    this.handInHold(r);
  }

  dispose(): void {
    this.teardown();
    for (const off of this.offs.splice(0)) off();
  }

  // ---- internals ------------------------------------------------------------------------------------------------

  private build(def: Act4EscortDef, junctionIndex: number, cartHealth: number | null): Running | null {
    if (!def || typeof def.id !== 'string' || !Array.isArray(def.members) || def.members.length === 0) {
      this.warn('start refused: a def needs an id and members');
      return null;
    }
    const points: P3[] = [];
    for (const id of def.route ?? []) {
      const a = this.ctx.anchors.find(id);
      if (!a) {
        this.warn(`start("${def.id}") refused: route anchor "${id}" is not defined`);
        return null;
      }
      points.push({ x: a.position.x, y: a.position.y, z: a.position.z });
    }
    if (points.length < 2) {
      this.warn(`start("${def.id}") refused: a route needs two anchors`);
      return null;
    }
    const flag = (k: string) => this.ctx.state.getFlag(k);
    const loader = this.loader();
    const specs: EscortMemberSpec[] = [];
    const order: Running['order'] = [];
    let cartIndex = -1;
    let cartDefHealth: number | undefined;
    for (const m of def.members) {
      if (m.kind === 'cart') {
        if (cartIndex >= 0) {
          this.warn(`start("${def.id}") refused: one cart per escort`);
          return null;
        }
        cartIndex = order.length;
        cartDefHealth = m.health;
        order.push({ id: m.id, kind: 'cart' });
        continue;
      }
      const spec = memberSpec(m.id, loader, flag);
      if (!spec) {
        this.warn(`start("${def.id}") refused: unknown member "${m.id}" (see ESCORT_ALLIES)`);
        return null;
      }
      specs.push(spec);
      order.push({ id: m.id, kind: 'npc' });
    }
    // stops in route order, measured along the line
    let run: EscortRun;
    try {
      const probe = new EscortRun({ points, pace: def.pace, memberCount: order.length, junctions: [], shelters: [] });
      const stops = (ids: readonly string[] | undefined, what: string): EscortStop[] | null => {
        const out: EscortStop[] = [];
        for (const id of ids ?? []) {
          const a = this.ctx.anchors.find(id);
          if (!a) {
            this.warn(`start("${def.id}") refused: ${what} anchor "${id}" is not defined`);
            return null;
          }
          out.push({ id, s: probe.line.project({ x: a.position.x, y: a.position.y, z: a.position.z }) });
        }
        return out.sort((p, q) => p.s - q.s);
      };
      const junctions = stops(def.stopAt, 'junction');
      const shelters = stops(def.shelters, 'shelter');
      if (!junctions || !shelters) return null;
      run = new EscortRun({ points, pace: def.pace, memberCount: order.length, junctions, shelters, playerFar: ESCORT_PLAYER_FAR });
    } catch (err) {
      this.warn(`start("${def.id}") refused: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    if (junctionIndex >= 0) run.restore({ junctionIndex });
    const poses = run.poses();
    const members = new EscortMembers(this.ctx);
    members.build(specs, order.flatMap((o, i) => (o.kind === 'npc' ? [poses[i]] : [])));
    let cart: EscortCart | null = null;
    if (cartIndex >= 0) {
      const saved = cartHealth === null ? cartDefHealth ?? ESCORT_CART.maxHealth : Math.max(cartHealth, ESCORT_CART.maxHealth * ESCORT_CART.reviveFraction);
      cart = new EscortCart(this.ctx, `${def.id}.cart`, poses[cartIndex], saved);
    }
    const r: Running = { def, run, members, order, cart, cartIndex, releaseMode: null, releaseHold: null, unregisterTalk: null, calloutLeft: 0, arrivedSent: false };
    this.cur = r;
    const mm = this.ctx.services.get('movementMode');
    r.releaseMode = mm?.push?.('escort', () => {
      const p = r.run.safePoint();
      return { position: p, yaw: r.run.pose(0).yaw };
    }) ?? null;
    this.registerTalk(r);
    return r;
  }

  private place(r: Running, moving: boolean): void {
    const poses = r.run.poses();
    r.members.place(r.order.flatMap((o, i) => (o.kind === 'npc' ? [poses[i]] : [])), moving);
    if (r.cart && !r.cart.down) r.cart.place(poses[r.cartIndex]);
  }

  private emitRun(r: Running, events: readonly EscortRunEvent[]): void {
    const escortId = r.def.id;
    for (const e of events) {
      if (e.type === 'halted') {
        this.ctx.events.emit('escort.halted', { escortId, reason: e.reason });
        if (e.reason === 'player-far') r.calloutLeft = 0;
      } else if (e.type === 'resumed') this.ctx.events.emit('escort.resumed', { escortId });
      else if (e.type === 'junction') this.ctx.events.emit('escort.junction', { escortId, junction: e.junction });
      else if (e.type === 'arrived' && !r.arrivedSent) {
        r.arrivedSent = true;
        this.ctx.events.emit('escort.arrived', { escortId });
      }
    }
  }

  private callouts(r: Running, dt: number): void {
    if (!r.run.halted.has('player-far')) return;
    r.calloutLeft -= dt;
    if (r.calloutLeft > 0) return;
    r.calloutLeft = ESCORT_ENGINE.calloutSeconds;
    this.ctx.events.emit('hud.toast', { textKey: 'escort.callout', params: { name: this.leadName(r) } });
  }

  private handInHold(r: Running): void {
    if (r.releaseHold) return;
    if (r.run.s < r.run.line.length - ESCORT_ENGINE.handInHoldM) return;
    r.releaseHold = this.ctx.services.get('weather')?.holdClear(ESCORT_ENGINE.holdReason(r.def.id)) ?? null;
  }

  private cartGroupCleared(r: Running): boolean {
    const groups = r.def.threatGroups ?? [];
    if (groups.length > 0) {
      const gs = this.ctx.services.get('groupStanding');
      if (gs) return groups.every((g) => gs.isCleared(g));
    }
    return !!r.cart && !r.members.hostileNear(r.cart.position, ESCORT_KNEEL_CLEAR_RADIUS);
  }

  private registerTalk(r: Running): void {
    const lead = r.members.all[0];
    if (!lead) return;
    r.unregisterTalk = this.ctx.interaction.register({
      id: `escort:${sanitize(r.def.id)}`,
      kind: 'talk',
      name: this.leadName(r),
      radius: 3,
      position: (out) => out.copy(lead.position),
      enabled: () => this.cur === r && r.run.atJunction && !lead.kneeling,
      onInteract: () => {
        const junction = r.run.junctionId;
        const dlg = junction ? r.def.junctionDialogue?.[junction] : undefined;
        if (dlg) this.ctx.services.get('dialogue')?.start(dlg, lead.spec.id);
        else this.ctx.events.emit('hud.toast', { textKey: 'escort.junction.go', params: { name: this.leadName(r) } });
        this.go(r.def.id);
      },
    });
  }

  private leadName(r: Running): string {
    const id = r.members.all[0]?.spec.id ?? '';
    const key = id === 'edric' || id === 'rook' ? `npc.${id}.name` : `escort.member.${id.split('.')[0]}`;
    return this.ctx.strings.t(key);
  }

  private onLoaded(): void {
    const pending = this.loadedThisRound ? this.pendingLoad : { running: null };
    this.loadedThisRound = false;
    this.pendingLoad = null;
    this.teardown();
    const s = pending?.running;
    if (!s || !s.def) return;
    const r = this.build(s.def, Number.isFinite(s.junctionIndex) ? s.junctionIndex : -1, typeof s.cartHealth === 'number' ? s.cartHealth : null);
    if (r) r.members.riseAll();
  }

  private teardown(): void {
    const r = this.cur;
    if (!r) return;
    this.cur = null;
    r.unregisterTalk?.();
    r.releaseMode?.();
    r.releaseHold?.();
    r.cart?.dispose();
    r.members.despawnAll();
  }

  private loader(): NpcModelLoader | null {
    const a = this.ctx.assets as Partial<NpcModelLoader> | null | undefined;
    return a && typeof a.load === 'function' && typeof a.instantiate === 'function' && typeof a.animations === 'function' ? (a as NpcModelLoader) : null;
  }

  private warn(m: string): void {
    console.warn(`[escorts] ${m}`);
  }
}

export { ESCORT_MEMBER };
