// Test-only: the headless-safe way to finish the Vey duel (for N11's D09 chain, N12's census and this thread's real-game driver).
// It walks the rules the player meets: wait out the intro, then for each bar chop him to the bar's floor and break it with heavy
// blows (the Knight's chop id, x 2 poise), waiting out the stagger and the surge each time; at the fourth break the Spare window
// opens: 'spared' completes the real hold-T Spare interactable (the enemies service's, so the mercy event and its ledger pay as in
// play; the registry's Spare when no enemies service runs), 'defeated' strikes him once after the window's grace. It never
// teleports and waits out every telegraph by ticking. Cael must stand on the ring floor (N2's Foundry floor 3) with
// `story.d09.started` set. Throws with a reason on a stall.
import type { GameContext } from '../../../core/Game';
import { veyDirector } from './vey.plugin';
import { bossMercyInteractableId } from '../../../enemies/mercy';
import { ARENA, VEY, VEY_BOSS_ID } from './tuning';

export interface WinHarness {
  ctx: GameContext;
  /** Advances one fixed tick (1/60 s). */
  step(): void;
}

const HEAVY = '1H_Melee_Attack_Chop';

export function winVeyForTest(h: WinHarness, outcome: 'spared' | 'defeated', opts: { healPlayer?: boolean } = {}): { seconds: number } {
  const TICK = 1 / 60;
  let ticks = 0;
  const tick = () => {
    h.step();
    ticks++;
    if (opts.healPlayer !== false) {
      const pl = h.ctx.player.actor;
      pl.health = pl.maxHealth;
    }
  };
  const until = (what: string, cond: () => boolean, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      if (cond()) return;
      tick();
    }
    if (!cond()) throw new Error(`winVeyForTest: ${what} did not happen within ${seconds} s`);
  };
  const ctx = h.ctx;
  const live = () => ctx.bosses.state(VEY_BOSS_ID);
  const state = () => {
    const s = live();
    if (!s) throw new Error('winVeyForTest: the duel ended early (did Cael leave the ring floor, or die?)');
    return s;
  };
  const d = veyDirector();
  if (!d) throw new Error('winVeyForTest: the vey plugin is not running');
  if (!ctx.state.hasFlag('story.d09.started')) throw new Error('winVeyForTest: story.d09.started is not set');
  if (!d.onFloor(ctx.player.feet, 0)) throw new Error('winVeyForTest: Cael is not on the ring floor (Foundry floor 3)');
  ctx.events.emit('trigger.enter', { triggerId: ARENA.trigger, actorId: ctx.player.actor.id });
  until('the duel to start', () => live() !== null && veyDirector()!.current?.contested === true, 10);
  const hit = (amount: number, poise: number) => {
    const s = state();
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: s.actorId, amount, poise, kind: 'melee', attackId: HEAVY });
  };
  for (let bar = 0; bar < VEY.breaksPerPhase; bar++) {
    hit(state().health, 0);
    until(`bar ${bar + 1} to be breakable`, () => veyDirector()!.current?.brain.invulnerable === false && ['idle', 'approach', 'glow', 'between', 'recover', 'shockTell', 'shockRing', 'parried'].includes(veyDirector()!.current!.brain.state), 8);
    for (let n = 0; n < 12 && state().breaks === bar; n++) {
      hit(1, Math.ceil(VEY.maxPoise / 2));
      tick();
    }
    if (state().breaks !== bar + 1) throw new Error(`winVeyForTest: bar ${bar + 1} did not break`);
  }
  until('the Spare window', () => live()?.releaseOpen === true, 3);
  if (outcome === 'spared') {
    // Test-only reach into the interaction registry: the enemies service's hold-T interactable, completed as the hold does.
    const hold = (ctx.interaction as unknown as { items?: Map<string, { onInteract?: () => void }> }).items?.get(bossMercyInteractableId(VEY_BOSS_ID));
    if (hold?.onInteract) hold.onInteract();
    else ctx.bosses.release(VEY_BOSS_ID);
  } else {
    for (let i = 0; i < Math.ceil(VEY.strikeGrace / TICK) + 1; i++) tick();
    // A blow inside the grace is held at 1 HP (the window can open a tick after releaseOpen reads true): strike again each tick
    // until one lands, for up to 2 s.
    for (let i = 0; i < Math.ceil(2 / TICK) && ctx.state.getFlag(`boss.${VEY_BOSS_ID}.outcome`) !== outcome; i++) {
      hit(1, 0);
      tick();
    }
  }
  until('the outcome', () => ctx.state.getFlag(`boss.${VEY_BOSS_ID}.outcome`) === outcome, 2);
  until('the outcome to play out', () => veyDirector()!.current === null, 8);
  return { seconds: ticks * TICK };
}
