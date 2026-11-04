import * as THREE from 'three';
import { WAYSTONE_TUNING } from '../waystones/tuning';
import type { ChapterHarness } from './chapterHarness';
import { carryTo, describeQuest, ensure, heal, killAsPlayer, type QuestTrail } from './phaseA';
import { useAt } from './phaseB';
import { HEAVY_CHOP_CLIPS } from '../combat/heavyBlow';
import { WAVE_SETS } from '../waves/defs';
import { ACT2_PROPS } from '../quests/content/act2/props';
import { ACT2_CARRY } from '../quests/content/act2/carry';
import { ACT2_NOTE_LIST } from '../quests/content/act2/notes';
import { ACT2_SPAWNERS_A12 } from '../quests/content/act2/spawners';
import { OLDSMOKE_CARRY, OLDSMOKE_NOTE_LIST, OLDSMOKE_PROPS, OLDSMOKE_SPAWNERS } from '../quests/content/act2/oldsmoke';
import type { ObjectiveDef } from '../quests/types';
import { HUSHED_ANVIL, muralFlag } from '../shrine/hushedAnvil.tuning';
import { ARENA, PRESENTATION, REDMANE, REDMANE_BOSS_ID, REDMANE_KIND } from '../bosses/redmane/tuning';
import { ACT2_GIVERS, type Act2JumpId } from '../quests/act2Jump';

/**
 * Phase C (Cinderreach), played on a `bootFromSave(<Act 1 complete fixture>, { models: true, virtualClock: true })` game
 * through the real services: dialogue by the harness's key presses, interactables and carries by F at the real anchors,
 * enemies killed as the player through the damage service, triggers entered by teleport. `quest.objective` pairs listed
 * in `SCRIPTED` have no cheap headless driver (they need the full waves, rhythm, trial, stealth or boss loop, or an event
 * the real services raise from systems the harness does not run); the driver raises the event the real system would and
 * records the pair in `trail.scripted`, so the e2e test names exactly what was a shortcut.
 */

export type PhaseCQuest = Act2JumpId;
export const PHASE_C_ORDER: readonly PhaseCQuest[] = ['m11', 'm12', 'r06', 'r05', 'm13', 'r07', 'r11', 'm14', 'm15', 'd03'];

export interface PhaseCTrail extends QuestTrail {
  /** `quest.objective` pairs completed by raising their event instead of playing them */
  scripted: string[];
  /** the order objectives were completed in */
  order: string[];
}
export const emptyPhaseCTrail = (): PhaseCTrail => ({ talks: [], scripted: [], order: [] });

export interface PhaseCOptions {
  /** dialogue choices (1-based, in order) by `<quest>.<objective>`; `<quest>.offer` for the giver's first talk */
  choices?: Record<string, number[]>;
  /** moments the fixture generator saves at (each runs between ticks, with nothing in flight) */
  hooks?: {
    before?(q: string): Promise<void>;
    after?(q: string): Promise<void>;
    afterObjective?(q: string, objective: string): Promise<void>;
    /** once, as the first raiders of a wave set are standing */
    inWave?(q: string): Promise<void>;
  };
}

/** Run B's choices: the second branch of every choice (R11 and D03 are driver flags: [1] spares, the default slays). */
export const PHASE_C_RUN_B: Record<string, number[]> = { 'r06.choice': [2], 'r05.choice': [2], 'r07.choice': [2], 'r11.wyrm': [1], 'd03.boss': [1] };

export const quests = (h: ChapterHarness) => h.ctx.services.require('quests');

/** Where an NPC (or a joined companion) stands now. */
export function whereIs(h: ChapterHarness, npc: string): THREE.Vector3 {
  const companions = h.ctx.services.get('companions');
  const cid = companions?.actorId?.(npc);
  const actor = cid ? h.ctx.actors.get(cid) : [...h.ctx.actors.all()].find((x) => x.kind === `npc:${npc}`);
  ensure(actor?.root, `NPC ${npc} has an actor`);
  return actor.root.getWorldPosition(new THREE.Vector3());
}

