import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { asHtml, hudDocument } from '../soft';
import { StormMeter, type StormReading } from './StormMeter';
import { ShelterArrow, type XZPoint } from './ShelterArrow';
import { ACT4_HUD_STRINGS_EN } from './strings.en';
import { maskActive } from '../../weather/stormLook';
import { EXPOSURE, STORM_CLOCK } from '../../weather/tuning';
import type { WeatherService } from '../../weather/types';
import { SHELTER_SPOTS, nearestRope, pointAt, ropeLine } from '../../region/act4/ropeLines';
import '../../weather/types';

/** The mask chip shows once the player can have a mask: M42 gives it (L3's `ASH_MASK.flag` is its completion). */
export const MASK_KNOWN_FLAG = 'story.m42.started';

/**
 * The Act 4 HUD's own styles, in their own sheet as Act 3's are. The interaction prompt rule fixes the F/T prompt that drew in
 * the browser's default serif font (Phase G playthrough L3): the prompt widget never had a font rule.
 */
export const ACT4_HUD_CSS = `
.owg-storm{width:260px;pointer-events:none;margin-top:6px;font:12px/1.25 system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
.owg-storm-head{display:flex;align-items:baseline;gap:8px;margin-bottom:3px}
.owg-storm-text{flex:1}
.owg-storm-mask{font-size:11px;padding:0 6px;border-radius:3px;border:1px solid rgba(255,255,255,.25)}
.owg-storm-mask-on{color:#cfe8c0;border-color:#6f9a5a}
.owg-storm-mask-off{color:#e0a080;border-color:#a0603a}
.owg-bar-storm{height:6px}
.owg-storm-clear .owg-bar-fill{background:#8a8580}
.owg-storm-warning .owg-bar-fill{background:#d8a040}
.owg-storm-storm .owg-bar-fill{background:#c0503a}
.owg-storm-line{margin-top:3px;font-size:11px;opacity:.9}
.owg-storm-exposed .owg-storm-line{color:#ff9a7a}
.owg-shelter{display:flex;align-items:center;gap:6px;margin-top:4px;pointer-events:none;font:12px system-ui,sans-serif;color:#f0d890;text-shadow:0 1px 2px #000}
.owg-shelter-arrow{display:inline-block;width:14px;text-align:center;transition:transform .1s linear}
.owg-journal .journal-note{margin:0 0 12px;padding:8px 10px;border-left:3px solid #e0b040;background:rgba(240,216,144,.08);border-radius:3px}
.owg-journal .journal-note-title{margin:0;color:#f0d890}
.owg-journal .journal-note ul{margin:4px 0 0;padding-left:18px}
.interaction-prompt{font:15px/1.3 system-ui,sans-serif;color:#f3ead8;text-shadow:0 1px 2px #000}
`;

const STYLE_ID = 'owg-act4-style';
function injectAct4Css(): void {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = ACT4_HUD_CSS;
  document.head.appendChild(el);
}

/**
 * The longest each clock phase runs (L3's base plus its jitter). The bar measures the time left against this, not against the
 * runtime's `state().t`, which restarts when the player crosses the Waste's edge and would show a running storm as fresh.
 */
export const PHASE_SECONDS = {
  clear: STORM_CLOCK.clear + STORM_CLOCK.clearJitter,
  warning: STORM_CLOCK.warning,
  storm: STORM_CLOCK.storm + STORM_CLOCK.stormJitter,
} as const;

/** L3's runtime extras the meter reads when the provider is the shipped `WeatherRuntime` (duck-typed, all optional). */
interface WeatherExtras {
  inRegion?: boolean;
  exposedSeconds?: number;
  currentShelter?: string | null;
  onRope?(x: number, z: number): boolean;
  shelterPoints?(): readonly { id: string; x: number; z: number }[];
}

/** The nearest rope point as the arrow wants it, from L1's rope index. */
export function nearestRopePoint(x: number, z: number): ({ id: string } & XZPoint) | null {
  const n = nearestRope(x, z);
  if (!n) return null;
  const p = pointAt(ropeLine(n.lineId).points, n.arc);
  return { id: n.lineId, x: p.x, z: p.z };
}

/**
 * Act 4 L9: the storm meter, the mask chip and the shelter arrow (plans/act4-L9.md section 1). Every reading is soft: with no
 * `weather` service (a reduced manifest, or Acts 1 to 3 only) nothing shows and nothing throws.
 */
