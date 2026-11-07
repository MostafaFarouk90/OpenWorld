// The siege (plans/act5-N4.md): provides the `siege` service and one `rules` system after the waves director. No
// persistable: a run is the shipped `waves` entry, orders and the wounded companion are `siege.*` flags, and the roster
// re-derives from the M52 snapshot, so after `save.loaded` the runner is rebuilt from the director.
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import type { SiegeDef } from '../caldera/siege';
import { WAVE_SETS } from '../waves/defs';
import type { WaveDirector } from '../waves/director';
import { cartId } from '../waves/tuning';
import { OFFERED_ORDERS } from './orders.dialogue';
import { siegeRoster, SIEGE_IDS, type SiegeId } from './roster';
import { SET_SIEGE, SIEGE_FLAGS, siegeSetId, SiegeRun } from './runner';
import type { SiegeCurrent, SiegeService } from './service';
import { SIEGE_STRINGS_EN } from './strings.en';
import './events';

const setsOf = (siegeId: SiegeId): string[] => Object.keys(SET_SIEGE).filter((id) => SET_SIEGE[id] === siegeId);

export const SIEGE_DEFS: Readonly<Record<SiegeId, SiegeDef>> = {
  m52: {
    id: 'm52',
    gate: 'caldera.siege.gate',
    lanes: Object.keys(WAVE_SETS['rim-siege'].lanes),
    waves: WAVE_SETS['rim-siege'].waves.map((_, i) => `rim-siege.w${i}`),
    orders: [...OFFERED_ORDERS],
    allyReaders: [],
  },
  r27: {
    id: 'r27',
    gate: 'caldera.tunnel.line',
    lanes: Object.keys(WAVE_SETS['stokers-tunnel-open'].lanes),
    waves: WAVE_SETS['stokers-tunnel'].waves.map((_, i) => `stokers-tunnel.w${i}`),
    orders: ['hold', 'gong'],
    allyReaders: [],
  },
};

/** The plugin's state, one per game (tests build many games). */
export class SiegeController implements SiegeService {
  run: SiegeRun | null = null;
  private readonly offs: Array<() => void> = [];
  private readonly warned = new Set<string>();

  constructor(
    private readonly ctx: GameContext,
    private readonly warnFn: (m: string) => void = (m) => console.warn(`[siege] ${m}`),
  ) {
    this.offs.push(
      // The old run goes before anything loads on top of it (its holds, its companion sit-out); resync builds the new one.
      ctx.events.on('waves.loading', () => this.endRun()),
      ctx.events.on('save.loaded', () => this.resync()),
    );
  }

  private get director(): WaveDirector | null {
    return (this.ctx.services.get('waves') as unknown as WaveDirector | undefined) ?? null;
  }

  private warn(m: string): void {
    if (this.warned.has(m)) return;
    this.warned.add(m);
    this.warnFn(m);
  }

  start(siegeId: SiegeId): boolean {
    const d = this.director;
    if (!d || this.run || !SIEGE_IDS.includes(siegeId) || this.completed(siegeId)) return false;
    const setId = siegeSetId(siegeId, this.ctx.state);
    if (d.current) {
      this.warn(`cannot start '${siegeId}': wave set '${d.current.defId}' is running`);
      return false;
    }
    // A fresh start: no order or wounded flag from an earlier, stopped run.
    this.clearRunFlags(siegeId);
    // The runner listens before the director's first wave starts, so wave 1's events map.
    const run = new SiegeRun(this.ctx, siegeId, d, (m) => this.warn(m));
    this.run = run;
    if (!d.start(setId)) {
      this.warn(`cannot start '${siegeId}': the director refused set '${setId}' (missing anchors?)`);
      run.dispose();
      this.run = null;
      return false;
    }
    run.flush();
    return true;
  }

  stop(): void {
    const id = this.run?.siegeId;
    this.director?.stop();
    this.endRun();
    if (id) this.clearRunFlags(id);
  }

  /** The run's own flags (orders, the wounded companion); never the `done` flag. */
  private clearRunFlags(siegeId: SiegeId): void {
    const st = this.ctx.state;
    for (let n = 0; n <= 4; n++) if (st.getFlag(SIEGE_FLAGS.order(siegeId, n)) !== undefined) st.clearFlag(SIEGE_FLAGS.order(siegeId, n));
    if (siegeId === 'm52' && st.getFlag(SIEGE_FLAGS.wounded) !== undefined) st.clearFlag(SIEGE_FLAGS.wounded);
  }

  private endRun(): void {
    this.run?.dispose();
    this.run = null;
  }

  /** After a load: a siege set the director runs gets its runner back; none, and a stale runner goes. */
  private resync(): void {
    const cur = this.director?.current;
    const siegeId = cur ? SET_SIEGE[cur.defId] : undefined;
    if (this.run && this.run.siegeId !== siegeId) this.endRun();
    if (this.run) {
      // The same siege: rebuild so the roster, dragons and flags re-derive from the loaded state.
      this.endRun();
    }
    if (siegeId && this.director) {
      this.run = new SiegeRun(this.ctx, siegeId, this.director, (m) => this.warn(m));
      this.run.resume();
    }
  }

  get current(): SiegeCurrent | null {
    const r = this.run;
    const d = this.director;
    if (!r || !d?.current) return null;
    return {
      siegeId: r.siegeId,
      wave: r.wave,
      waves: r.waves,
      phase: r.breakPhase ?? 'running',
      gatePct: r.gatePct,
      breached: d.breached,
      storm: r.storm,
    };
  }

  roster(siegeId: SiegeId) {
    return siegeRoster(this.ctx.state, siegeId);
  }

  allies() {
    return this.run?.allies() ?? [];
  }

  rams() {
    return this.run?.rams() ?? [];
  }

  order(id: (typeof OFFERED_ORDERS)[number]): boolean {
    return this.run?.give(id) ?? false;
  }

  orders() {
    return this.run?.offered() ?? [];
  }

  takeCrate(): number {
    return this.run?.takeCrate() ?? 0;
  }

  structures(siegeId: SiegeId): string[] {
    const out = new Set<string>();
    for (const setId of setsOf(siegeId)) {
      const def = WAVE_SETS[setId];
      if (!def) continue;
      out.add(def.barricadeId);
      def.waves.forEach((w, i) => w.carts.forEach((_, n) => out.add(cartId(setId, i, n + 1))));
    }
    return [...out];
  }

  get defs() {
    return SIEGE_DEFS;
  }

  completed(siegeId: SiegeId): boolean {
    return this.ctx.state.getFlag(SIEGE_FLAGS.done(siegeId)) === true;
  }

  fixedUpdate(dt: number): void {
    this.run?.fixedUpdate(dt);
    if (this.run?.finished) this.endRun();
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.endRun();
  }
}

let controller: SiegeController | null = null;

const plugin: GamePlugin = {
  id: 'siege',
  dependsOn: ['core', 'waves'],
  setup(ctx) {
    const c = new SiegeController(ctx);
    controller = c;
    ctx.strings.register('en', SIEGE_STRINGS_EN);
    ctx.services.provide('siege', c);
    ctx.systems.add({ id: 'siege.runner', fixedPhase: 'rules', order: 1, fixedUpdate: (dt) => c.fixedUpdate(dt) });
  },
  dispose() {
    controller?.dispose();
    controller = null;
  },
};

export default plugin;
