// Plays a summit quest through the rig by its definition: whatever objective is current is done the way the game does it. Branch choices are
// options; a `hook` sees each objective before it is done (for early-event tests).
import type { ObjectiveDef } from '../../../../types';
import { SUMMIT_GROUP_OBJECTIVES } from '../groups';
import { ARENA, TRIAL_ID } from './trial';
import { FLIGHT_FROM, FLIGHT_TICKS } from './net';
import { LEDGE as D06_LEDGE, LANDING } from './aerie';
import { LEDGE_ANCHOR } from './oath';
import { M31_LEDGE_FLAGS } from '../m31.quest';
import { D06_SKARL_OUTCOME } from '../d06.quest';
import { M34_LIT_FLAG } from '../m34.quest';
import { R16_CHOICE } from '../../dragonspine/r16.quest';
import type { Rig } from './rig.testkit';

export interface PlayOpts {
  m31?: 'won' | 'yielded';
  d06?: 'spared' | 'defeated';
  r16?: 'give' | 'keep';
  /** Called before each objective is done. */
  hook?: (r: Rig, quest: string, o: ObjectiveDef) => void;
  /** Stop when this objective is current instead of doing it. */
  stopAt?: [string, string];
}

/** A group's members stand for a poll, then are all gone (killed, spared or calmed). */
export function clearGroups(r: Rig, groups: readonly string[]): void {
  for (const g of groups) r.standing.set(g, ['a', 'b']);
  r.step(40);
  for (const g of groups) r.standing.set(g, []);
  r.step(40);
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v === undefined ? [] : [String(v)]);
/** The scene tree a `scene.*` talk target plays (`scene.m31.climb` -> `scene-m31-climb`). */
export const sceneOf = (npc: string): string => npc.replace(/\./g, '-');

export function playObjective(r: Rig, q: string, o: ObjectiveDef, opts: PlayOpts): void {
  const target = arr(o.target);
  const match = o.match ?? {};
  const key = `${q}.${o.id}`;
  switch (o.type) {
    case 'talk': {
      const npc = target[0]!;
      if (npc.startsWith('scene.')) {
        if (key === 'm31.before') r.at(ARENA);
        if (key === 'd06.lip') r.at(D06_LEDGE);
        r.step(key === 'd06.outcome' ? 260 : 70);
        r.scene(sceneOf(npc), npc);
        if (key === 'm31.before') r.step(2);
      } else {
        if (q === 'r16') r.state.setFlag(R16_CHOICE, opts.r16 ?? 'give');
        r.talk(npc);
      }
      return;
    }
    case 'event': break;
    default: throw new Error(`autoplay: ${o.type}`);
  }
  const ev = target[0]!;
  if (ev === 'dialogue.ended') return void r.reads(arr(match.npcId));
  if (ev === 'interact') return void arr(match.interactableId).forEach((id) => r.use(id));
  const group = SUMMIT_GROUP_OBJECTIVES.find((g) => g.quest === q && g.down === ev);
  if (group) return void clearGroups(r, group.groups);
  switch (key) {
    case 'm31.gate': r.at('dragonspine.summit-gate'); r.step(40); return;
    case 'm31.ledge1': case 'm31.ledge2': case 'm31.ledge3': {
      const i = Number(o.id.slice(5));
      void M31_LEDGE_FLAGS;
      r.at(`dragonspine.roost.leap.${i}`); r.step(40); return;
    }
    case 'm31.trial':
      r.at(ARENA);
      r.step(200); // the director starts the trial after its grace
      r.emit('trial.ended', { trialId: TRIAL_ID, reason: opts.m31 ?? 'yielded' });
      r.step(2);
      return;
    case 'm31.hearth': r.at('dragonspine.hearth.eadgyth'); r.step(40); return;
    case 'm33.flight': r.at(FLIGHT_FROM); r.step(FLIGHT_TICKS + 80); return;
    case 'm34.rekindle': r.state.setFlag(M34_LIT_FLAG, true); r.emit('shrine.rekindled', { shrineId: 'wyrms-hearth' }); return;
    case 'm34.ledge': r.at(LEDGE_ANCHOR); r.step(40); return;
    case 'd06.land': r.emit('glide.landed', { at: r.at(LANDING) }); r.step(2); return;
    case 'd06.skarl': {
      const out = opts.d06 ?? 'defeated';
      r.state.setFlag(D06_SKARL_OUTCOME, out);
      r.emit(out === 'spared' ? 'boss.spared' : 'boss.defeated', { bossId: 'corvin-skarl', actorId: 'skarl' });
      r.step(2);
      return;
    }
    default:
  }
  throw new Error(`autoplay: no driver for ${key} (${ev})`);
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
    playObjective(r, quest, o, opts);
    order.push(o.id);
    r.step(3);
    r.manager.recheck();
  }
  return order;
}

/** Plays the quests in order, each once (for a chain test). */
export function autoplayAll(r: Rig, quests: string[], opts: PlayOpts = {}): void {
  for (const q of quests) {
    if (r.qs(q) === 'inactive' && !r.manager.start(q)) throw new Error(`cannot start ${q}`);
    autoplay(r, q, opts);
    if (r.qs(q) !== 'completed') throw new Error(`autoplay: ${q} stopped at ${r.manager.objectives(q).find((v) => v.current)?.def.id ?? 'nothing current'} (${r.qs(q)})`);
  }
}

export { D06_LEDGE };
