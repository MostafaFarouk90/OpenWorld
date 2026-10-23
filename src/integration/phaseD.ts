import * as THREE from 'three';
import type { ChapterHarness } from './chapterHarness';
import { carryTo, ensure, heal } from './phaseA';
import { useAt } from './phaseB';
import {
  drainDialogue, emptyPhaseCTrail, flagDone, pick, playPhaseCQuest, quests, talk,
  type DriverTables, type Handler, type PhaseCOptions, type PhaseCTrail,
} from './phaseC';
import { OLDSMOKE_CARRY } from '../quests/content/act2/oldsmoke';
import { OLDSMOKE_PACE } from '../quests/content/act2/oldsmoke/pacing';
import { M17R08_PACE } from '../quests/content/act2/oldsmoke/mines/m17r08.pacing';
import { M18M19_PACE } from '../quests/content/act2/oldsmoke/mines/m18m19.pacing';
import { M20D04_PACE } from '../quests/content/act2/oldsmoke/mines/m20d04.pacing';
import { PHASE_D_DESIGN, estimatePaceRow, trailNodes, type PaceRowLike, type TimingRow } from './timing';
import { M16_BRAZIER, M16_BRAZIER_ID } from '../quests/content/act2/oldsmoke/m16.quest';
import { BELLOWS_LIT_FLAG, BELLOWS_PLAQUE, BELLOWS_SHRINE_ID, BELLOWS_SOLVED_FLAG } from '../quests/content/act2/oldsmoke/mines/m18.quest';
import { M17_MINERS } from '../quests/content/act2/oldsmoke/mines/m17.quest';
import { D04_OUTCOME_FLAG } from '../quests/content/act2/oldsmoke/mines/d04.quest';
import { M21_WITHDRAW_TRIGGER } from '../quests/content/act2/oldsmoke/m21.quest';
import { M19_NURSERY_TRIGGER, M19_ROUTE_TRIGGER } from '../quests/content/act2/oldsmoke/mines/m19.quest';
import { M19_ROUTE_PREFIX } from '../quests/content/act2/oldsmoke/mines/m18m19.director';
import { ROUTE_FOLLOW_MPS } from './timing';
import { M20_ORSK_GONE } from '../quests/content/act2/oldsmoke/mines/m20.quest';
import { D04_POOLS, ringPoint } from '../quests/content/act2/oldsmoke/mines/m20d04.pools';
import { BELLOWS } from '../shrine/weepingBellows.tuning';
import { bellowsLayout } from '../shrine/weepingBellows.visuals';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import { ARENA, PRESENTATION, SLAGMAW, SLAGMAW_BOSS_ID, SLAGMAW_KIND } from '../bosses/slagmaw/tuning';
import { slagmawDirector } from '../bosses/slagmaw/slagmaw.plugin';
import { OLDSMOKE_PROPS } from '../quests/content/act2/oldsmoke';

/**
 * Phase D (Oldsmoke and Deepgate), played on a game booted from a Phase C complete save with the same driver as Phase C
 * (`phaseC.ts`): dialogue by key presses, interactables and carries by F at the real anchors, enemies killed as the player
 * through the damage service, triggers entered by teleport. What has no cheap headless driver (the Weeping Bellows puzzle's
 * Surge-lit braziers, the stealth sections' watch loop, which is teleported through) is recorded in
 * `trail.scripted`, so the e2e tests name exactly what was a shortcut.
 */

export type PhaseDQuest = 'm16' | 'm17' | 'r09' | 'r08' | 'm18' | 'r10' | 'm19' | 'm20' | 'm21' | 'd04' | 'm22';
/** In play order (plan Part 7): M22 waits for every other quest of the act. */
export const PHASE_D_ORDER: readonly PhaseDQuest[] = ['m16', 'm17', 'r09', 'r08', 'm18', 'r10', 'm19', 'm20', 'm21', 'd04', 'm22'];

/** Who offers each quest (the dialogue that carries its `startQuest`). */
export const PHASE_D_GIVERS: Record<PhaseDQuest, string> = {
  m16: 'osgar', m17: 'slagg', r09: 'slagg', r08: 'pickett', m18: 'pike', r10: 'slagg', m19: 'wenna', m20: 'wenna', m21: 'wenna', d04: 'slagg', m22: 'wystan',
};

