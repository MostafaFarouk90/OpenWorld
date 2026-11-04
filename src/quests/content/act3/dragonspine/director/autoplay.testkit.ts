// Plays a lower Dragonspine quest through the rig by its definition: whatever objective is current is done the way the game does it.
// Branch choices are options; a `hook` sees each objective before it is done (for early-event tests).
import type { ObjectiveDef } from '../../../../types';
import { DRAGONSPINE_GROUP_OBJECTIVES } from '../groups';
import { M28_VIEW_TICKS, R15_DELIVER_RADIUS, routeById } from './climb';
import { M28_LEDGE_FLAGS } from '../m28.quest';
import { R15_SLEDS } from '../r15.quest';
import { R16_CHOICE } from '../r16.quest';
import { M30_RUBBING_FLAGS, M30_STEP_FLAGS, M30_LIT_FLAG } from '../m30.quest';
import { R17_DOWN, R17_UP } from '../r17.quest';
import { R18_EGG_PROPS, R18_NEST_PROPS } from '../r18.quest';
import { LAST_ANVIL } from '../../../../../shrine/act3/tuning';
import type { Rig } from './rig.testkit';

export interface PlayOpts {
  r15?: 'lodge' | 'hut';
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

/** One sled hauled from the shed to the cache and dropped there. */
export function haulSled(r: Rig, n: number): void {
  const id = R15_SLEDS[n - 1]!;
  const route = routeById(id)!;
  r.player.feet = { ...route.checkpoints[0]! };
  if (!r.sleds.take(id)) throw new Error(`autoplay: could not take ${id}`);
  const end = route.checkpoints.at(-1)!;
  r.player.feet = { x: end.x + R15_DELIVER_RADIUS / 2, y: end.y, z: end.z };
  r.carrySeconds(1);
  r.sleds.drop();
  r.step(2);
}

const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : v === undefined ? [] : [String(v)]);

export function playObjective(r: Rig, q: string, o: ObjectiveDef, opts: PlayOpts): void {
  const target = arr(o.target);
  const match = o.match ?? {};
  switch (o.type) {
    case 'talk': {
      const npc = target[0]!;
      if (npc.startsWith('scene.')) {
        r.step(70);
        r.scene(r.dialogue.started.at(-1)?.[0] ?? `scene-${npc}`, npc);
      } else {
        if (q === 'r16' && o.id === 'choice') r.state.setFlag(R16_CHOICE, opts.r16 ?? 'give');
        r.talk(npc);
      }
      return;
    }
    case 'kill': r.kill(target[0]!, o.spawnTag!, o.required ?? 1); return;
    case 'interact': r.use(target[0]!); return;
    case 'event': break;
    default: throw new Error(`autoplay: ${o.type}`);
  }
  const ev = target[0]!;
  if (ev === 'dialogue.ended') return void r.reads(arr(match.npcId));
  if (ev === 'interact') return void arr(match.interactableId).forEach((id) => r.use(id));
  const group = DRAGONSPINE_GROUP_OBJECTIVES.find((g) => g.quest === q && g.down === ev);
  if (group) return void clearGroups(r, group.groups);
  switch (`${q}.${o.id}`) {
    case 'm28.trailhead': r.at('dragonspine.m28.trailhead'); r.step(40); return;
    case 'm28.ledge1': case 'm28.ledge2': {
      const i = o.id === 'ledge1' ? 1 : 2;
      void M28_LEDGE_FLAGS;
      r.at(`dragonspine.m28.leap.${i}`); r.step(40); return;
    }
    case 'm28.view': r.at('dragonspine.m28.crag'); r.step(40); r.step(M28_VIEW_TICKS + 10); return;
    case 'r15.hauls': [1, 2, 3].forEach((n) => haulSled(r, n)); return;
    case 'r16.mouth': r.at('dragonspine.cave.mouth'); r.step(40); return;
    case 'm30.sweep': case 'm30.relight': case 'm30.sound': r.state.setFlag(String(match.key), true); return;
    case 'm30.rekindle': r.state.setFlag(M30_LIT_FLAG, true); r.emit('shrine.rekindled', { shrineId: LAST_ANVIL.id }); return;
    case 'm30.rubbings':
      LAST_ANVIL.rubbingIds.forEach((id, i) => { r.state.setFlag(M30_RUBBING_FLAGS[i]!, true); r.emit('rubbing.taken', { rubbingId: id }); });
      return;
    case 'r17.take': r.use('use:r17-bundle'); return;
    case 'r18.nested': [0, 1, 2].forEach((i) => { r.use(R18_EGG_PROPS[i]!); r.use(R18_NEST_PROPS[i]!); }); return;
    default:
  }
  if (q === 'r17' && o.id.startsWith('shrine')) {
    const n = Number(o.id.slice(6));
    r.at(`dragonspine.wayside.${n}`);
    if (!r.wayside.light(n)) throw new Error(`autoplay: shrine ${n} would not light`);
    return;
  }
  void M30_STEP_FLAGS; void R17_DOWN; void R17_UP;
  throw new Error(`autoplay: no driver for ${q}.${o.id} (${ev})`);
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
