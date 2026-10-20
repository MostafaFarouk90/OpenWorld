// Act 1 density pass, batch 4 (Harrowmark part 2: M08, M09, M10, D02): the objective flags that open doors and raise the
// new spawns, the spawn tables and gates, the new props, notes and NPCs and where they stand, the new dialogues, and
// saves from before the new steps.
import { describe, expect, it } from 'vitest';
import { makeWorld } from './testKit';
import { installObjectiveFlags } from './objectiveFlags';
import { QuestProps } from './props';
import { OBJECTIVE_FLAGS } from './content/objectiveFlags';
import { QUEST_PROPS } from './content/props';
import { QUEST_NOTES } from './content/notes';
import { m08, M08_WAITING } from './content/m08.quest';
import { m09, M09_STRONGBOX } from './content/m09.quest';
import { m10 } from './content/m10.quest';
import { d02, D02_PREREQUISITES } from './content/d02.quest';
import { M09_CLERK_GOLD } from './content/gold';
import type { QuestDef } from './types';
import { DENSITY_SPAWNERS_A } from '../enemies/densitySpawners';
import { DENSITY_LAYOUT_HM } from '../harrowmark/density.layout';
import { HARROWMARK_LAYOUT } from '../harrowmark/harrowmark.layout';
import { HARROWMARK_DOOR_LOCKS, HARROWMARK_FLAG_BLOCKERS } from '../interiors/harrowmark/locks';
import { KEEP_HALL_DEF } from '../interiors/harrowmark/keepHall';
import { COUNTING_HOUSE_DEF } from '../interiors/harrowmark/countingHouse';
import { UNDERWAYS_ARENA_GATE, UNDERWAYS_DEF } from '../interiors/underways/generate';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { createEffectRunner } from './effects';
import { validateDialogue } from '../dialogue/validate';
import { npcArmourer, npcClerk, npcGrisel, npcKeepGuard, npcWace } from '../dialogue/content/npc-court.dialogue';
import { npcMerrin } from '../dialogue/content/npc-merrin.dialogue';
import { dialogueStringsDensityC } from '../dialogue/strings.density-c.en';
import { dialogueStrings } from '../dialogue/strings.en';
import { questStringsDensityC } from './strings.density-c.en';
import { questStrings } from './strings.en';
import { HARROWMARK_NPC_DEFS, HARROWMARK_NPC_STRINGS_EN } from '../harrowmark/npcDefs';

type W = ReturnType<typeof makeWorld>;
const talk = (w: W, npcId: string) => w.bus.emit('dialogue.ended', { npcId, reason: 'completed' });
const interact = (w: W, interactableId: string) => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action: 'interact' });
const stubs: QuestDef[] = D02_PREREQUISITES.filter((id) => !['m08', 'm09', 'm10'].includes(id)).map((id) => ({ id, titleKey: 't', summaryKey: 's', objectives: [{ id: 'o1', type: 'talk' as const, target: 'x', textKey: 'k' }] }));

function flagsWorld(defs: QuestDef[] = [m08, m09, m10, ...stubs, d02]) {
  const w = makeWorld(defs);
  const flags = installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
  for (const d of stubs) if (defs.includes(d)) { w.manager.start(d.id); w.manager.complete(d.id); }
  return { ...w, objectiveFlags: flags };
}