/** Run A: the first branch of every choice (R09 stewards, R10 miners, M21 confront with proof). */
export const PHASE_D_RUN_A: Record<string, number[]> = {};
/** Run B, mercy-heavy: the second branch (R09 miners, R10 compromise, M21 spy). */
export const PHASE_D_RUN_B: Record<string, number[]> = { 'r09.choice': [2], 'r10.choice': [3], 'm21.audience': [2] };

const ALL_CARRY = OLDSMOKE_CARRY;

const HANDLERS: Record<string, Handler> = {
  // M16: the dead brazier is a prop; lighting it raises the rekindle the quest credits
  'm16.brazier': async (h) => {
    const prop = OLDSMOKE_PROPS.find((p) => p.interactableId === M16_BRAZIER);
    ensure(prop, 'the M16 brazier prop');
    await useAt(h, prop.anchorId, prop.interactableId, 1.1, [1.8, 2.5]);
    ensure(h.of('waystone.rekindled').some((e) => e.waystoneId === M16_BRAZIER_ID), 'the brazier was lit');
  },
};

/** The pacing rows of the eleven quests, in play order: the surface quests' (with their branches) and the mines'. */
export const PHASE_D_PACE_ROWS: readonly (PaceRowLike & { branch?: string })[] = [
  ...OLDSMOKE_PACE, ...M17R08_PACE, ...M18M19_PACE, ...M20D04_PACE,
];
/** The branch whose row measures a run (R10's compromise and R09's miners share the shorter row; their extra talks are in the nodes). */
const PACE_BRANCH: Record<'A' | 'B', Record<string, string>> = {
  A: { r09: 'stewards', r10: 'miners', m21: 'confront' },
  B: { r09: 'stewards', r10: 'miners', m21: 'spy' },
};

/** Each quest's estimate for a run: the quest's pacing row on the real anchors, with the dialogue nodes the run actually read. */
export function phaseDTiming(h: ChapterHarness, trails: Record<string, PhaseDTrail>, run: 'A' | 'B'): TimingRow[] {
  const at = (id: string) => h.anchor(id);
  return PHASE_D_ORDER.map((q) => {
    const rows = PHASE_D_PACE_ROWS.filter((r) => r.quest === q);
    const row = rows.find((r) => r.branch === PACE_BRANCH[run][q]) ?? rows[0];
    return estimatePaceRow(row, PHASE_D_DESIGN[q], at, trailNodes(trails[q]));
  });
}

/** Carries every undelivered item of the quest objective, one after the other. */
const carryAll = (q: string, o: string): Handler => async (h) => {
  const left = () => ALL_CARRY.filter((c) => c.questId === q && c.objectiveId === o && !h.ctx.state.getBool(c.deliveredFlag));
  for (let guard = 0; guard < 8 && left().length > 0; guard++) {
    const c = left()[0];
    await carryTo(h, c.homeAnchor, c.destination, c.deliveredFlag);
  }
  ensure(left().length === 0, `${q}.${o}: every item carried`);
};

Object.assign(HANDLERS, {

  'm16.silence': (h, t) => talk(h, t, 'aldous'),
  'r09.chests': carryAll('r09', 'chests'),
  'r09.clerk': (h, t) => talk(h, t, 'steward-market-2'),
  'r09.choice': (h, t, o) => talk(h, t, 'slagg', pick(o, 'r09.choice', [1])),
  'r09.report': (h, t) => talk(h, t, 'slagg'),
  'r10.choice': (h, t, o) => talk(h, t, 'slagg', pick(o, 'r10.choice', [1])),
  'r10.talks': async (h, t) => {
    for (const npc of ['miner-1', 'steward-market-1', 'steward-market-2']) await talk(h, t, npc, [1]);
  },
  'm17.thanks': async (h, t) => {
    for (const npc of M17_MINERS) await talk(h, t, npc);
  },
  'm17.miners': carryAll('m17', 'miners'),
} satisfies Record<string, Handler>);


const focusOf = (h: ChapterHarness): string | undefined =>
  (h.ctx.interaction as unknown as { focusFor(a: string): { id: string } | null }).focusFor('interact')?.id;

/** F on an interactable that stands at a point (not an anchor): the eight sides, nearer second, until it is in focus. */
async function useAtPoint(h: ChapterHarness, point: THREE.Vector3Like, id: string): Promise<void> {
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  search: for (const d of [1.1, 0.7, 1.8]) {
    for (const [x, z] of sides) {
      await h.approach(point, d, { x, z });
      h.run(2);
      if (focusOf(h) === id) break search;
    }
  }
  ensure(focusOf(h) === id, `${id} in focus (focus ${focusOf(h) ?? 'none'})`);
  h.press('KeyF');
  h.run(2);
}