export async function talk(h: ChapterHarness, trail: PhaseCTrail, npc: string, choices: number[] = []): Promise<void> {
  await h.approach(whereIs(h, npc), 1.6);
  const dialogueId = `npc-${npc}`;
  const nodes = h.talk(dialogueId, npc, choices);
  trail.talks.push({ npc, dialogueId, nodes });
  await h.runAsync(2);
}

/** Kills the live actors from spawners tagged `tag` (of `kind`, when given) as they rise, until `done()`. Visits the tag's anchors in turn. */
export async function killUntil(h: ChapterHarness, tag: string, kind: string | undefined, done: () => boolean, what: string): Promise<void> {
  const defs = [...ACT2_SPAWNERS_A12, ...OLDSMOKE_SPAWNERS].filter((s) => s.tag === tag);
  ensure(defs.length > 0, `a spawner tagged ${tag}`);
  const at = (i: number) => {
    const anchor = h.ctx.anchors.find(defs[i % defs.length].anchor);
    ensure(anchor, `anchor ${defs[i % defs.length].anchor}`);
    return new THREE.Vector3(anchor.position.x, anchor.position.y, anchor.position.z);
  };
  let site = 0;
  await h.approach(at(site), 8);
  for (let i = 0; i < 80 && !done(); i++) {
    await h.runAsync(20);
    heal(h);
    let killed = 0;
    for (const a of [...h.ctx.actors.all()]) {
      if (a.dead || (a as { spawnTag?: string }).spawnTag !== tag || (kind && a.kind !== kind)) continue;
      if (killAsPlayer(h, a.id)) killed++;
    }
    // A group that is not here yet is raised at another of the tag's anchors (the director's second ambush): go and look.
    if (!killed && i % 4 === 3 && defs.length > 1) await h.approach(at(++site), 8);
  }
  ensure(done(), what);
  h.run(2);
}

/** Kills what the tagged spawners raise until the objective has `required`. */
export async function killTag(h: ChapterHarness, q: string, o: string, kind: string | undefined, tag: string, required: number): Promise<void> {
  const progress = () => quests(h).objectives(q).find((v) => v.def.id === o)?.progress ?? 0;
  await killUntil(h, tag, kind, () => progress() >= required, `${q}.${o}: ${required} ${kind ?? 'enemies'} of ${tag} killed (${progress()})`);
}

/** Heavy chops on a brazier cart (the only blows that hurt it): ten take 600 health down. */
function chopCart(h: ChapterHarness, cartId: string): void {
  const attackId = [...HEAVY_CHOP_CLIPS][0];
  for (let i = 0; i < 12 && !h.ctx.actors.get(cartId)?.dead; i++) {
    h.ctx.damage.apply({
      attackerId: h.ctx.player.actor.id, targetId: cartId, amount: 40, poise: 0, kind: 'melee', attackId, direction: new THREE.Vector3(0, 0, -1),
    });
  }
}

/** Holds the barricade: kills every wave enemy and brazier cart as it comes until the objective is done. */
export async function fightWaves(h: ChapterHarness, q: string, o: string, defId: string, opts: PhaseCOptions = {}): Promise<void> {
  const set = WAVE_SETS[defId];
  ensure(set, `wave set ${defId}`);
  const centre = set.barricadeAnchors.map((a) => h.anchor(a)).reduce((c, p) => c.add(p), new THREE.Vector3()).divideScalar(set.barricadeAnchors.length);
  await h.approach(centre, 14, { x: -1, z: 0 });
  const done = () => quests(h).objectiveDone(q, o);
  let announced = false;
  for (let i = 0; i < 600 && !done(); i++) {
    await h.runAsync(15);
    heal(h);
    if (!announced && [...h.ctx.actors.all()].some((a) => !a.dead && (a as { spawnTag?: string }).spawnTag === set.spawnTag)) {
      announced = true;
      await opts.hooks?.inWave?.(q);
    }
    for (const a of [...h.ctx.actors.all()]) {
      if (a.dead) continue;
      const tag = (a as { spawnTag?: string }).spawnTag;
      if (tag === set.spawnTag) killAsPlayer(h, a.id);
      else if (a.kind === 'brazier-cart') chopCart(h, a.id);
    }
  }
  ensure(done(), `${q}.${o}: the ${defId} waves cleared`);
}

