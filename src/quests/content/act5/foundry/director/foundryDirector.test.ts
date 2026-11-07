// The Foundry director's set pieces on the real bus, flag store and quest manager (every Act 5 quest registered, with a
// stand-in M52 completed and the phase hold open), and stubs for the siege, the spells, the lava and the interiors.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../../../../core/EventBus';
import type { GameContext } from '../../../../../core/Game';
import type { GameEventMap } from '../../../../../core/events';
import { Services } from '../../../../../core/Services';
import { WorldState } from '../../../../../state/WorldState';
import { QuestManager } from '../../../../QuestManager';
import { installObjectiveFlags } from '../../../../objectiveFlags';
import { makeKit, type Off } from '../../../act2/director/kit';
import { installArms, installGroupObjectives } from '../../../act4/harrowmark/director/generic';
import { ACT5_OBJECTIVE_FLAGS, ACT5_QUEST_DEFS } from '../..';
import { phaseHolds } from '../../../../../region/regions';
import { installComplete, installDoneWhenRecheck } from './generic';
import { FOUNDRY_A5_ARMS, FOUNDRY_A5_GROUPS, M53_PICKETS_ARM } from './tables';
import { installD09, installM53, installR27, installR28, installR30, lineReady, litCount, nextSluice, pairsToArm, tooHotToLight } from './quests';
import {
  D09_GUARDS_ARM, D09_GUARDS_DOWN, D09_SLAG, D09_SLAG_FAILS, D09_SLUICE, D09_TURNED, D09_WENNA_MET, M53_BROKEN_ARM, M53_SCAR_BAND,
  M53_TRUCE_SEEN, R27_CHARGE, R27_FAR_OPEN, R27_HELD, R27_LAMP, R27_LINE_READY, R27_PROP, R28_LIT, R28_PYRES, R30_TUNE, R30_VERSE,
} from '../flags';
import { D09_ENTERED, D09_SLUICE_USE } from '../d09.quest';
import { R28_LIGHT } from '../r28.quest';
import { R30_ANVIL, R30_SUNG, R30_YSMERYTH_USE } from '../r30.quest';
import { M53_WITHDRAWN } from '../m53.quest';
import { D09_GUARD_PAIR_ARM } from '../spawners';
import { snapshotTaken } from '../../../../../state/favour';

function rig(flags: Record<string, boolean | number | string> = {}) {
  const events = new EventBus<GameEventMap>(() => {});
  const state = new WorldState(events, () => {});
  const services = new Services();
  const manager = new QuestManager({ bus: events as never, state: state as never, playerId: () => 'player', warn: () => {} });
  manager.register({ id: 'm52', titleKey: 'x', summaryKey: 'x', sequential: true, objectives: [{ id: 'x', type: 'event', target: 'test.m52', textKey: 'x' }] });
  for (const q of ACT5_QUEST_DEFS) manager.register(q);
  const flagsOff = installObjectiveFlags(ACT5_OBJECTIVE_FLAGS, events as never, state as never, manager);
  services.provide('quests' as never, manager as never);
  for (const h of phaseHolds('caldera')) state.setFlag(h, true);
  for (const [k, v] of Object.entries(flags)) state.setFlag(k, v);
  manager.start('m52');
  manager.complete('m52');
  state.setFlag('story.m52.complete', true);

  const standing = new Map<string, string[]>();
  services.provide('groupStanding' as never, { standing: (id: string) => standing.get(id) ?? [], onMemberLeft: () => () => {} } as never);
  services.provide('enemies' as never, { alive: (id: string) => standing.get(id) ?? [] } as never);
  const siege = { current: null as null | { id: string }, done: false, starts: 0, start(id: string) { this.starts++; this.current = { id }; return true; }, completed() { return this.done; } };
  services.provide('siege' as never, siege as never);
  const interiors = { current: null as string | null };
  services.provide('interiors' as never, interiors as never);
  const spells = { burn: 0, uses: [] as number[], useShard(g: number) { this.uses.push(g); this.burn += g; return { gained: g, scarred: false }; } };
  services.provide('spells' as never, spells as never);
  const lava = { added: [] as string[], live: new Set<string>(), add(d: { id: string }) { this.added.push(d.id); this.live.add(d.id); return () => void this.live.delete(d.id); } };
  services.provide('lava' as never, lava as never);
  const dialogue = { starts: [] as string[], start(tree: string, npc: string) { this.starts.push(`${tree}/${npc}`); return true; } };
  services.provide('dialogue' as never, dialogue as never);
  const toasts: string[] = [];
  events.on('hud.toast' as never, ((e: { textKey: string }) => void toasts.push(e.textKey)) as never);
  const ctx = {
    events, state, services,
    anchors: { find: (id: string) => ({ id, position: { x: 10482, y: 300, z: 9267 }, yaw: 0 }), define: () => () => {} },
    triggers: { add: () => () => {} },
    strings: { t: (k: string) => k, register: () => () => {} },
  } as unknown as GameContext;
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const offs: Off[] = [];
  const { kit, tick } = makeKit(ctx, (m) => console.warn(m), offs);
  let clock = 0;
  installArms(kit, FOUNDRY_A5_ARMS);
  installComplete(kit);
  installGroupObjectives(kit, FOUNDRY_A5_GROUPS);
  installDoneWhenRecheck(kit);
  installR27(kit);
  installR28(kit);
  const beat = installR30(kit, offs, () => clock);
  installM53(kit);
  installD09(kit);
  const emit = (type: string, payload: unknown = {}): void => void events.emit(type as never, payload as never);
  const r = {
    state, manager, siege, interiors, spells, lava, toasts, standing, beat, emit, dialogue,
    step: (n = 1): void => { for (let i = 0; i < n; i++) tick(); },
    advance: (ms: number) => { clock += ms; },
    talk: (npcId: string) => emit('dialogue.ended', { dialogueId: `npc-${npcId}`, npcId, reason: 'completed' }),
    read: (id: string) => emit('dialogue.ended', { dialogueId: id, npcId: id, reason: 'completed' }),
    use: (id: string) => emit('interact', { interactableId: id, kind: 'prop', actorId: 'player', action: 'interact' }),
    dispose: () => { for (const o of offs.splice(0)) o(); flagsOff.dispose(); warn.mockRestore(); },
  };
  return r;
}
let cur: ReturnType<typeof rig> | null = null;
const make = (f?: Record<string, boolean | number | string>) => (cur = rig(f));
afterEach(() => { cur?.dispose(); cur = null; });