/** Turns each valve of a ring `turns[i]` times (the player's own presses), inside the clock. */
async function turnValves(h: ChapterHarness, ids: string[], points: THREE.Vector3Like[], turns: readonly number[]): Promise<void> {
  for (let i = 0; i < ids.length; i++) {
    for (let n = 0; n < turns[i]; n++) {
      await useAtPoint(h, points[i], ids[i]);
      heal(h);
    }
  }
}

/** M18: the Weeping Bellows' valves by hand; the Surge that lights each brazier is the spell event the cast raises. */
async function solveBellows(h: ChapterHarness, t: PhaseCTrail): Promise<void> {
  const c = h.anchor(BELLOWS.centerAnchor);
  const layout = bellowsLayout(c);
  await turnValves(h, layout.valves.map((_, i) => `valve:${BELLOWS.valvePrefix}-${i + 1}`), layout.valves, BELLOWS.startShort);
  await h.runAsync(5);
  t.scripted.push('m18.solve(the Surge cast raised as spell.released)');
  for (const i of BELLOWS.order) {
    await h.approach(layout.braziers[i], 1.5);
    h.ctx.events.emit('spell.released', { casterId: h.ctx.player.actor.id, spellId: BELLOWS.surgeSpellId });
    h.run(2);
  }
  await h.runAsync(10);
  ensure(h.ctx.state.getBool(BELLOWS_SOLVED_FLAG), 'the Bellows puzzle was solved');
}

/** A stealth section walked through its start, checkpoints and exit anchors (the real director scores it). */
/** The player walks the guide route at Wenna's pace, so her barks (the director plays them as she advances) are read and counted. */
async function walkM19Route(h: ChapterHarness, t: PhaseCTrail): Promise<void> {
    for (let i = 0; ; i++) {
      const a = h.ctx.anchors.find(`${M19_ROUTE_PREFIX}.${i}`);
      if (!a) break;
      for (let n = 0; n < 200; n++) {
        const f = h.ctx.player.feet;
        const dx = a.position.x - f.x;
        const dz = a.position.z - f.z;
        const d = Math.hypot(dx, dz);
        if (d < 1.5) break;
        const step = Math.min(d, ROUTE_FOLLOW_MPS);
        await h.teleport({ x: f.x + (dx / d) * step, y: a.position.y, z: f.z + (dz / d) * step }, 1);
        await h.runAsync(60);
        heal(h);
        drainDialogue(h, t);
      }
    }
}

/** The stealth sections are not played: the player is teleported from checkpoint to checkpoint, and the trail says so. */
const sneak = (label: string, anchors: string[]): Handler => async (h, t) => {
  t.scripted.push(`${label}.sneak(teleported checkpoint to checkpoint, the watch loop not played)`);
  for (const id of anchors) {
    const a = h.anchor(id);
    await h.teleport({ x: a.x, y: a.y, z: a.z }, 2);
    await h.runAsync(30);
    heal(h);
  }
  await h.runAsync(10);
};

/** D04: both pools' valve rings by hand, then the vents open on their own. */
const coolPool = (n: 1 | 2): Handler => async (h) => {
  const spec = D04_POOLS[n - 1];
  const centre = h.anchor(spec.anchor);
  const pts = spec.plaque.map((_, i) => ringPoint(centre, i, spec.plaque.length));
  await turnValves(h, pts.map((_, i) => `valve:${spec.valvePrefix}-${i + 1}`), pts, spec.startShort);
  for (let i = 0; i < 40 && !flagDone(h, spec.flag); i++) await h.runAsync(30);
  ensure(flagDone(h, spec.flag), `pool ${n} cooled`);
};

/**
 * The Slagmaw (A8, the Redmane approach): in the arena through the intro, then one valve cool and one poise break per
 * phase, the third break last, then the killing blow. Blows go through the damage service as the player; the arena, the
 * boss registry and the encounter are the real ones.
 */
