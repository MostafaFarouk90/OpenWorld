// Plugin `after-ending` (Act 5 N13, plans/act5-N13.md; contracts v0.9 item 10; Q1 (a)): the world after the ending.
// Everything is derived from `world.afterEnding` and the M56 flags, so a load re-derives it and nothing changes before
// the ending. This plugin owns the waking (`afterEnding.wake()`, which N12's ending director awaits), the tint's look
// (attached to N0's `worldTint`) and the dragon flights. The rest of the after state lives as flag rows in its owners'
// files (Harrowmark's gates, ash state, fountain and townsfolk; the vendors', trainers' and talk posts; the companions'
// bench post; the map label), each listed in this folder's README.
//
// Dev: `?afterEnding=rekindle|let-it-die[&caelDied]` (with `?act5=m56&new`) writes the ending's flags and wakes.
import type { GamePlugin } from '../core/plugins';
import type { GameContext } from '../core/Game';
import { heightAt } from '../terrain/heightfield';
import { showToast } from '../waystones/toast';
import { AFTER_ENDING_FLAG, CAEL_LIVES_FLAG, endingChoice, M56_CHOICE_FLAG } from './flags';
import { AfterEndingLook } from './look';
import { AFTER_ENDING_STRINGS_EN } from './strings.en';
import { AfterEnding } from './wake';
import '../caldera/worldTint';

export const AFTER_ENDING_SYSTEM_ID = 'after-ending.look';

let offs: Array<() => void> = [];

/** The plugin's parts, for tests: the service and the look (null headless with no camera). */
export interface AfterEndingParts {
  service: AfterEnding;
  look: AfterEndingLook | null;
}
let parts: AfterEndingParts | null = null;
export const afterEndingParts = (): AfterEndingParts | null => parts;

export function setupAfterEnding(ctx: GameContext, opts: { groundAt?: (x: number, z: number) => number } = {}): () => void {
  const groundAt = opts.groundAt ?? heightAt;
  const local: Array<() => void> = [];
  const warn = (m: string) => console.warn(`[after-ending] ${m}`);
  local.push(ctx.strings.register('en', AFTER_ENDING_STRINGS_EN) ?? (() => {}));

  const tint = ctx.services.get('worldTint');
  if (!tint) warn('the worldTint service is missing (act5-core); the world after the ending keeps the shipped look');

  const service = new AfterEnding({
    flags: ctx.state,
    groundAt,
    teleport: (feet, yaw) => {
      const ws = ctx.services.get('waystones');
      return ws ? ws.safeTeleport(feet, yaw) : Promise.resolve({ ok: false });
    },
    setTint: (choice) => tint?.set(choice),
    show: (key) => showToast(ctx.hud, ctx.strings.t(key), 6000),
    warn,
  });
  local.push(ctx.services.provide('afterEnding', service));
  // A load ends the session's waking (a load before the choice replays it, and N12 awaits wake() again).
  local.push(ctx.events.on('save.loaded', () => service.reset()));

  // The tint follows the flags on setup, on every change and on every load (a load never wakes).
  const sync = (): void => tint?.set(endingChoice(ctx.state));
  local.push(ctx.gates.flag(AFTER_ENDING_FLAG, sync));
  local.push(ctx.gates.flag(M56_CHOICE_FLAG, sync));

  let look: AfterEndingLook | null = null;
  if (tint) {
    look = new AfterEndingLook({
      scene: ctx.scene,
      camera: () => (ctx.camera ? ctx.camera.position : null),
      indoors: () => !!(ctx.services.get('interiors') as { current: string | null } | undefined)?.current,
      groundAt,
      flyby: (actorId, on) => ctx.events.emit('dragon.flight', { actorId, on }),
    });
    const l = look;
    local.push(tint.attach((key) => l.set(key)));
    local.push(ctx.events.on('save.loaded', () => l.onLoaded()));
    local.push(ctx.systems.add({ id: AFTER_ENDING_SYSTEM_ID, renderPhase: 'world', order: 913, render: (_a: number, frameTime: number) => l.step(frameTime) }));
    local.push(() => l.dispose());
  }
  parts = { service, look };
  local.push(() => {
    parts = null;
  });

  if (import.meta.env.DEV) local.push(devHook(ctx, service));
  return () => {
    for (const off of local.splice(0).reverse()) off();
  };
}

/** `?afterEnding=rekindle|let-it-die[&caelDied]`: writes the ending's flags (as N11 and N12 will) and wakes, once. */
function devHook(ctx: GameContext, service: AfterEnding): () => void {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const choice = q?.get('afterEnding');
  if (!choice) return () => {};
  if (choice !== 'rekindle' && choice !== 'let-it-die') {
    console.warn(`[after-ending] unknown ending '${choice}' (rekindle or let-it-die)`);
    return () => {};
  }
  let wait = 3;
  let done = false;
  return ctx.systems.add({
    id: 'after-ending.dev',
    fixedPhase: 'rules',
    order: 902,
    fixedUpdate: (dt) => {
      if (done || ctx.services.get('save')?.loading) return;
      // Under `?act5=m56&new` wait for N0's jump to have played everything before M56 (it lands the player too).
      if (q?.has('act5') && ctx.state.getFlag('story.d10.complete') !== true) return;
      wait -= dt;
      if (wait > 0) return;
      done = true;
      ctx.state.setFlag(M56_CHOICE_FLAG, choice);
      ctx.state.setFlag(CAEL_LIVES_FLAG, !q?.has('caelDied'));
      ctx.state.setFlag('story.gate.end', true);
      ctx.state.setFlag(AFTER_ENDING_FLAG, true);
      void service.wake().then(() => console.info(`[after-ending] woke: ${service.lines.join(', ')}`));
    },
  });
}

const plugin: GamePlugin = {
  id: 'after-ending',
  dependsOn: ['core', 'act5-core'],
  setup(ctx) {
    offs.push(setupAfterEnding(ctx));
  },
  dispose() {
    for (const off of offs.splice(0).reverse()) off();
    offs = [];
  },
};

export default plugin;