describe('pure rules', () => {
  it('the line, the lit count, the cap, the guard pairs and the sluice order', () => {
    const set = new Set<string>();
    expect(lineReady((k) => set.has(k))).toBe(false);
    for (const n of [1, 2, 3]) set.add(R27_PROP(n)).add(R27_CHARGE(n));
    for (const n of [1, 2, 3, 4]) set.add(R27_LAMP(n));
    expect(lineReady((k) => set.has(k))).toBe(true);
    expect(litCount((k) => k === R28_LIT(1) || k === R28_LIT(4))).toBe(2);
    expect(tooHotToLight(90)).toBe(false);
    expect(tooHotToLight(91)).toBe(true);
    expect(pairsToArm(0)).toEqual([0, 1]);
    expect(pairsToArm(2)).toEqual([1]);
    expect(pairsToArm(4)).toEqual([]);
    expect([0, 1, 2, 3].map(nextSluice)).toEqual([1, 3, 2, undefined]);
  });
});

describe('R27', () => {
  it('F6 Leaders opens the far seal at the start; the line, the hold on the siege and the held flag', () => {
    const r = make({ 'story.r21.choice': 'leaders' });
    r.manager.start('r27');
    r.step(2);
    expect(r.state.getFlag(R27_FAR_OPEN)).toBe(true);
    r.talk('wenna');
    r.emit('interior.entered', { interiorId: 'stokers-tunnel', doorId: 'stokers-tunnel' });
    r.step(2);
    expect(r.manager.objectiveDone('r27', 'enter')).toBe(true);
    r.talk('tunnel-captain');
    for (const n of [1, 2, 3]) { r.use(`use:r27-prop-${n}`); r.state.setFlag(R27_PROP(n), true); }
    for (const n of [1, 2, 3, 4]) { r.use(`use:r27-lamp-${n}`); r.state.setFlag(R27_LAMP(n), true); }
    for (const n of [1, 2, 3]) { r.use(`use:r27-charge-${n}`); r.state.setFlag(R27_CHARGE(n), true); }
    expect(r.state.getFlag(R27_LINE_READY)).toBe(true);
    r.read('note-r27-tally'); r.read('note-r27-old-door'); r.read('note-r27-roster');
    r.step(2);
    r.talk('tunnel-captain');
    r.step(2);
    expect(r.manager.isObjectiveCurrent('r27', 'hold')).toBe(true);
    // outside the tunnel nothing starts
    r.step(40);
    expect(r.siege.starts).toBe(0);
    r.interiors.current = 'stokers-tunnel';
    r.step(40);
    expect(r.siege.starts).toBe(1);
    r.step(40);
    expect(r.siege.starts).toBe(1);
    r.emit('siege.completed', { siegeId: 'r27' });
    r.step(2);
    expect(r.state.getFlag(R27_HELD)).toBe(true);
    expect(r.manager.objectiveDone('r27', 'hold')).toBe(true);
  });

  it('F6 All leaves the far seal shut', () => {
    const r = make();
    r.manager.start('r27');
    r.step(2);
    expect(r.state.getFlag(R27_FAR_OPEN)).toBeUndefined();
  });
});