export async function fightSlagmaw(h: ChapterHarness, trail?: PhaseCTrail): Promise<void> {
  const boss = () => [...h.ctx.actors.all()].find((a) => a.kind === SLAGMAW_KIND && !a.dead);
  const hit = (amount: number, poise: number) => {
    const b = boss();
    ensure(b, 'the Slagmaw is in the arena');
    return h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: b.id, amount, poise, kind: 'melee' });
  };
  const until = async (cond: () => boolean, seconds: number): Promise<boolean> => {
    for (let i = 0; i < seconds * 60 && !cond(); i++) {
      h.run(1);
      heal(h);
    }
    return cond();
  };
  const enc = () => slagmawDirector()!.current!;
  const state = () => h.ctx.bosses.state(SLAGMAW_BOSS_ID);
  await h.enterTrigger(ARENA.arenaTrigger);
  ensure(await until(() => !!boss(), PRESENTATION.introSeconds + 3), 'the Slagmaw rose after the intro');
  await until(() => false, 1);
  const toFraction = (f: number) => {
    const s = state()!;
    hit(s.health - s.maxHealth * f, 0);
  };
  for (let phase = 1; phase <= 3; phase++) {
    // Stand at the valve: the eruption lands where the player stands, so the worm surfaces inside the valve's spray disc.
    // A spray that misses (he surfaced out of reach) leaves the valve ready: wait for the next cycle and turn it again.
    const items = () => (h.ctx.interaction as unknown as { items: Map<string, { enabled(): boolean; onInteract(a: unknown): void }> }).items;
    for (let cycle = 0; cycle < 8 && !enc().crustCooled; cycle++) {
      await h.approach(h.anchor(ARENA.valves[phase - 1]), 1.1);
      await until(() => enc().brain.state !== 'surfaced', 20);
      ensure(await until(() => enc().brain.state === 'surfaced', 40), `the worm surfaced in phase ${phase}`);
      const valve = items().get(`valve:slagmaw-${phase}`);
      if (!valve?.enabled()) {
        // the spray of a turn that missed is still running: the valve re-arms when it lapses
        await until(() => !!valve?.enabled() || enc().crustCooled, 20);
        continue;
      }
      try {
        await useAt(h, ARENA.valves[phase - 1], `valve:slagmaw-${phase}`, 1.1, [1.8, 2.5]);
      } catch {
        // A companion standing close can hold the focus: turn the valve through its interactable, as the F press would.
        trail?.scripted.push(`d04.slagmaw.valve${phase}(turned through its interactable, a companion held the focus)`);
        valve.onInteract(h.ctx.player.actor);
      }
      await until(() => enc().crustCooled, 1);
    }
    ensure(enc().crustCooled, `the crust was cooled in phase ${phase}`);
    hit(1, SLAGMAW.maxPoise);
    await until(() => false, SLAGMAW.breakSeconds + 0.3);
    if (phase < 3) {
      ensure(await until(() => enc().brain.state === 'surfaced', 40), 'surfaced again');
      toFraction(SLAGMAW.phases[phase - 1] - 0.01);
      await until(() => false, SLAGMAW.breakSeconds + 0.3);
    }
  }
  ensure(await until(() => !!boss()?.hittable, 30), 'the worm can be struck');
  hit(1e6, 0);
  h.run(2);
  ensure(h.ctx.state.getString(D04_OUTCOME_FLAG) === 'defeated', 'the Slagmaw is defeated');
  await h.runAsync(PRESENTATION.deathSeconds * 60 + 120);
}

/** Waits (ticks, healing) for `done()`, reading through any dialogue the game starts by itself. */
async function waitFor(h: ChapterHarness, trail: PhaseCTrail, done: () => boolean, what: string, ticks = 1800): Promise<void> {
  for (let i = 0; i < ticks && !done(); i += 30) {
    await h.runAsync(30);
    heal(h);
    drainDialogue(h, trail);
  }
  ensure(done(), what);
}

