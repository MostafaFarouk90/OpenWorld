// Plays a Greyfen quest through the rig by its definition: whatever objective is current is done the way the game does it.
// Branch choices and the stealth reading of M27 are options; a `hook` sees each objective before it is done (for early-event tests).
import { SONG_TIER } from './song';
import { patternForTier } from '../../../../../gear/rhythm';
import { GEAR_TUNING } from '../../../../../gear/tuning';
import type { ObjectiveDef } from '../../../../types';
import { R12_PICK } from '../r12.quest';
import { M24_VOLUME } from '../m24.quest';
import { M27_BLINDS_END } from '../m27.quest';
import { D05_BOSS } from '../d05.quest';
import { R13_ALTAR, R13_SONG_SCENE, R13_SONG_NPC } from '../r13.quest';
import { M25_DRINK_TICKS } from './early';
import { M27_BROOD_TICKS, R13_CALM_TICKS } from './late';
import type { Rig } from './rig.testkit';

export interface PlayOpts {
  r12?: 'burned' | 'cut';
  r14?: 'returned' | 'released';
  /** M27: creep through the blinds unseen (default) or be seen by pack 1 and fight it. */
  m27?: 'unseen' | 'seen';
  /** Called before each objective is done. */
  hook?: (r: Rig, quest: string, o: ObjectiveDef) => void;
  /** Stop when this objective is current instead of doing it. */
  stopAt?: [string, string];
}

/** The bar of the water-song sung on the metronome: a press to start, then a strike on each step of the pattern. */
export function singBar(r: Rig, tier: number, o: { mistake?: boolean; started?: boolean } = {}): void {
  const mistake = o.mistake ?? false;
  const stepMs = 60000 / GEAR_TUNING.rhythm.bpm / GEAR_TUNING.rhythm.divisions;
  if (!o.started) r.use(R13_ALTAR); // the first press starts the bar at the current clock
  const t0 = r.clock;
  const barStart = Math.ceil((0 + GEAR_TUNING.rhythm.countInSteps) / GEAR_TUNING.rhythm.countInSteps) * GEAR_TUNING.rhythm.countInSteps;
  const pattern = patternForTier(tier);
  pattern.forEach((s, i) => {
    if (mistake && i === 1) return; // a missed strike
    const at = t0 + (barStart + s) * stepMs;
    r.advance(at - r.clock);
    r.use(R13_ALTAR);
  });
  r.advance(t0 + (barStart + 16 + 3) * stepMs - r.clock);
  r.step(12);
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v === undefined ? [] : [String(v)]);

