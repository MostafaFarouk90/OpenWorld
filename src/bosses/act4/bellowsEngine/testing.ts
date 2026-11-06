// Test-only: the headless-safe way to win the Bellows-Engine (for L13's chain and this thread's real-game driver). It walks the
// rules the player meets: wait out the intro, then in each phase damage it to its floor, wait for the live valve (after the
// volleys), shut it the same way F does, and push it past the threshold; after the third bar, finish it. It never teleports and
// waits out every telegraph by ticking. Throws with a reason when a step does not happen inside its time.
import type { GameContext } from '../../../core/Game';
import { bellowsEngineDirector } from './bellowsEngine.plugin';
import { BELLOWS_BOSS_ID, PRESENTATION } from './tuning';

export interface WinHarness {
  ctx: GameContext;
  /** Advances one fixed tick (1/60 s). */
  step(): void;
}

export function winBellowsForTest(h: WinHarness, opts: { healPlayer?: boolean } = {}): { seconds: number } {
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
    if (!cond()) throw new Error(`winBellowsForTest: ${what} did not happen in ${seconds} s`);
  };
  const enc = () => bellowsEngineDirector()?.current ?? null;
  until('the fight starting (is the player in the arena trigger with both flags set?)', () => !!enc()?.contested, PRESENTATION.introSeconds + 5);
  const hit = (amount: number) => {
    const e = enc();
    if (!e) return;
    h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: e.actor.id, amount, poise: 0, kind: 'melee', attackId: 'test.win' });
  };
  for (let phase = 1; phase <= 3; phase++) {
    until(`the phase ${phase} valve lighting`, () => (enc()?.liveValve ?? -1) >= 0 && !!enc()?.brain.canBreak, 30);
    const e = enc()!;
    hit(e.actor.health);
    const result = e.shutValve(e.liveValve);
    if (result !== 'vented') throw new Error(`winBellowsForTest: the live valve answered ${result}`);
    tick();
    const st = h.ctx.bosses.state(BELLOWS_BOSS_ID);
    if (!st || st.breaks < 1) throw new Error(`winBellowsForTest: no bar broke in phase ${phase}`);
    hit(e.actor.maxHealth);
    if (phase < 3) until(`phase ${phase + 1}`, () => (h.ctx.bosses.state(BELLOWS_BOSS_ID)?.phase ?? 0) > phase, 2);
  }
  until('the defeat', () => h.ctx.state.getString(`boss.${BELLOWS_BOSS_ID}.outcome`) === 'defeated', 2);
  until('the death presentation', () => !enc(), PRESENTATION.deathSeconds + 2);
  return { seconds: ticks * TICK };
}
