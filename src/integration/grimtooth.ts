// Gaffer Grimtooth (thread 3b's boss) driven headless for the Act 1 runs: into the Underways arena through its real
// trigger, the intro, then breaks by damage the way his plugin test does (phase 1 break, the phase 2 crossing, the
// phase 3 crossing that opens the window), then the real Calm hold (T next to him with Hearth Bread) or a lethal hit.
import * as THREE from 'three';
import { ARENA, GRIMTOOTH, GRIMTOOTH_BOSS_ID } from '../bosses/grimtooth/tuning';
import type { ChapterHarness } from './chapterHarness';
import { ensure, heal, runHealed } from './phaseA';
import type { GrimBranch } from './phaseB';

export async function fightGrimtooth(h: ChapterHarness, branch: GrimBranch): Promise<void> {
  const ctx = h.ctx;
  await h.enterTrigger(ARENA.arenaTrigger);
  // The intro, then he registers with the boss registry.
  for (let i = 0; i < 20 && !ctx.bosses.state(GRIMTOOTH_BOSS_ID); i++) runHealed(h, 0.5);
  ensure(ctx.bosses.state(GRIMTOOTH_BOSS_ID), 'Grimtooth registered after his intro');
  const state = () => ctx.bosses.state(GRIMTOOTH_BOSS_ID)!;
  const hit = (amount: number, poise: number) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: state().actorId, amount, poise, kind: 'melee', direction: new THREE.Vector3(0, 0, -1) });
  const toFraction = (f: number) => hit(state().health - state().maxHealth * f, GRIMTOOTH.maxPoise);
  const settle = () => runHealed(h, GRIMTOOTH.breakSeconds + 0.3);
  hit(1, GRIMTOOTH.maxPoise);
  settle();
  toFraction(0.6);
  ensure(state().phase === 2, `Grimtooth in phase 2 (${JSON.stringify(state())})`);
  settle();
  toFraction(0.3);
  ensure(state().releaseOpen, `Grimtooth's release window opened (${JSON.stringify(state())})`);
  if (branch === 'released') {
    const a = ctx.actors.get(state().actorId)!;
    await h.approach(a.worldPosition(new THREE.Vector3()), 1.5);
    heal(h);
    h.hold('KeyT', 0.6);
  } else {
    hit(1e6, 0);
  }
  h.run(2);
}