export type Handler = (h: ChapterHarness, trail: PhaseCTrail, opts: PhaseCOptions) => Promise<void>;
export const pick = (opts: PhaseCOptions, key: string, fallback: number[] = []) => opts.choices?.[key] ?? fallback;
export const flagDone = (h: ChapterHarness, flag: string) => h.ctx.state.getBool(flag);

/** Walks the player toward `target` (6 m steps, one second apart) so followers keep up, until `done()` or arrival. */
export async function leadTo(h: ChapterHarness, target: THREE.Vector3Like, done: () => boolean, seconds = 400, stepM = 6, avoid: { x: number; z: number; r: number }[] = []): Promise<void> {
  for (let i = 0; i < seconds && !done(); i++) {
    const f = h.ctx.player.feet;
    const dx = target.x - f.x;
    const dz = target.z - f.z;
    const d = Math.hypot(dx, dz);
    const step = Math.min(d, stepM);
    if (d > 1) {
      let x = f.x + (dx / d) * step;
      let z = f.z + (dz / d) * step;
      // Keep out of the circles (the fog hollows): a sheep that strays into one is lost.
      for (const c of avoid) {
        const cd = Math.hypot(x - c.x, z - c.z);
        if (cd < c.r) { x = c.x + ((x - c.x) / (cd || 1)) * c.r; z = c.z + ((z - c.z) / (cd || 1)) * c.r; }
      }
      await h.teleport({ x, z }, 1);
    }
    await h.runAsync(60);
    heal(h);
  }
}

/**
 * Redmane's keep fight: in the arena, through the intro, six breaks over two phases (the sixth opens the Release window),
 * then the Spare or the killing blow. Blows go through the damage service as the player; the arena's director, the boss
 * service and the encounter are the real ones.
 */
export async function fightRedmane(h: ChapterHarness, outcome: 'spared' | 'defeated'): Promise<void> {
  const bossActor = () => [...h.ctx.actors.all()].find((a) => a.kind === REDMANE_KIND && !a.dead);
  const hit = (amount: number, poise: number) => {
    const b = bossActor();
    ensure(b, 'Redmane is in the arena');
    return h.ctx.damage.apply({ attackerId: h.ctx.player.actor.id, targetId: b.id, amount, poise, kind: 'melee' });
  };
  const settle = async () => {
    for (let i = 0; i < Math.ceil((REDMANE.breakSeconds + 0.3) * 60); i++) {
      h.run(1);
      heal(h);
    }
  };
  const c = h.triggerCentre(ARENA.arenaTrigger);
  ensure(c, 'the arena trigger');
  await h.enterTrigger(ARENA.arenaTrigger);
  for (let i = 0; i < Math.ceil((PRESENTATION.introSeconds + 1) * 60); i++) {
    h.run(1);
    heal(h);
  }
  ensure(bossActor(), 'Redmane stands after the intro');
  const state = () => h.ctx.bosses.state(REDMANE_BOSS_ID);
  for (let i = 0; i < REDMANE.breaksPerPhase; i++) {
    hit(1, REDMANE.maxPoise);
    await settle();
  }
  const s = state()!;
  hit(s.health - s.maxHealth * 0.45, 0);
  await settle();
  for (let i = 0; i < REDMANE.breaksPerPhase; i++) {
    hit(1, REDMANE.maxPoise);
    if (i < REDMANE.breaksPerPhase - 1) await settle();
  }
  ensure(state()?.releaseOpen, 'the Release window is open');
  if (outcome === 'spared') ensure(h.ctx.bosses.release(REDMANE_BOSS_ID), 'the Spare took');
  else hit(1e6, 0);
  h.run(2);
  ensure(h.ctx.state.getString(`boss.${REDMANE_BOSS_ID}.outcome`) === outcome, `the outcome is ${outcome}`);
  await h.runAsync(PRESENTATION.spareKneelSeconds * 60 + 120);
}

