// TEST-ONLY stand-in for Gaffer Grimtooth until thread 3b's boss lands (then this file is deleted on the rebase and
// `fightGrimtooth` drives the real one). Not a *.plugin.ts: the plugin manifest never sees it. It spawns a plain hostile
// actor in front of the player and registers it with the REAL boss registry under 'gaffer-grimtooth', so the real
// `boss.*` events, `boss.gaffer-grimtooth.outcome`, the enemies plugin's Calm hold (BOSS_MERCY) and D02 o4 all run.
import * as THREE from 'three';
import type { ChapterHarness } from './chapterHarness';
import { ensure, heal, runHealed } from './phaseA';
import type { GrimBranch } from './phaseB';

export const GRIMTOOTH_ID = 'gaffer-grimtooth';

/** The real boss when one is registered (thread 3b), else the stub; breaks dealt by damage, then the branch. */
export async function fightGrimtooth(h: ChapterHarness, branch: GrimBranch): Promise<void> {
  const ctx = h.ctx;
  // Into the sewer arena; give a real boss (thread 3b) a moment to appear on its own trigger first.
  await h.enterTrigger('trg.underways.arena');
  runHealed(h, 2);
  let state = ctx.bosses.state(GRIMTOOTH_ID);
  if (!state) {
    const c = ctx.anchors.find('underways.arena.centre');
    ensure(c, 'the arena centre anchor');
    await h.teleport({ x: c.position.x, y: c.position.y + 0.05, z: c.position.z + 3 }, 5, 0);
    const f = c.position;
    const actor = ctx.actors.spawn({ kind: GRIMTOOTH_ID, team: 'hostile', maxHealth: 900, maxPoise: 60 });
    const root = new THREE.Object3D();
    root.position.set(f.x, f.y, f.z);
    ctx.scene.add(root);
    (actor as unknown as { root: THREE.Object3D }).root = root;
    ctx.bosses.register(actor.id, { bossId: GRIMTOOTH_ID, nameKey: 'boss.gaffer-grimtooth', phases: [0.66, 0.33], breaksPerPhase: 1, releaseWindowSeconds: 6 });
    state = ctx.bosses.state(GRIMTOOTH_ID);
  }
  ensure(state, 'Grimtooth registered with the boss registry');
  const target = () => ctx.bosses.state(GRIMTOOTH_ID)!;
  const hit = (amount: number, poise: number) =>
    ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: target().actorId, amount, poise, kind: 'melee', direction: new THREE.Vector3(0, 0, -1) });
  // Health and poise breaks by damage, as the Prior's are, until the release window opens (his third break).
  for (let i = 0; i < 12 && !target().releaseOpen && !target().outcome; i++) {
    const s = target();
    // Down through each phase threshold with one hit; in the last phase, poise breaks with a token of damage.
    const next = s.thresholds[s.phase - 1];
    // The stand-in recovers its poise between breaks (a real boss's controller does this itself).
    const body = ctx.actors.get(s.actorId);
    if (body) body.poise = body.maxPoise;
    hit(next === undefined ? 1 : Math.max(1, s.health - s.maxHealth * next + 1), 1e4);
    runHealed(h, 0.5);
  }
  ensure(target().releaseOpen, `Grimtooth's release window opened (${JSON.stringify(target())})`);
  if (branch === 'released') {
    // The real Calm hold: T next to him with Hearth Bread in the bag (the enemies plugin's BOSS_MERCY row).
    const a = ctx.actors.get(target().actorId)!;
    const at = a.worldPosition(new THREE.Vector3());
    await h.approach(at, 1.5);
    heal(h);
    h.hold('KeyT', 0.6);
  } else {
    hit(1e6, 0);
  }
  h.run(2);
}
