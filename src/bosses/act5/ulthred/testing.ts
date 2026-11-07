// Test-only: the headless-safe way to finish D10 (for N11's chain, N12's census and this thread's real-game driver). It walks the
// rules the player meets: wait out the intro; phase 1, for each bar chop him to the floor, wait for a slam's stuck hammer and break
// it with a heavy blow; the floor drop (Cael lands on the Anvil); phase 2, chop to each floor and crack an anvil (the hold-F
// route); phase 3, floors and heavy blows; the ninth break's kneel, then the Heartshard. It never teleports Cael itself (the drop
// does). Cael must stand in the Hammer Hall with `story.d10.started` set. Async: the drop's teleport resolves between ticks.
// Throws with a reason on a stall.
import type { GameContext } from '../../../core/Game';
import { ulthredDirector } from './ulthred.plugin';
import { HALL, ULTHRED, ULTHRED_BOSS_ID, D10_STARTED_FLAG } from './tuning';

export interface WinHarness {
  ctx: GameContext;
  /** Advances one fixed tick (1/60 s). */
  step(): void;
}

const HEAVY = '1H_Melee_Attack_Chop';

export async function winUlthredForTest(h: WinHarness, opts: { healPlayer?: boolean } = {}): Promise<{ seconds: number }> {
  const TICK = 1 / 60;
  let ticks = 0;
  const ctx = h.ctx;
  const tick = async () => {
    h.step();
    ticks++;
    if (opts.healPlayer !== false) {
      const pl = ctx.player.actor;
      if (!pl.dead) pl.health = pl.maxHealth;
    }
    await Promise.resolve();
  };
  const until = async (what: string, cond: () => boolean, seconds: number) => {
    for (let i = 0; i < Math.round(seconds / TICK); i++) {
      if (cond()) return;
      await tick();
    }
    if (!cond()) throw new Error(`winUlthredForTest: ${what} did not happen within ${seconds} s`);
  };
  const d = ulthredDirector();
  if (!d) throw new Error('winUlthredForTest: the ulthred plugin is not running');
  if (!ctx.state.hasFlag(D10_STARTED_FLAG)) throw new Error(`winUlthredForTest: ${D10_STARTED_FLAG} is not set`);
  if (!d.onHallFloor(ctx.player.feet, 0)) throw new Error('winUlthredForTest: Cael is not on the Hammer Hall floor');
  const enc = () => {
    const e = ulthredDirector()?.current;
    if (!e) throw new Error('winUlthredForTest: the fight ended early (did Cael leave the floor, or die?)');
    return e;
  };
  ctx.events.emit('trigger.enter', { triggerId: HALL.trigger, actorId: ctx.player.actor.id });
  await until('the fight to start', () => ulthredDirector()?.current?.contested === true, 10);
  const hit = (amount: number, poise: number) => {
    const e = enc();
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: e.actor.id, amount, poise, kind: 'melee', attackId: HEAVY });
  };
  const toFloor = () => hit(enc().actor.health, 0);
  for (let bar = 0; bar < 9; bar++) {
    const e = enc();
    const phase = Math.floor(bar / 3) + 1;
    if (bar === 3) {
      // The first hit after phase 1's third break crosses 66%: the floor drops.
      toFloor();
      await until('the drop to the Anvil', () => enc().island && !enc().dropping, 12);
    }
    if (bar === 6) toFloor();
    toFloor();
    if (phase === 2) {
      const i = [0, 1, 2].find((k) => enc().crackAnvil(k));
      if (i === undefined) throw new Error(`winUlthredForTest: no anvil could be cracked for bar ${bar + 1}`);
    } else {
      for (let n = 0; n < 20 && e.bars === bar; n++) {
        if (phase === 1) await until(`the stuck hammer (bar ${bar + 1})`, () => enc().brain.stuck, 12);
        else await until(`a breakable moment (bar ${bar + 1})`, () => !['broken', 'drop', 'kneel'].includes(enc().brain.state), 6);
        toFloor();
        hit(1, Math.ceil(ULTHRED.maxPoise / 2));
        await tick();
      }
    }
    if (enc().bars !== bar + 1) throw new Error(`winUlthredForTest: bar ${bar + 1} did not break`);
    if (bar < 8) await until(`the reel after bar ${bar + 1}`, () => enc().brain.state !== 'broken', 4);
  }
  await until('the kneel', () => enc().kneeling, 3);
  enc().heartshard();
  await until('the outcome', () => ctx.state.getFlag(`boss.${ULTHRED_BOSS_ID}.outcome`) === 'defeated', 2);
  await until('the death to play out', () => ulthredDirector()?.current == null, 8);
  return { seconds: ticks * TICK };
}