const ALL_PROPS = [...ACT2_PROPS, ...OLDSMOKE_PROPS];
const ALL_CARRY = [...ACT2_CARRY, ...OLDSMOKE_CARRY];
const ALL_NOTES = [...ACT2_NOTE_LIST, ...OLDSMOKE_NOTE_LIST];

/** Objectives a dialogue, a service or a fight completes: who to talk to with which choice, what to kill, where to stand. */
export const HANDLERS: Record<string, Handler> = {
  // R06: the four households, Maud's choice, the bundles, Pennard's rite
  'r06.households': async (h, t) => {
    for (const n of [1, 2, 3, 4]) if (!flagDone(h, `story.r06.heard.${n}`)) await talk(h, t, `household-${n}`);
  },
  'r06.choice': (h, t, o) => talk(h, t, 'maud', pick(o, 'r06.choice', [1])),
  'r06.bundles': async (h) => {
    const next = ALL_CARRY.find((c) => c.questId === 'r06' && !h.ctx.state.getBool(c.deliveredFlag));
    ensure(next, 'a bundle left to carry');
    await carryTo(h, next.homeAnchor, next.destination, next.deliveredFlag);
  },
  // M13: Hrolf's ring talk raises the duel; each round ends when the double is floored at 1 HP (the trial service scores it)
  'm13.duel': async (h, t, o) => {
    await talk(h, t, 'hrolf', pick(o, 'm13.duel'));
    await h.runAsync(10);
    const done = () => quests(h).objectiveDone('m13', 'duel');
    for (let i = 0; i < 300 && !done(); i++) {
      const opp = h.ctx.services.get('enemies')?.alive('q12.m13.trial')[0];
      if (opp && h.ctx.services.get('trials')?.state()) killAsPlayer(h, opp);
      await h.runAsync(30);
      heal(h);
    }
    ensure(done(), 'the trial with Hrolf was won');
  },
  // R05: Ketta's choice (1 the safe road, 2 the fox), the fox's four stops, the walk home with the flock
  'r05.choice': (h, t, o) => talk(h, t, 'ketta', pick(o, 'r05.choice', [1])),
  'r05.foxStops': async (h) => {
    // The fox waits when the player lags: stay at its heels.
    for (let i = 0; i < 400 && h.ctx.state.getNumber('story.r05.foxNext') < 4; i++) {
      const guide = h.ctx.services.get('enemies')?.alive('cinderreach.fox.r05')[0];
      const fox = guide ? h.ctx.actors.get(guide) : undefined;
      if (fox?.root) {
        const p = fox.root.getWorldPosition(new THREE.Vector3());
        await h.teleport({ x: p.x + 1.5, z: p.z + 1.5 }, 1);
      }
      await h.runAsync(60);
      heal(h);
    }
    ensure(h.ctx.state.getNumber('story.r05.foxNext') >= 4, 'the fox led the way to all four stops');
  },
  'r05.herdHome': async (h) => {
    // The sheep follow once the player is among them: go to the flock first (the fox branch ends at the Dell).
    // A sheep that started further than 45 m from the player grazes until the player is within 5 m of it: walk the pasture
    // anchor to anchor (at walking pace, so the ones already gathered keep up) as a player gathering the flock would.
    const first = h.anchor('cinderreach.pasture.flock.1');
    await h.teleport({ x: first.x + 2.5, z: first.z }, 2);
    for (let n = 1; n <= 8; n++) {
      const a = h.ctx.anchors.find(`cinderreach.pasture.flock.${n}`);
      if (!a) continue;
      const at = new THREE.Vector3(a.position.x, a.position.y, a.position.z);
      await leadTo(h, at, () => Math.hypot(h.ctx.player.feet.x - at.x, h.ctx.player.feet.z - at.z) < 2, 120, 2.2);
      await h.runAsync(60);
      heal(h);
    }
    const hollows = [1, 2, 3].map((n) => { const a = h.anchor(`cinderreach.pasture.hollow.${n}`); return { x: a.x, z: a.z, r: 20 }; });
    await leadTo(h, h.anchor('cinderreach.r05.home'), () => flagDone(h, 'story.r05.herdHome'), 900, 2.2, hollows);
    ensure(flagDone(h, 'story.r05.herdHome'), 'the flock is home');
  },
  // R07: Ketta's choice (1 spare the pups, 2 cull the den)
  'r07.choice': (h, t, o) => talk(h, t, 'ketta', pick(o, 'r07.choice', [1])),
  // R11: the den scene plays on entering the shelf and is read through
  'r11.den': async (h) => {
    // The ledge climb may already have the player inside the shelf's volume: step out so the entry event fires.
    const c = h.triggerCentre('trg.cinderreach.den')!;
    await h.teleport({ x: c.x + 90, z: c.z }, 1);
    await h.runAsync(5);
    await h.enterTrigger('trg.cinderreach.den');
    await h.runAsync(10);
    const dialogue = h.ctx.services.require('dialogue');
    for (let i = 0; i < 100 && dialogue.active; i++) h.press('KeyF');
    ensure(!dialogue.active, 'the den scene closed');
  },
  // R11: the den wyrm. Choice [1] spares it (the mercy event the hold raises, recorded as scripted: the wyrm's own
  // mercy tiers are A6a's tests); the default slays it.
  'r11.wyrm': async (h, t, o) => {
    await h.approach(h.anchor('cinderreach.den.wyrm.rest'), 10);
    await h.runAsync(10);
    const wyrm = h.ctx.services.get('enemies')?.alive('wyrm.r11.den')[0];
    ensure(wyrm, 'the den wyrm is here');
    if (pick(o, 'r11.wyrm')[0] === 1) {
      t.scripted.push('r11.wyrm(spare)');
      h.ctx.events.emit('mercy', { verb: 'spare', tier: 'normal', track: 'dragons', creature: 'ember-wyrm', actorId: wyrm } as never);
    } else {
      for (let i = 0; i < 40 && !h.ctx.state.getString('story.r11.choice'); i++) {
        killAsPlayer(h, wyrm);
        await h.runAsync(20);
        heal(h);
      }
    }
    ensure(h.ctx.state.getString('story.r11.choice'), 'the wyrm outcome was written');
  },
  // M14: the three murals on the Anvil's site (not anchors: offsets from the site anchor), each read followed by the keeper
  'm14.murals': async (h) => {
    const site = h.anchor(HUSHED_ANVIL.siteAnchor);
    for (const [i, off] of HUSHED_ANVIL.muralOffsets.entries()) {
      const n = i + 1;
      if (flagDone(h, muralFlag(n))) continue;
      const at = { x: site.x + off.x, y: site.y, z: site.z + off.z };
      let focused = false;
      for (const d of [1.1, 0.7, 1.8]) {
        for (const side of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
          await h.approach(at, d, side);
          h.run(2);
          const f = (h.ctx.interaction as unknown as { focusFor(a: string): { id: string } | null }).focusFor('interact');
          if (f?.id === `use:hushed-anvil-mural-${n}`) { focused = true; break; }
        }
        if (focused) break;
      }
      ensure(focused, `mural ${n} in focus`);
      h.press('KeyF');
      await h.runAsync(10);
      drainDialogue(h);
    }
  },
  // M14: two tempering runs at the Anvil. The session is the real one (opened directly: the screen is a DOM widget the
  // headless harness has no document for, and A16's real-game run covers it); each run strikes every step on its beat.
  'm14.temper': async (h, t) => {
    const gear = h.ctx.services.require('gear');
    const session = gear.session;
    t.scripted.push('m14.temper(session opened without the screen)');
    for (let n = 0; n < 2; n++) {
      ensure(session.open('anvil'), 'the Anvil opened');
      const row = session.view().items.find((r) => !r.blockedBy);
      ensure(row, 'a temperable item');
      session.select(row.id);
      session.start();
      ensure(session.state === 'rhythm', `a rhythm run (state ${session.state}, ${JSON.stringify(session.view().lastResult)})`);
      const steps = session.view().run!.steps;
      const struck = new Set<number>();
      for (let f = 0; f < 3000 && session.state === 'rhythm'; f++) {
        const pos = session.view().run!.position;
        steps.forEach((st, k) => {
          if (!struck.has(k) && Math.abs(pos - st) < 0.12) { struck.add(k); session.strike(); }
        });
        h.run(1);
        session.update();
      }
      const at = () => session.state as string;
      for (let g = 0; g < 10 && at() !== 'result' && at() !== 'idle'; g++) {
        if (at() === 'affix-reveal') session.view().affix?.choice ? session.replaceAffix() : session.confirm();
        else session.confirm();
      }
      session.close();
      await h.runAsync(5);
    }
  },
  'm14.sings': async (h) => {
    await h.runAsync(20);
    drainDialogue(h);
    await h.runAsync(20);
  },
  // M15: the stealth pass through the camp (start, the inside checkpoint, the exit), the real stealth director's section
  'm15.scout': async (h) => {
    for (const id of ['cinderreach.stealth.m15.start', 'cinderreach.stealth.m15.cp.inside', 'cinderreach.stealth.m15.end']) {
      const a = h.anchor(id);
      await h.teleport({ x: a.x, z: a.z }, 2);
      await h.runAsync(30);
      heal(h);
    }
    await h.runAsync(10);
  },
  // M15: the cage opened, the chain falls and the wyrmling flies (a timer the director runs)
  'm15.flight': async (h) => {
    for (let i = 0; i < 20 && !flagDone(h, 'story.m15.flown'); i++) await h.runAsync(30);
    ensure(flagDone(h, 'story.m15.flown'), 'the wyrmling flew');
  },
  // D03: Redmane. Choice [1] spares him (Release through the boss service in the window), the default defeats him.
  'd03.boss': (h, _t, o) => fightRedmane(h, pick(o, 'd03.boss')[0] === 1 ? 'spared' : 'defeated'),
  // D03: a spared Redmane, held by Osgar's post, gives his testimony
  'd03.testimony': (h, t, o) => talk(h, t, 'redmane', pick(o, 'd03.testimony')),
  'r06.sealed': (h, t) => talk(h, t, 'maud'),
  'r06.cleansed': (h, t) => talk(h, t, 'maud'),
  'r06.rite': async (h, t) => {
    await talk(h, t, 'pennard', [1]);
    await killUntil(h, 'r06.rite', 'ash-wraith', () => flagDone(h, 'story.r06.riteFinished'), 'the rite finished');
  },
};