describe('R28 lighting', () => {
  const ready = (r: ReturnType<typeof rig>) => {
    r.manager.start('r28');
    for (const o of r.manager.objectives('r28').map((v) => v.def.id)) if (o !== 'rite' && o !== 'farewell') r.manager.completeObjective('r28', o);
    r.step(2);
    expect(r.manager.isObjectiveCurrent('r28', 'rite')).toBe(true);
  };
  it('charges 10 Burn per pyre and counts the lit ones', () => {
    const r = make();
    ready(r);
    r.use(R28_LIGHT(1)); r.use(R28_LIGHT(1)); r.use(R28_LIGHT(3));
    expect(r.spells.uses).toEqual([10, 10]);
    expect(r.state.getFlag(R28_PYRES)).toBe(2);
    expect(r.toasts).toContain('quest.r28.lit');
  });
  it('refuses over the cap with a toast', () => {
    const r = make();
    ready(r);
    r.spells.burn = 95;
    r.use(R28_LIGHT(2));
    expect(r.spells.uses).toEqual([]);
    expect(r.state.getFlag(R28_LIT(2))).toBeUndefined();
    expect(r.toasts).toContain('quest.r28.tooHot');
  });
  it('with F8 All the walkers light beside you', () => {
    const r = make({ 'story.r24.choice': 'all' });
    ready(r);
    r.use(R28_LIGHT(4));
    expect(r.toasts).toContain('quest.r28.litWalkers');
  });
  it('does nothing before the rite step', () => {
    const r = make();
    r.manager.start('r28');
    r.use(R28_LIGHT(1));
    expect(r.spells.uses).toEqual([]);
  });
});

describe('R30', () => {
  it('Ysmeryth\'s prop opens her tree only while the lines step is current', () => {
    const r = make();
    r.use(R30_YSMERYTH_USE);
    r.step(2);
    expect(r.dialogue.starts).toEqual([]);
    r.manager.start('r30');
    r.manager.completeObjective('r30', 'brief');
    r.step(2);
    r.use(R30_YSMERYTH_USE);
    r.step(2);
    expect(r.dialogue.starts).toEqual(['npc-ysmeryth/ysmeryth']);
  });

  it('the anvil run passes on the assist and the camp sings after the verse', () => {
    const r = make();
    r.manager.start('r30');
    for (const o of ['brief', 'lines', 'pages']) r.manager.completeObjective('r30', o);
    r.step(2);
    expect(r.manager.isObjectiveCurrent('r30', 'tune')).toBe(true);
    // three bars with no strikes: two falters, then the assist on the third
    for (let bar = 0; bar < 6 && !r.state.getFlag(R30_TUNE); bar++) {
      r.use(R30_ANVIL);
      r.advance(20_000);
      r.step(12);
    }
    expect(r.state.getFlag(R30_TUNE)).toBe(true);
    r.step(2);
    r.state.setFlag(R30_VERSE, 'keepers');
    r.talk('tobb');
    r.step(70);
    expect(r.state.getFlag(R30_SUNG)).toBe(true);
  });
});

describe('M53', () => {
  it('writes the Scar band while the truce is ahead, then Confront arms the loyalists and Vey withdraws', () => {
    const r = make({ 'story.m21.choice': 'confront', 'story.f10.scars': 9 });
    r.manager.start('m53');
    r.step(35);
    expect(r.state.getFlag(M53_SCAR_BAND)).toBe('heavy');
    r.state.setFlag(M53_TRUCE_SEEN, true);
    r.step(2);
    expect(r.state.getFlag(M53_WITHDRAWN)).toBe(true);
    expect(r.state.getFlag(M53_BROKEN_ARM)).toBe(true);
    expect(r.state.getFlag(M53_PICKETS_ARM)).toBeUndefined();
  });
  it('Spy arms only the pickets', () => {
    const r = make({ 'story.m21.choice': 'spy' });
    r.manager.start('m53');
    r.state.setFlag(M53_TRUCE_SEEN, true);
    r.step(2);
    expect(r.state.getFlag(M53_PICKETS_ARM)).toBe(true);
    expect(r.state.getFlag(M53_BROKEN_ARM)).toBeUndefined();
  });
});