const act4Hud: GamePlugin = {
  id: 'act4-hud',
  dependsOn: ['core', 'hud'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', ACT4_HUD_STRINGS_EN);
    injectAct4Css();
    const doc = hudDocument();
    const t = (key: string, params?: Record<string, string | number>): string => ctx.strings.t(key, params);
    const weather = (): (WeatherService & WeatherExtras) | undefined =>
      (ctx.services as unknown as { get(n: string): unknown }).get('weather') as (WeatherService & WeatherExtras) | undefined;

    // The last `storm.exposed` seconds, for a provider without the getter; cleared when the storm ends and on load.
    let exposedEvent = 0;
    let boss = false;
    const offs = [
      ctx.events.on('storm.exposed', (e) => {
        exposedEvent = typeof e?.seconds === 'number' ? e.seconds : 0;
      }),
      ctx.events.on('weather.changed', (e) => {
        if (e?.kind !== 'storm') exposedEvent = 0;
      }),
      ctx.events.on('shelter.entered', () => {
        exposedEvent = 0;
      }),
      ctx.events.on('save.loaded', () => {
        exposedEvent = 0;
        boss = false;
      }),
      // The boss bar owns the top of the screen during a fight (plan section 1): the meter steps aside.
      ctx.events.on('boss.started', () => {
        boss = true;
      }),
      ...(['boss.defeated', 'boss.released', 'boss.ended'] as const).map((type) =>
        ctx.events.on(type, () => {
          boss = false;
        }),
      ),
    ];

    const read = (): StormReading | null => {
      const w = weather();
      if (!w || boss) return null;
      const s = w.state();
      const f = ctx.player.feet;
      // The shipped runtime knows whether the player is outdoors in the Waste; another provider says so by its weather.
      const inRegion = typeof w.inRegion === 'boolean' ? w.inRegion : s.kind !== 'clear';
      const next = w.clock?.next?.();
      const exposed = typeof w.exposedSeconds === 'number' ? w.exposedSeconds : exposedEvent;
      const sheltered = typeof w.currentShelter === 'string' && w.currentShelter !== '';
      const onRope = typeof w.onRope === 'function' ? w.onRope(f.x, f.z) === true : false;
      const p = ctx.actors.player;
      const atFloor = p && p.maxHealth > 0 ? p.health <= p.maxHealth * EXPOSURE.floor + 1e-6 : false;
      const nextIn = next && Number.isFinite(next.at) ? next.at : null;
      const phase = PHASE_SECONDS[s.kind as keyof typeof PHASE_SECONDS];
      return {
        inRegion,
        kind: s.kind,
        t: nextIn !== null && typeof phase === 'number' ? Math.max(0, phase - nextIn) : s.t,
        forced: s.forced,
        held: s.held,
        nextIn,
        exposed,
        onRope,
        sheltered,
        atFloor,
      };
    };

    const meter = new StormMeter(doc, {
      t,
      read,
      mask: () => maskActive(ctx),
      maskKnown: () => ctx.state.getBool(MASK_KNOWN_FLAG),
    });
    ctx.hud.mount('top-center', { id: meter.id, element: asHtml(meter.element), order: 6, update: () => meter.update(), dispose: () => meter.dispose() });

    const arrow = new ShelterArrow(doc, {
      t,
      // The arrow follows the meter: the ash is up, and the player is neither sheltered nor on a rope.
      active: () => {
        const v = meter.view;
        return !!v && v.phase !== 'clear' && v.line !== 'rope' && v.line !== 'shelter';
      },
      player: () => ({ x: ctx.player.feet.x, z: ctx.player.feet.z }),
      cameraYaw: () => ctx.cameraRig?.yaw ?? ctx.player.facingYaw,
      shelters: () => weather()?.shelterPoints?.() ?? SHELTER_SPOTS.map((s) => ({ id: s.id, x: s.at.x, z: s.at.z })),
      nearestRope: nearestRopePoint,
    });
    // Mounted after the meter in the same slot, so it reads the meter's view of this frame.
    ctx.hud.mount('top-center', { id: arrow.id, element: asHtml(arrow.element), order: 7, update: () => arrow.update(), dispose: () => arrow.dispose() });

    ctx.systems.add({
      id: 'act4-hud.teardown',
      dispose() {
        for (const off of offs.splice(0)) off();
      },
    });
  },
};

export default act4Hud;