/** Events a system the harness does not run would raise; the pair is recorded as scripted. */
export type ScriptedEvents = Record<string, { event: string; payload?: Record<string, unknown> }>;
const SCRIPTED: ScriptedEvents = {};

/** What a phase supplies the shared objective player: its handlers, its raised events and who offers each quest. */
export interface DriverTables {
  handlers: Record<string, Handler>;
  scripted: ScriptedEvents;
  givers: Record<string, string>;
  /** K16 (Phase E): a later act's props, carries and notes, searched before the Act 2 lists. */
  props?: readonly (typeof ALL_PROPS)[number][];
  carry?: readonly (typeof ALL_CARRY)[number][];
  notes?: readonly (typeof ALL_NOTES)[number][];
}
const PHASE_C_TABLES: DriverTables = { handlers: HANDLERS, scripted: SCRIPTED, givers: ACT2_GIVERS };

/** Reads through a dialogue the game started by itself (Gaut's road speech, a scene), as the player would. */
export function drainDialogue(h: ChapterHarness, trail?: PhaseCTrail): void {
  const dialogue = h.ctx.services.require('dialogue');
  if (!dialogue.active) return;
  const started = h.of('dialogue.started').at(-1);
  let nodes = 0;
  for (let i = 0; i < 100 && dialogue.active; i++) {
    h.press('KeyF');
    nodes++;
  }
  ensure(!dialogue.active, 'the game-started dialogue closed');
  // A scene is dialogue the player read like any other: its nodes count toward the quest's talk time.
  trail?.talks.push({ npc: `scene-${started?.npcId ?? 'unknown'}`, dialogueId: started?.dialogueId ?? 'scene', nodes });
}