describe('batch 4 objective flags', () => {
  it('M08: the Keep opens on the warden\'s look, not before; the two waiting count once each', () => {
    const w = flagsWorld();
    w.manager.start('m08');
    w.manager.completeObjective('m08', 'o1');
    talk(w, 'armourer');
    expect(w.flags.has('story.m08.keepOpen')).toBe(false);
    talk(w, 'keep-guard');
    expect(w.flags.get('story.m08.keepOpen')).toBe(true);
    expect(M08_WAITING).toEqual(['merrin', 'grisel']);
    talk(w, 'merrin');
    talk(w, 'merrin');
    expect(w.manager.objectiveDone('m08', 'wait')).toBe(false);
    talk(w, 'grisel');
    expect(w.manager.objectiveDone('m08', 'wait')).toBe(true);
  });

  it('M09: the clerk\'s key opens the side door; the strongbox is the fourth paper', () => {
    const w = flagsWorld();
    w.manager.start('m09');
    w.manager.completeObjective('m09', 'o1');
    expect(w.flags.has('story.m09.houseOpen')).toBe(false);
    interact(w, 'use:m09-clerk-key');
    expect(w.flags.get('story.m09.houseOpen')).toBe(true);
    expect(w.flags.get('story.m09.started')).toBe(true);
    w.bus.emit('interior.entered', { interiorId: 'counting-house' });
    talk(w, 'note-m09-daybook');
    for (const n of [1, 2, 3]) interact(w, `use:m09-invoice-${n}`);
    expect(w.manager.objectiveDone('m09', 'o3')).toBe(false);
    interact(w, M09_STRONGBOX);
    expect(w.manager.objectiveDone('m09', 'o3')).toBe(true);
  });

  it('M10: the ambush waits for the orders and stops once beaten; Gerta\'s hand-in leaves the Ashmare unlocked', () => {
    const w = flagsWorld();
    w.manager.start('m10');
    for (const o of ['o1', 'o2', 'o3']) w.manager.completeObjective('m10', o);
    expect(w.flags.has('story.m10.ordersTaken')).toBe(false);
    talk(w, 'note-m10-orders');
    expect(w.flags.get('story.m10.ordersTaken')).toBe(true);
    for (const id of ['a', 'b']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'guildhall-thug', spawnTag: 'm10.ambush' });
    expect(w.flags.get('story.m10.ambushBeaten')).toBe(true);
    talk(w, 'gerta');
    expect(w.flags.get('story.m10.ashmare')).toBe(true);
    expect(w.manager.state('m10')).toBe('active'); // Wace, the ride and the gate still to come
  });

  it('D02: the stray, then the valves raise the sluice hounds, and dealing with them opens the arena gate', () => {
    const w = flagsWorld();
    for (const q of ['m08', 'm09', 'm10']) { w.manager.start(q); w.manager.complete(q); }
    w.manager.start('d02');
    w.manager.completeObjective('d02', 'o1');
    w.bus.emit('mercy', { verb: 'calm', creature: 'ember-hound', actorId: 's', spawnTag: 'd02.stray' });
    expect(w.flags.has('story.d02.strayDealt')).toBe(false);
    w.bus.emit('actor.died', { actorId: 's2', killerId: 'p', kind: 'ember-hound', spawnTag: 'd02.stray' });
    expect(w.flags.get('story.d02.strayDealt')).toBe(true);
    talk(w, 'rook');
    w.bus.emit('interior.entered', { interiorId: 'underways' });
    for (const id of ['h1', 'h2', 'h3', 'h4']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'ember-hound', spawnTag: 'd02.kennels' });
    talk(w, 'note-d02-tally');
    interact(w, 'use:d02-valve-1');
    interact(w, 'use:d02-valve-1');
    expect(w.flags.has('story.d02.valvesOpen')).toBe(false);
    interact(w, 'use:d02-valve-2');
    expect(w.flags.get('story.d02.valvesOpen')).toBe(true);
    for (const id of ['x1', 'x2']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'ember-hound', spawnTag: 'd02.sluice' });
    w.bus.emit('mercy', { verb: 'calm', creature: 'ember-hound', actorId: 'x3', spawnTag: 'd02.sluice' });
    expect(w.flags.get('story.d02.sluiceClear')).toBe(true);
  });
});