function doObjective(r: Rig, q: string, o: ObjectiveDef, opts: PlayOpts): void {
  const target = arr(o.target);
  const match = o.match ?? {};
  switch (o.type) {
    case 'talk': {
      const npc = target[0]!;
      if (npc.startsWith('scene.')) {
        // the director offers the scene once its objective is current (and the world allows)
        r.step(70);
        const scene = r.dialogue.started.at(-1)?.[0];
        r.scene(scene ?? `scene-${npc}`, npc);
      } else r.talk(npc);
      return;
    }
    case 'kill': r.kill(target[0]!, o.spawnTag!, o.required ?? 1); return;
    case 'interact': r.use(target[0]!); return;
    case 'collect': throw new Error(`autoplay: collect objective ${q}.${o.id} is done through its prop`);
    case 'event': break;
    default: throw new Error(`autoplay: ${o.type}`);
  }
  const ev = target[0]!;
  if (ev === 'dialogue.ended') return void r.reads(arr(match.npcId));
  if (ev === 'interact') return void arr(match.interactableId).forEach((id) => r.use(id));
  if (ev === 'flag.changed') return void r.state.setFlag(String(match.key), true);
  if (ev === 'dive.started') return void r.emit('dive.started', { volumeId: M24_VOLUME });
  if (ev === 'dive.surfaced') return void r.emit('dive.surfaced', { volumeId: String(match.volumeId ?? 'water.greyfen.x'), pocketId: (match.pocketId as string) ?? null });
  if (ev === 'ferry.arrived') return void r.emit('ferry.arrived', { routeId: 'ferry.greyfen.reedgate-mere', stop: 'mere', skipped: false });
  if (ev === 'story.r12.picked') { r.state.setFlag(R12_PICK, opts.r12 ?? 'burned'); r.emit('story.r12.picked'); return; }
  if (ev === 'story.r12.burnDown') return void r.kill('fen-leech', 'r12.burn', 6);
  if (ev === 'story.r12.cutDown') return void r.kill('fen-leech', 'r12.cut', 15);
  if (ev === 'story.m25.drink') return void r.step(M25_DRINK_TICKS + 2);
  if (ev === 'story.r13.sung') {
    r.use(R13_ALTAR); // the first press plays the teaching scene
    r.scene(R13_SONG_SCENE, R13_SONG_NPC);
    r.step(2);
    singBar(r, SONG_TIER.lesson, { started: true }); // the scene's end began the lesson bar: sing it
    singBar(r, SONG_TIER.real);
    return;
  }
  if (ev === 'story.r13.calm') return void r.step(R13_CALM_TICKS + 2);
  if (ev === 'wyrm.hathren') return void r.emit('wyrm.hathren', { beat: String(match.beat) });
  if (ev === 'shrine.rekindled') { r.state.setFlag('shrine.hathrens-mere.lit', true); r.emit('shrine.rekindled', { shrineId: 'hathrens-mere' }); r.step(2); r.emit('wyrm.hathren', { beat: 'quiet' }); return; }
  if (ev === 'story.r14.chosen') { r.state.setFlag('story.r14.choice', opts.r14 ?? 'returned'); r.emit('story.r14.chosen'); return; }
  if (ev === 'story.m27.blinds') {
    if (opts.m27 === 'seen') {
      r.standing.set('greyfen.q.m27.pack1', ['h1', 'h2']);
      r.step(40);
      r.emit('ai.spotted', { actorId: 'h1', targetId: 'player' });
      r.standing.set('greyfen.q.m27.pack1', []);
    } else r.emit('trigger.enter', { triggerId: M27_BLINDS_END, actorId: 'player' });
    r.step(40);
    return;
  }
  if (ev === 'story.m27.set') return void r.step(M27_BROOD_TICKS + 2);
  if (ev === 'boss.defeated') { r.emit('boss.defeated', { bossId: D05_BOSS, actorId: 'murkjaw' }); r.state.setFlag(`boss.${D05_BOSS}.outcome`, 'defeated'); return; }
  throw new Error(`autoplay: no driver for ${q}.${o.id} (${ev})`);
}

/** Picks the prop whose objective is this one (collect objectives are done by their pick). */
function doCollect(r: Rig, q: string, o: ObjectiveDef): boolean {
  const prop = r.propFor(q, o.id);
  return prop ? r.use(prop) : false;
}

/** Plays `quest` until it completes (or `stopAt` is current). Returns the objective ids done, in order. */
export function autoplay(r: Rig, quest: string, opts: PlayOpts = {}): string[] {
  const order: string[] = [];
  for (let i = 0; i < 120 && r.qs(quest) === 'active'; i++) {
    const view = r.manager.objectives(quest).find((v) => v.current);
    if (!view) { r.step(2); r.manager.recheck(); if (!r.manager.objectives(quest).some((v) => v.current)) break; continue; }
    const o = view.def;
    if (opts.stopAt && opts.stopAt[0] === quest && opts.stopAt[1] === o.id) return order;
    opts.hook?.(r, quest, o);
    if (o.type === 'collect') {
      if (!doCollect(r, quest, o)) throw new Error(`autoplay: no live prop for ${quest}.${o.id}`);
    } else doObjective(r, quest, o, opts);
    order.push(o.id);
    r.step(3);
    r.manager.recheck();
  }
  return order;
}

/** Plays the quests in order, each once (for a chain test). */
export function autoplayAll(r: Rig, quests: string[], opts: PlayOpts = {}): void {
  for (const q of quests) {
    if (r.qs(q) === 'inactive') {
      if (!r.manager.start(q)) throw new Error(`cannot start ${q}`);
    }
    autoplay(r, q, opts);
    if (r.qs(q) !== 'completed') throw new Error(`autoplay: ${q} stopped at ${r.manager.objectives(q).find((v) => v.current)?.def.id ?? 'nothing current'} (${r.qs(q)})`);
  }
}