/** One current objective, played. */
export async function play(h: ChapterHarness, trail: PhaseCTrail, q: string, def: ObjectiveDef, opts: PhaseCOptions, tables: DriverTables = PHASE_C_TABLES): Promise<void> {
  drainDialogue(h, trail);
  // A set piece the game plays (Orsk's roof, started by a director that polls twice a second) holds the player in a cutscene until it ends.
  if (tables !== PHASE_C_TABLES) await h.runAsync(32);
  for (let i = 0; i < 6000 && h.ctx.input.contexts.top() === 'cutscene'; i += 30) await h.runAsync(30);
  const key = `${q}.${def.id}`;
  const choices = opts.choices?.[key] ?? [];
  switch (def.type) {
    case 'talk':
      return talk(h, trail, def.target as string, choices);
    case 'goTo':
      if (tables.handlers[key]) return tables.handlers[key](h, trail, opts);
      return h.enterTrigger(def.target as string);
    case 'interact': {
      const prop = [...(tables.props ?? []), ...ALL_PROPS].find((p) => p.interactableId === def.target);
      ensure(prop, `a prop for ${def.target}`);
      return useAt(h, prop.anchorId, prop.interactableId, 1.1, [1.8, 2.5]);
    }
    case 'carry': {
      const items = [...(tables.carry ?? []), ...ALL_CARRY].filter((c) => c.questId === q && c.objectiveId === def.id && !h.ctx.state.getBool(c.deliveredFlag));
      ensure(items.length > 0, `a carry item left for ${key}`);
      return carryTo(h, items[0].homeAnchor, items[0].destination, items[0].deliveredFlag);
    }
    case 'kill':
      return killTag(h, q, def.id, def.target as string, def.spawnTag as string, def.required ?? 1);
    case 'event': {
      const m = (def.match ?? {}) as Record<string, unknown>;
      if (tables.handlers[key]) return tables.handlers[key](h, trail, opts);
      if (def.target === 'interact' && m.interactableId) {
        const ids = (Array.isArray(m.interactableId) ? m.interactableId : [m.interactableId]) as string[];
        const done = quests(h).objectives(q).find((v) => v.def.id === def.id)?.progress ?? 0;
        const prop = [...(tables.props ?? []), ...ALL_PROPS].find((p) => ids.includes(p.interactableId) && !h.ctx.state.getBool(p.usedFlag ?? ''));
        ensure(prop, `an unused prop of ${key} (done ${done})`);
        return useAt(h, prop.anchorId, prop.interactableId, 1.1, [1.8, 2.5]);
      }
      if (def.target === 'dialogue.ended' && m.npcId && m.reason === 'completed' && typeof m.npcId !== 'string') {
        const ids = m.npcId as string[];
        const note = [...(tables.notes ?? []), ...ALL_NOTES].find((n) => ids.includes(n.id) && !trailRead(trail, n.id));
        ensure(note, `an unread note of ${key}`);
        return readNoteFocused(h, trail, note.id, note.anchorId);
      }
      if ((def.target === 'waystone.rekindled' && m.waystoneId) || (def.target === 'shrine.rekindled' && m.shrineId)) {
        const id = String(m.waystoneId ?? m.shrineId);
        await h.approach(h.anchor(`waystone.${id}`), 1.5);
        h.hold('KeyF', WAYSTONE_TUNING.rekindleHoldSeconds + 0.2);
        return;
      }
      if (def.target === 'wave.cleared' && m.defId) return fightWaves(h, q, def.id, String(m.defId), opts);
      const s = tables.scripted[key];
      ensure(s, `${key}: a driver (event ${String(def.target)})`);
      trail.scripted.push(key);
      h.ctx.events.emit(s.event as never, (s.payload ?? {}) as never);
      return;
    }
    default:
      ensure(false, `${key}: objective type ${def.type}`);
  }
}