describe('batch 4 spawns, gates and places', () => {
  const by = (id: string) => DENSITY_SPAWNERS_A.find((s) => s.id === id)!;

  it('each new group has its tag, enemy, count and a gate that closes once it is dealt with', () => {
    expect(by('density.m10.ambush')).toMatchObject({ tag: 'm10.ambush', enemy: 'guildhall-thug', count: 2, respawn: 'never', activation: { flag: 'story.m10.ordersTaken', until: 'story.m10.ambushBeaten' } });
    expect(by('density.d02.stray')).toMatchObject({ tag: 'd02.stray', enemy: 'ember-hound', respawn: 'never', activation: { flag: 'story.d02.underwaysOpen', until: 'story.d02.strayDealt' } });
    expect(by('density.d02.stray').count).toBe(2);
    expect(by('density.d02.sluice')).toMatchObject({ tag: 'd02.sluice', enemy: 'ember-hound', count: 3, respawn: 'never', activation: { flag: 'story.d02.valvesOpen', until: 'story.d02.sluiceClear' } });
    expect(m10.objectives.find((o) => o.id === 'ambush')).toMatchObject({ type: 'kill', target: 'guildhall-thug', required: 2, spawnTag: 'm10.ambush' });
    expect(d02.objectives.find((o) => o.id === 'sluice')).toMatchObject({ type: 'kill', target: 'ember-hound', required: 3, spawnTag: 'd02.sluice' });
  });

  it('the Keep, the Counting-House and the Underways arena follow their flags', () => {
    expect(HARROWMARK_DOOR_LOCKS['keep-hall']).toBe('story.m08.keepOpen');
    expect(HARROWMARK_DOOR_LOCKS['counting-house']).toBe('story.m09.houseOpen');
    expect(HARROWMARK_FLAG_BLOCKERS[UNDERWAYS_ARENA_GATE]).toBe('story.d02.sluiceClear');
  });

  it('every new anchor a spawner, prop or note names exists in its layout or interior', () => {
    const anchors = new Set([
      ...HARROWMARK_LAYOUT.anchors, ...DENSITY_LAYOUT_HM.anchors, ...KEEP_HALL_DEF.anchors, ...COUNTING_HOUSE_DEF.anchors, ...UNDERWAYS_DEF.anchors,
    ].map((a) => a.id));
    for (const id of ['density.m10.ambush', 'density.d02.stray', 'density.d02.sluice']) {
      for (const a of [by(id).anchor, ...(by(id).memberAnchors ?? [])]) expect(anchors.has(a), a).toBe(true);
    }
    for (const p of QUEST_PROPS.filter((x) => ['m09', 'd02'].includes(x.objective[0]))) expect(anchors.has(p.anchorId), p.anchorId).toBe(true);
    for (const n of QUEST_NOTES.filter((x) => /note-(m08|m09|m10|d02)-/.test(x.interactableId))) expect(anchors.has(n.anchorId), n.anchorId).toBe(true);
    expect(DENSITY_LAYOUT_HM.triggers.some((t) => t.id === 'trg.harrowmark.m10-ride')).toBe(true);
  });

  it('Lord Grisel comes with the audience, the clerk with M09; every new NPC has a body and a name', () => {
    const npc = (id: string) => DENSITY_LAYOUT_HM.npcs.find((n) => n.id === id)!;
    expect(npc('grisel').presentWhen).toBe('story.m08.started');
    expect(npc('clerk').presentWhen).toBe('story.m09.started');
    for (const id of ['armourer', 'keep-guard', 'grisel', 'clerk', 'wace']) {
      expect(HARROWMARK_NPC_DEFS.some((d) => d.id === id), id).toBe(true);
      expect(HARROWMARK_NPC_STRINGS_EN[`npc.${id}.name`], id).toBeTruthy();
    }
  });

  it('the satchel key waits until the clerk dozes; the strongbox and the valves only while their objective is current', () => {
    const w = makeWorld([m08, m09, m10, ...stubs, d02]);
    const regs = new Map<string, { enabled(): boolean; onInteract(): void }>();
    const at = { x: 1, y: 0, z: 2 };
    const props = new QuestProps(QUEST_PROPS, {
      bus: w.bus, state: w.state, quests: w.manager, anchor: () => at, env: () => ({ state: w.state, quests: w.manager }),
      register: (i: { id: string; enabled(): boolean; onInteract(): void }) => { regs.set(i.id, i); return () => {}; },
    });
    w.manager.start('m09');
    props.update();
    w.manager.completeObjective('m09', 'o1');
    const key = regs.get('use:m09-clerk-key')!;
    expect(key.enabled()).toBe(false);
    w.flags.set('story.m09.clerkDozing', true);
    expect(key.enabled()).toBe(true);
    expect(regs.get(M09_STRONGBOX)!.enabled()).toBe(false);
    for (const o of ['key', 'o2', 'daybook']) w.manager.completeObjective('m09', o);
    expect(regs.get(M09_STRONGBOX)!.enabled()).toBe(true);
    for (const id of D02_PREREQUISITES) { w.manager.start(id); w.manager.complete(id); }
    expect(w.manager.start('d02')).toBe(true);
    props.update();
    for (const o of ['o1', 'stray', 'lesson', 'o2']) w.manager.completeObjective('d02', o);
    expect(regs.get('use:d02-valve-1')!.enabled()).toBe(false);
    w.manager.completeObjective('d02', 'o3');
    expect(regs.get('use:d02-valve-1')!.enabled()).toBe(false); // the tally first
    w.manager.completeObjective('d02', 'tally');
    expect(regs.get('use:d02-valve-1')!.enabled()).toBe(true);
  });
});