describe('D09', () => {
  const into = (r: ReturnType<typeof rig>) => {
    r.manager.start('m53');
    r.manager.complete('m53');
    expect(r.manager.start('d09')).toBe(true);
    r.talk('alric');
    r.emit('interior.entered', { interiorId: 'foundry-descent', doorId: 'foundry-descent' });
    r.step(2);
  };
  it('takes the d09 snapshot once on entry and writes the turned count by the Grisel band (24 and 25)', () => {
    for (const [grisel, turned] of [[24, 2], [25, 4]] as const) {
      const r = make({ 'story.m21.choice': 'spy' });
      r.state.addFavour('grisel', grisel - r.state.favour('grisel'), 'script');
      into(r);
      expect(snapshotTaken(r.state, 'd09')).toBe(true);
      expect(r.state.getFlag(D09_ENTERED)).toBe(true);
      expect(r.state.getFlag(D09_TURNED)).toBe(turned);
      r.state.addFavour('grisel', 40, 'script');
      r.emit('interior.entered', { interiorId: 'foundry-descent', doorId: 'foundry-descent' });
      expect(r.state.getFlag('favour.snapshot.d09.grisel')).toBe(grisel);
      r.dispose(); cur = null;
    }
  });
  it('the slag: a wrong sluice floods for 8 s and resets; after two fails the lesson; the right order opens the lift', () => {
    const r = make();
    into(r);
    for (const o of ['patrol', 'stoker', 'plate']) r.manager.completeObjective('d09', o);
    r.step(2);
    expect(r.manager.isObjectiveCurrent('d09', 'slag')).toBe(true);
    r.use(D09_SLUICE_USE(1));
    expect(r.state.getFlag(D09_SLUICE(1))).toBe(true);
    r.use(D09_SLUICE_USE(2)); // wrong: 3 comes next
    expect(r.state.getFlag(D09_SLUICE(1))).toBeUndefined();
    expect(r.state.getFlag(D09_SLAG_FAILS)).toBe(1);
    expect(r.lava.live.size).toBe(4);
    r.step(8 * 60 + 2);
    expect(r.lava.live.size).toBe(0);
    r.use(D09_SLUICE_USE(3));
    expect(r.state.getFlag(D09_SLAG_FAILS)).toBe(2);
    expect(r.toasts).toContain('quest.d09.slagNext.1');
    r.step(8 * 60 + 2);
    for (const n of [1, 3, 2]) r.use(D09_SLUICE_USE(n));
    expect(r.state.getFlag(D09_SLAG)).toBe(true);
    r.step(2);
    expect(r.manager.objectiveDone('d09', 'slag')).toBe(true);
  });
  const toGuards = (r: ReturnType<typeof rig>) => {
    into(r);
    for (const o of ['patrol', 'stoker', 'plate', 'slag']) r.manager.completeObjective('d09', o);
    r.step(2);
    expect(r.manager.isObjectiveCurrent('d09', 'guards')).toBe(true);
  };
  it('Confront arms both guard pairs as the step comes up', () => {
    const r = make({ 'story.m21.choice': 'confront' });
    toGuards(r);
    expect(r.state.getFlag(D09_GUARDS_ARM)).toBe(true);
    expect(r.state.getFlag(D09_GUARD_PAIR_ARM(0))).toBe(true);
    expect(r.state.getFlag(D09_GUARD_PAIR_ARM(1))).toBe(true);
  });
  it('Spy waits for Wenna, then arms only the pair she did not turn; the turned pair never blocks the step', () => {
    const r = make({ 'story.m21.choice': 'spy' });
    toGuards(r);
    expect(r.state.getFlag(D09_GUARDS_ARM)).toBeUndefined();
    r.state.setFlag(D09_WENNA_MET, true);
    r.step(2);
    expect(r.state.getFlag(D09_GUARD_PAIR_ARM(0))).toBeUndefined();
    expect(r.state.getFlag(D09_GUARD_PAIR_ARM(1))).toBe(true);
    r.standing.set('d09.guards-b', ['g3']);
    r.step(31);
    r.standing.set('d09.guards-b', []);
    r.step(31);
    expect(r.state.getFlag(D09_GUARDS_DOWN)).toBe(true);
  });
});
