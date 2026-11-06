// Test-only: the headless-safe way to win the Eormen fight (for L11's and L13's chains and this thread's real-game driver). It
// walks the rules the player meets: wait out the intro, then in each phase damage him to the floor, wait for the toll to open
// the Last Gong, strike it the way F does, and push him past the threshold; after the third bar, Release him (the registry's
// release, as the hold does) or finish him. It never teleports and waits out every telegraph by ticking. Throws with a reason
// when a step does not happen inside its time.
import type { GameContext } from '../../../core/Game';
import { eormenDirector } from './eormen.plugin';
import { EORMEN_BOSS_ID, PRESENTATION, TOLL } from './tuning';

export interface WinHarness {
  ctx: GameContext;
  /** Advances one fixed tick (1/60 s). */
  step(): void;
}

export function winEormenForTest(
  h: WinHarness,
  opts: { outcome?: 'released' | 'defeated'; healPlayer?: boolean } = {},
): { seconds: number; outcome: 'released' | 'defeated' } {
  const outcome = opts.outcome ?? 'defeated';
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
    if (!cond()) throw new Error(`winEormenForTest: ${what} did not happen in ${seconds} s`);
  };
  const enc = () => eormenDirector()?.current ?? null;
  until('the fight starting (is the player in the nave trigger with D08 active?)', () => !!enc()?.contested, PRESENTATION.introSeconds + 5);
  const hit = (amount: number) => {
    const e = enc();
    if (!e) return;
    h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: e.actor.id, amount, poise: 0, kind: 'melee', attackId: 'test.win' });
  };
  for (let phase = 1; phase <= 3; phase++) {
    const e = enc()!;
    hit(e.actor.health);
    until(`the phase ${phase} toll opening the gong`, () => !!enc()?.brain.windowOpen, Math.max(...TOLL.gap) + 5);
    const result = enc()!.strikeGong('interact');
    if (result !== 'break') throw new Error(`winEormenForTest: the Last Gong answered ${result}`);
    tick();
    const st = h.ctx.bosses.state(EORMEN_BOSS_ID);
    if (!st || st.breaks < 1) throw new Error(`winEormenForTest: no bar broke in phase ${phase}`);
    if (phase < 3) {
      hit(e.actor.maxHealth);
      until(`phase ${phase + 1}`, () => (h.ctx.bosses.state(EORMEN_BOSS_ID)?.phase ?? 0) > phase, 2);
    }
  }
  if (outcome === 'released') {
    until('the release window', () => h.ctx.bosses.state(EORMEN_BOSS_ID)?.releaseOpen === true, 2);
    if (!h.ctx.bosses.release(EORMEN_BOSS_ID)) throw new Error('winEormenForTest: the registry refused the release');
  } else {
    hit(enc()!.actor.maxHealth);
  }
  until(`the outcome ${outcome}`, () => h.ctx.state.getString(`boss.${EORMEN_BOSS_ID}.outcome`) === outcome, 6);
  until('the outcome presentation', () => !enc(), PRESENTATION.deathSeconds + 3);
  return { seconds: ticks * TICK, outcome };
}
