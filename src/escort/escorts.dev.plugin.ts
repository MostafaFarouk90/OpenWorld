// `?escortTest=1` or `cart`: dev only, for the real-game run of plans/act4-L4.md section 5. Starts a test escort (Edric
// and Rook, or the carter and the rain-cask cart) on a 60 m route toward -Z from where the player stands, with a junction
// at 20 m and a shelter at 35 m. `fight` and `cartfight` wait for `__escortDev.begin()`, so a driver can first raise the
// tutorial churchyard's foes (`__escortDev.ambush()`) and stand Cael where the column will meet them.
// `window.__escortDev.storm(true | false)` stands in for L3's weather until it lands. Compiled out of production builds.
import type { GamePlugin } from '../core/plugins';
import type { WeatherKind } from '../weather/types';
import type { Act4EscortDef } from './EscortEngine';

export const ESCORT_TEST_ID = 'dev.escort-test';

const plugin: GamePlugin = {
  id: 'escorts-dev',
  dependsOn: ['core', 'escorts'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const mode = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('escortTest') : null;
    if (!mode) return;
    let weatherKind: WeatherKind = 'clear';
    const holds: string[] = [];
    if (!ctx.services.get('weather')) {
      (ctx.services.provide as (n: string, v: unknown) => void)('weather', {
        state: () => ({ kind: weatherKind, t: 0, forced: false, held: holds.length > 0 }),
        holdClear: (r: string) => {
          holds.push(r);
          return () => void holds.splice(holds.indexOf(r) >>> 0, 1);
        },
        forceStorm: () => () => {},
        clock: { seed: 0, next: () => ({ kind: 'clear', at: Infinity }) },
        onShelter: () => false,
      });
    }
    (globalThis as Record<string, unknown>).__escortDev = {
      storm(on: boolean) {
        const from = weatherKind;
        weatherKind = on && holds.length === 0 ? 'storm' : 'clear';
        if (from !== weatherKind) ctx.events.emit('weather.changed', { kind: weatherKind, from });
        return weatherKind;
      },
      state: () => ctx.services.get('escortsAct4')?.state(ESCORT_TEST_ID) ?? null,
      view: () => ctx.services.get('escortsAct4')?.view() ?? null,
      go: () => ctx.services.get('escortsAct4')?.go(ESCORT_TEST_ID) ?? false,
      /** Raises the tutorial churchyard's group, angry at once; answers where its foes stand. */
      ambush() {
        const ids = ctx.services.get('enemies')?.spawnGroup('t05.churchyard', { aggro: true }) ?? [];
        return ids.map((id) => {
          const p = ctx.actors.get(id)?.root?.position;
          return p ? { x: p.x, y: p.y, z: p.z } : null;
        });
      },
      /** `fight` modes: the test escort starts only now, from where Cael stands. */
      begin() {
        armed = true;
      },
      /** The lead's position (for the driver). */
      lead() {
        const lead = [...ctx.actors.all()].find((a) => a.data['escortMember'] !== undefined && !a.dead);
        const p = lead?.root?.position;
        return lead && p ? { id: String(lead.data['escortMember']), x: p.x, y: p.y, z: p.z } : null;
      },
    };
    // the route's origin survives a reload (localStorage), so a Continue finds the anchors its save names
    const ORIGIN_KEY = 'owg.escortDev.origin';
    const defineAnchors = (o: { x: number; y: number; z: number }) => {
      const put = (id: string, dz: number) => {
        if (!ctx.anchors.find(id)) ctx.anchors.define({ id, position: { x: o.x + 3, y: o.y, z: o.z - dz }, yaw: 0 });
      };
      put('dev.escort.start', 0);
      put('dev.escort.end', 60);
      put('dev.escort.j1', 20);
      put('dev.escort.sh1', 35);
    };
    try {
      const raw = localStorage.getItem(ORIGIN_KEY);
      if (raw) defineAnchors(JSON.parse(raw) as { x: number; y: number; z: number });
    } catch {
      // no storage: a reload starts a fresh test escort
    }
    const cart = mode.includes('cart');
    let armed = !mode.includes('fight');
    let started = false;
    ctx.systems.add({
      id: 'escorts-dev',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => {
        if (!started) {
          if (!armed || ctx.services.get('save')?.loading) return;
          started = true;
          // a Continue already rebuilt the saved escort
          if (ctx.services.get('escortsAct4')?.active()) return;
          const f = ctx.player.feet;
          const origin = { x: f.x, y: f.y, z: f.z };
          try {
            localStorage.setItem(ORIGIN_KEY, JSON.stringify(origin));
          } catch {
            // ignore
          }
          defineAnchors(origin);
          const def: Act4EscortDef = {
            id: ESCORT_TEST_ID,
            members: cart ? [{ id: 'carter', kind: 'npc' }, { id: 'cart.rain', kind: 'cart' }] : [{ id: 'edric', kind: 'npc' }, { id: 'rook', kind: 'npc' }],
            route: ['dev.escort.start', 'dev.escort.end'],
            pace: cart ? 1.5 : 2,
            stopAt: ['dev.escort.j1'],
            shelters: ['dev.escort.sh1'],
            kneelOnHit: true,
          };
          console.info(`[escorts-dev] start -> ${String(ctx.services.get('escortsAct4')?.start(def))}`);
          return;
        }
      },
    });
  },
};

export default plugin;