Object.assign(HANDLERS, {
  'm18.plaque': async (h) => {
    const c = h.anchor(BELLOWS.centerAnchor);
    await useAtPoint(h, { x: c.x + BELLOWS.plaqueOffset.x, y: c.y, z: c.z + BELLOWS.plaqueOffset.z }, BELLOWS_PLAQUE);
  },
  'm18.solve': solveBellows,
  'm18.rekindle': async (h, t) => {
    await h.approach(h.anchor(`waystone.${BELLOWS_SHRINE_ID}`), 1.5);
    h.hold('KeyF', WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
    await waitFor(h, t, () => flagDone(h, BELLOWS_LIT_FLAG), 'the Bellows shrine was lit', 600);
  },
  'm18.breathe': async (h, t) => {
    await h.teleport({ x: h.anchor(BELLOWS.centerAnchor).x + 3, z: h.anchor(BELLOWS.centerAnchor).z }, 2);
    await waitFor(h, t, () => quests(h).objectiveDone('m18', 'breathe'), 'the Bellows scene played', 1200);
  },
  // M19: Wenna walks the route at her pace and the player stays within reach, so her six barks (two lines each) play
  'm19.route': async (h, t) => {
    const interiors = h.ctx.services.require('interiors');
    if (interiors.current !== 'mine-lower-galleries') {
      t.scripted.push('m19.route(entered the lower galleries through the interior service, not the lift)');
      if (interiors.current !== null) {
        void interiors.exit().catch(() => undefined);
        await h.runAsync(2);
        for (let i = 0; i < 40 && interiors.transitioning; i++) await h.runAsync(30);
      }
      let refused = '';
      void interiors.enter('mine-lower-galleries', 'mine-lower-galleries').catch((e: unknown) => { refused = String((e as Error).message ?? e); });
      await h.runAsync(2);
      for (let i = 0; i < 40 && (interiors.transitioning || interiors.current === null); i++) await h.runAsync(30);
      ensure(interiors.current === 'mine-lower-galleries', `inside the lower galleries ${refused}`);
    }
    await walkM19Route(h, t);
    await h.enterTrigger(M19_ROUTE_TRIGGER);
  },
  'm19.stealth': sneak('m19', ['oldsmoke.stealth.m19.start', 'oldsmoke.stealth.m19.cp.inside', 'oldsmoke.stealth.m19.end']),
  // the sealed doors are open now: Wenna walks on to the nursery with the rest of her barks
  'm19.reveal': async (h, t) => {
    await walkM19Route(h, t);
    await h.enterTrigger(M19_NURSERY_TRIGGER);
    await waitFor(h, t, () => quests(h).objectiveDone('m19', 'reveal'), 'the nursery was revealed', 1200);
  },
  'm20.chainsBroken': async (h, t) => {
    await waitFor(h, t, () => flagDone(h, M20_ORSK_GONE), 'Orsk went', 5400);
    await h.runAsync(10);
  },
  'm20.gone': async (h, t) => {
    await waitFor(h, t, () => quests(h).objectiveDone('m20', 'gone'), 'Orsk went', 600);
  },
  'd04.pool1': coolPool(1),
  'd04.pool2': coolPool(2),
  'd04.slagmaw': (h, t) => fightSlagmaw(h, t),
  'm21.withdraw': async (h) => { await h.enterTrigger(M21_WITHDRAW_TRIGGER); },
  'm21.stealth': sneak('m21', ['oldsmoke.stealth.m21.start', 'oldsmoke.stealth.m21.cp.gallery', 'oldsmoke.stealth.m21.cp.study', 'oldsmoke.stealth.m21.end']),
  'm22.council': async (h, t) => {
    await h.enterTrigger('trg.harrowmark.keep-hall');
    await waitFor(h, t, () => quests(h).objectiveDone('m22', 'council'), 'the council met', 1200);
  },
  'm22.raised': async (h, t) => {
    await waitFor(h, t, () => quests(h).objectiveDone('m22', 'raised'), 'the banner scene played', 1200);
  },
} satisfies Record<string, Handler>);

const SCRIPTED: DriverTables['scripted'] = {};

const TABLES: DriverTables = { handlers: HANDLERS, scripted: SCRIPTED, givers: PHASE_D_GIVERS };

export const emptyPhaseDTrail = emptyPhaseCTrail;
export type PhaseDTrail = PhaseCTrail;

/** Plays one Phase D quest from the giver's offer to its hand-in. */
export const playPhaseDQuest = (h: ChapterHarness, trail: PhaseDTrail, q: PhaseDQuest, opts: PhaseCOptions = {}): Promise<void> => playPhaseCQuest(h, trail, q, opts, TABLES);

/** Plays the listed quests in order. */
export async function playPhaseD(h: ChapterHarness, order: readonly PhaseDQuest[] = PHASE_D_ORDER, opts: PhaseCOptions = {}): Promise<Record<string, PhaseDTrail>> {
  const trails: Record<string, PhaseDTrail> = {};
  for (const q of order) {
    trails[q] = emptyPhaseDTrail();
    await playPhaseDQuest(h, trails[q], q, opts);
    await opts.hooks?.after?.(q);
  }
  return trails;
}