/** A note read with its own interactable in focus (a companion standing close can win the focus of the nearest-thing reading). */
export async function readNoteFocused(h: ChapterHarness, trail: QuestTrail, noteId: string, anchorId: string): Promise<void> {
  const dialogue = h.ctx.services.require('dialogue');
  await useAt(h, anchorId, `use:${noteId}`, 1.1, [1.8, 2.5]);
  ensure(dialogue.active, `the note ${noteId} opened at ${anchorId}`);
  let nodes = 0;
  for (; nodes < 20 && dialogue.active; nodes++) {
    h.press('KeyF');
    h.run(1);
  }
  ensure(!dialogue.active, `the note ${noteId} closed`);
  trail.talks.push({ npc: noteId, dialogueId: noteId, nodes });
  await h.runAsync(2);
}

const trailRead = (trail: PhaseCTrail, noteId: string) => trail.talks.some((t) => t.npc === noteId);

/** Plays one Phase C quest from the giver's offer to its hand-in. */
export async function playPhaseCQuest(h: ChapterHarness, trail: PhaseCTrail, q: string, opts: PhaseCOptions = {}, tables: DriverTables = PHASE_C_TABLES): Promise<void> {
  const qs = quests(h);
  await opts.hooks?.before?.(q);
  if (qs.state(q) === 'inactive') {
    await talk(h, trail, tables.givers[q], opts.choices?.[`${q}.offer`] ?? []);
    ensure(qs.state(q) === 'active', `${q} offered by ${tables.givers[q]} (${describeQuest(h, q)})`);
  }
  for (let guard = 0; guard < 60 && qs.state(q) === 'active'; guard++) {
    const cur = qs.objectives(q).find((o) => o.current && !o.done);
    ensure(cur, `${q} has a current objective (${describeQuest(h, q)})`);
    const before = describeQuest(h, q);
    await play(h, trail, q, cur.def, opts, tables);
    await h.runAsync(2);
    trail.order.push(`${q}.${cur.def.id}`);
    await opts.hooks?.afterObjective?.(q, cur.def.id);
    ensure(describeQuest(h, q) !== before || qs.state(q) !== 'active', `${q}.${cur.def.id} advanced (${before})`);
  }
  ensure(qs.state(q) === 'completed', `${q} completed (${describeQuest(h, q)})`);
}

/** Plays the listed quests in order. */
export async function playPhaseC(h: ChapterHarness, order: readonly PhaseCQuest[] = PHASE_C_ORDER, opts: PhaseCOptions = {}): Promise<Record<string, PhaseCTrail>> {
  const trails: Record<string, PhaseCTrail> = {};
  for (const q of order) {
    trails[q] = emptyPhaseCTrail();
    await playPhaseCQuest(h, trails[q], q, opts);
    await opts.hooks?.after?.(q);
  }
  return trails;
}