describe('saves from before the new steps', () => {
  it('M08 past the hall: the fitting, the warden and the wait are credited and the Keep stays open', () => {
    const w = flagsWorld([m08]);
    w.manager.load({ quests: { m08: { state: 'active', objectives: { o1: 1, o2: 1 } } } });
    w.objectiveFlags.sync();
    for (const o of ['fit', 'pass', 'wait']) expect(w.manager.objectiveDone('m08', o), o).toBe(true);
    expect(w.manager.isObjectiveCurrent('m08', 'o3')).toBe(true);
    expect(w.flags.get('story.m08.keepOpen')).toBe(true);
  });

  it('M09 inside the Counting-House: the key is credited; an old accept that opened the door still needs the key', () => {
    const w = flagsWorld([m09]);
    w.manager.load({ quests: { m09: { state: 'active', objectives: { o1: 1, o2: 1 } } } });
    expect(w.manager.objectiveDone('m09', 'key')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m09', 'daybook')).toBe(true);
    w.objectiveFlags.sync();
    expect(w.flags.get('story.m09.keyRoute')).toBe('lifted'); // Simeon gets it back in his sleep
    const x = flagsWorld([m09]);
    x.manager.load({ quests: { m09: { state: 'active', objectives: { o1: 1, o2: 1, o3: 3, o4: 1 } } } });
    expect(x.manager.isObjectiveCurrent('m09', 'return')).toBe(true); // copies done and out: the key goes back
    const v = flagsWorld([m09]);
    v.manager.load({ quests: { m09: { state: 'active', objectives: { o1: 1 } } } });
    expect(v.manager.isObjectiveCurrent('m09', 'key')).toBe(true);
  });

  it('M10 with the courier caught picks up at the orders; D02 in the Underways has the stray credited', () => {
    const w = flagsWorld([m10]);
    w.manager.load({ quests: { m10: { state: 'active', objectives: { o1: 1, o2: 1, o3: 1 } } } });
    expect(w.manager.isObjectiveCurrent('m10', 'orders')).toBe(true);
    const d = makeWorld([...stubs, d02]);
    d.manager.load({ quests: { d02: { state: 'active', objectives: { o1: 1, o2: 1 } } } });
    expect(d.manager.objectiveDone('d02', 'stray')).toBe(true);
    expect(d.manager.objectiveDone('d02', 'lesson')).toBe(true);
    expect(d.manager.isObjectiveCurrent('d02', 'o3')).toBe(true);
  });
});

describe('batch 4 dialogues', () => {
  const all: Record<string, string> = { ...questStrings, ...dialogueStrings };
  const has = (k: string) => k in all;
  const defs = [npcArmourer, npcKeepGuard, npcGrisel, npcClerk, npcWace];

  it.each(defs.map((d) => [d.id, d] as const))('%s validates clean', (_id, def) => {
    const r = validateDialogue(def, has);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('every new string is used, no dashes, no literal player name', () => {
    expect(Object.keys(questStringsDensityC).every((k) => k in questStrings)).toBe(true);
    for (const [k, v] of Object.entries(dialogueStringsDensityC)) {
      expect(all[k], k).toBe(v);
      expect(v, k).not.toMatch(/[‒-―]| - /);
      expect(v, k).not.toMatch(/Cael/);
    }
  });

  function runner(gold = 0, band: 'cold' | 'banked' = 'cold') {
    const w = makeWorld([m08, m09, m10]);
    w.gold.n = gold;
    const state = { ...w.state, favourBand: () => band };
    const effects = createEffectRunner({ state, quests: w.manager, bus: w.bus, sourceId: 'test',
      inventory: () => ({ remove: () => true, addGold: (n: number) => { w.gold.n += n; }, gold: w.gold.n, takeGold: (n: number) => { w.gold.n -= n; return n; } }),
    } as never);
    const dr = new DialogueRunner({ bus: w.bus, state, quests: w.manager, effects, strings: { t: (k) => all[k], has }, gold: () => w.gold.n });
    for (const d of [...defs, npcMerrin]) dr.register(d);
    installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
    const play = (id: string, npc: string, pick: (node: string) => number = () => 1): string[] => {
      expect(dr.start(id, npc)).toBe(true);
      const seen: string[] = [];
      for (let i = 0; i < 40 && dr.isOpen; i++) {
        const v = dr.view()!;
        seen.push(v.nodeId);
        if (v.choices.length) dr.choose(pick(v.nodeId)); else dr.advance();
      }
      return seen;
    };
    const m09At = () => { w.manager.start('m09'); w.manager.completeObjective('m09', 'o1'); };
    return { w, dr, play, m09At };
  }

  it('the clerk: a drink buys the key for 10 gold; Merrin\'s name gets it when House Oswin trusts Cael', () => {
    const r = runner(M09_CLERK_GOLD + 5);
    r.m09At();
    expect(r.play('npc-clerk', 'clerk')).toEqual(['meet', 'meet-2', 'meet-3', 'ask', 'buy', 'buy-2']);
    expect(r.w.gold.n).toBe(5);
    expect(r.w.flags.get('story.m09.keyRoute')).toBe('bought');
    expect(r.w.manager.objectiveDone('m09', 'key')).toBe(true);
    expect(r.w.flags.get('story.m09.houseOpen')).toBe(true);
    expect(r.play('npc-clerk', 'clerk')).toEqual(['after']);

    const n = runner(0, 'banked');
    n.m09At();
    expect(n.dr.start('npc-clerk', 'clerk')).toBe(true);
    for (let i = 0; i < 3; i++) n.dr.advance();
    expect(n.dr.view()!.choices.map((c) => c.id)).toEqual(['name', 'listen', 'leave']); // no gold for a drink
    n.dr.choose(1);
    expect(n.w.flags.get('story.m09.keyRoute')).toBe('merrin');
    expect(n.w.manager.objectiveDone('m09', 'key')).toBe(true);
  });

  it('the clerk: listening puts him to sleep and leaves the key in the satchel; leaving changes nothing', () => {
    const r = runner(0, 'cold');
    r.m09At();
    expect(r.play('npc-clerk', 'clerk')).toEqual(['meet', 'meet-2', 'meet-3', 'ask', 'listen', 'listen-2', 'listen-3', 'listen-4', 'listen-5']);
    expect(r.w.flags.get('story.m09.clerkDozing')).toBe(true);
    expect(r.w.manager.objectiveDone('m09', 'key')).toBe(false);
    expect(r.play('npc-clerk', 'clerk')).toEqual(['dozing']);
    const l = runner(0, 'cold');
    l.m09At();
    expect(l.play('npc-clerk', 'clerk', (n) => (n === 'ask' ? 2 : 1)).at(-1)).toBe('ask'); // no gold, no trust: listen or leave
    expect(l.w.flags.has('story.m09.clerkDozing')).toBe(false);
    expect(l.play('npc-clerk', 'clerk')[0]).toBe('meet');
  });

  it('the clerk takes his key back by hand, or Cael slips it into the satchel while he sleeps', () => {
    for (const [gold, route, nodes] of [[20, 'bought', ['return', 'return-2', 'return-3']], [0, 'lifted', ['return-asleep', 'return-asleep-2']]] as const) {
      const r = runner(gold);
      r.m09At();
      if (route === 'bought') r.play('npc-clerk', 'clerk');
      else { r.play('npc-clerk', 'clerk'); r.w.manager.completeObjective('m09', 'key'); }
      expect(r.w.flags.get('story.m09.keyRoute')).toBe(route);
      for (const o of ['o2', 'daybook', 'o3', 'o4']) r.w.manager.completeObjective('m09', o);
      expect(r.play('npc-merrin', 'merrin')).toEqual(['m09-remind-return']);
      expect(r.play('npc-clerk', 'clerk')).toEqual(nodes);
      expect(r.w.manager.objectiveDone('m09', 'return')).toBe(true);
      expect(r.play('npc-merrin', 'merrin')[0]).toBe('m09-report');
    }
  });

  it('the armourer, the warden and Lord Grisel follow M08\'s steps', () => {
    const r = runner();
    expect(r.play('npc-keep-guard', 'keep-guard')).toEqual(['idle']);
    expect(r.play('npc-grisel', 'grisel')).toEqual(['idle']);
    r.w.manager.start('m08');
    r.w.manager.completeObjective('m08', 'o1');
    expect(r.play('npc-keep-guard', 'keep-guard')).toEqual(['early']);
    expect(r.play('npc-armourer', 'armourer')).toEqual(['fit', 'fit-2', 'fit-3', 'fit-4']);
    expect(r.w.manager.objectiveDone('m08', 'fit')).toBe(true);
    expect(r.play('npc-armourer', 'armourer')).toEqual(['after']);
    expect(r.play('npc-keep-guard', 'keep-guard')).toEqual(['pass', 'pass-2', 'pass-3']);
    expect(r.w.flags.get('story.m08.keepOpen')).toBe(true);
    expect(r.play('npc-keep-guard', 'keep-guard')).toEqual(['after']);
    expect(r.play('npc-grisel', 'grisel')).toEqual(['wait', 'wait-2', 'wait-3']);
    expect(r.play('npc-merrin', 'merrin')).toEqual(['m08-wait', 'm08-wait-2', 'm08-wait-3', 'm08-wait-4']);
    expect(r.w.manager.objectiveDone('m08', 'wait')).toBe(true);
  });

  it('Wace brings out the Ashmare once Gerta has the orders, then reminds Cael to ride', () => {
    const r = runner();
    expect(r.play('npc-wace', 'wace')).toEqual(['idle']);
    r.w.manager.start('m10');
    for (const o of ['o1', 'o2', 'o3', 'orders', 'ambush']) r.w.manager.completeObjective('m10', o);
    expect(r.play('npc-wace', 'wace')).toEqual(['idle']);
    r.w.manager.completeObjective('m10', 'o4');
    expect(r.play('npc-wace', 'wace')).toEqual(['meet', 'meet-2', 'meet-3', 'meet-4', 'meet-5', 'meet-6', 'meet-7', 'meet-8']);
    expect(r.w.manager.objectiveDone('m10', 'wace')).toBe(true);
    expect(r.play('npc-wace', 'wace')).toEqual(['ride-remind']);
  });
});
