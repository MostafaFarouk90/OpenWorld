import { describe, it, expect } from 'vitest';
import { makeWorld } from './testKit';
import { m06 } from './content/m06.quest';
import { m07 } from './content/m07.quest';
import { m08 } from './content/m08.quest';
import { m09 } from './content/m09.quest';
import { m10 } from './content/m10.quest';
import { d02, D02_PREREQUISITES } from './content/d02.quest';
import { r03 } from './content/r03.quest';
import { r04 } from './content/r04.quest';
import { questDefs } from './content';
import { QuestProps } from './props';
import { installBridges } from './bridges';
import { INTERACT_FLAGS, QUEST_PROPS } from './content/props';
import { PostDirector, POST_RULES, resolvePosts } from './posts';
import type { QuestDef } from './types';

type W = ReturnType<typeof makeWorld>;
const talk = (w: W, npcId: string, reason?: string) => w.bus.emit('dialogue.ended', { npcId, reason });
const stealth = (w: W, sectionId: string, phase = 'cleared') => w.bus.emit('stealth.section', { sectionId, phase });
const interact = (w: W, interactableId: string, action = 'interact') => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action });
const done = (w: W, q: string, o: string) => w.manager.objectiveDone(q, o);
/** Starts a quest and credits its talk-to-the-giver objective the way the accept choice does. */
const begin = (w: W, q: string) => { expect(w.manager.start(q)).toBe(true); w.manager.completeObjective(q, 'o1'); };

describe('M06 Gates of Harrowmark', () => {
  it('start sets story.m06.started; the stealth route completes on the cleared section and records route and gateOpen', () => {
    const w = makeWorld([m06]);
    begin(w, 'm06');
    expect(w.flags.get('story.m06.started')).toBe(true);
    expect(w.flags.has('story.m06.gateOpen')).toBe(false);
    stealth(w, 'm06.south-gate');
    expect(w.manager.state('m06')).toBe('completed');
    expect(w.flags.get('story.m06.route')).toBe('stealth');
    expect(w.flags.get('story.m06.gateOpen')).toBe(true);
    expect(w.calls).toContain('xp:350:quest:m06');
    expect(w.bus.of('loot.granted')[0]).toMatchObject({ items: [{ itemId: 'watch-pass', count: 1 }] });
  });
  it('a route written by a bribe or argument node is not overwritten on completion', () => {
    const w = makeWorld([m06]);
    begin(w, 'm06');
    w.flags.set('story.m06.route', 'bribe');
    w.manager.completeObjective('m06', 'o2');
    expect(w.manager.state('m06')).toBe('completed');
    expect(w.flags.get('story.m06.route')).toBe('bribe');
    expect(w.flags.get('story.m06.gateOpen')).toBe(true);
  });
  it('ignores other sections, other phases and events before the quest starts', () => {
    const w = makeWorld([m06]);
    stealth(w, 'm06.south-gate');
    begin(w, 'm06');
    stealth(w, 'm09.counting-house');
    stealth(w, 'm06.south-gate', 'entered');
    stealth(w, 'm06.south-gate', 'exited');
    expect(done(w, 'm06', 'o2')).toBe(false);
    expect(w.manager.state('m06')).toBe('active');
  });
});

describe('M07 The Tilted Anvil', () => {
  const kill = (w: W, id: string, tag = 'm07.thieves') => w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'alley-cutpurse', spawnTag: tag });
  function toSatchel() {
    const w = makeWorld([m07]);
    begin(w, 'm07');
    return w;
  }
  it('plays through kills and Spares, the satchel, the yard, the class and the drill', () => {
    const w = toSatchel();
    kill(w, 'c1');
    w.bus.emit('mercy', { verb: 'spare', creature: 'alley-cutpurse', actorId: 'c2', spawnTag: 'm07.thieves' });
    kill(w, 'c3');
    interact(w, 'pickup:satchel');
    talk(w, 'aldith');
    w.bus.emit('trigger.enter', { triggerId: 'trg.harrowmark.bastion-yard', actorId: 'p' });
    expect(w.manager.isObjectiveCurrent('m07', 'o6')).toBe(true);
    w.flags.set('classes.chosen', 'warden');
    w.bus.emit('class.chosen', { classId: 'warden' });
    expect(done(w, 'm07', 'o6')).toBe(true);
    w.flags.set('classes.drill.warden', 'done');
    w.bus.emit('class.drill', { classId: 'warden', outcome: 'done' });
    expect(w.manager.state('m07')).toBe('completed');
  });
  it('a cutpurse from another group does not count; a fled cutpurse (no kill, no mercy) never counts', () => {
    const w = toSatchel();
    kill(w, 'c1', 'other');
    expect(w.manager.objectives('m07')[1].progress).toBe(0);
    w.bus.emit('actor.despawned', { actorId: 'c1' });
    expect(w.manager.objectives('m07')[1].progress).toBe(0);
  });
  it('a class chosen and drilled early is credited the moment o6 and o7 become current', () => {
    const w = toSatchel();
    w.flags.set('classes.chosen', 'ashblade');
    w.flags.set('classes.drill.ashblade', 'skipped');
    for (const id of ['c1', 'c2', 'c3']) kill(w, id);
    interact(w, 'pickup:satchel');
    talk(w, 'aldith');
    w.bus.emit('trigger.enter', { triggerId: 'trg.harrowmark.bastion-yard', actorId: 'p' });
    expect(w.manager.state('m07')).toBe('completed');
  });
  it('a load between the choice and its credit is repaired by recheck', () => {
    const w = toSatchel();
    for (const id of ['c1', 'c2', 'c3']) kill(w, id);
    interact(w, 'pickup:satchel');
    talk(w, 'aldith');
    w.bus.emit('trigger.enter', { triggerId: 'trg.harrowmark.bastion-yard', actorId: 'p' });
    const saved = JSON.parse(JSON.stringify(w.manager.serialize()));
    w.flags.set('classes.chosen', 'knight');
    w.flags.set('classes.drill.knight', 'done');
    w.manager.load(saved);
    w.manager.recheck();
    expect(w.manager.state('m07')).toBe('completed');
  });
});

describe('M08 Kneel Before the Boy', () => {
  it('opens the Keep and the Favour tab on start, never writes them again, and completes through the audience', () => {
    const w = makeWorld([m08]);
    begin(w, 'm08');
    expect(w.flags.get('story.m08.keepOpen')).toBe(true);
    expect(w.flags.get('story.m08.favourTab')).toBe(true);
    w.bus.emit('trigger.enter', { triggerId: 'trg.harrowmark.keep-hall', actorId: 'p' });
    talk(w, 'edric', 'skip');
    expect(done(w, 'm08', 'o3')).toBe(false);
    talk(w, 'edric');
    talk(w, 'wystan');
    expect(w.manager.state('m08')).toBe('completed');
    expect(w.bus.of('loot.granted')[0]).toMatchObject({ items: [{ itemId: 'halvard-signet', count: 1 }] });
  });
  it('the Keep flag survives the quest completing', () => {
    const w = makeWorld([m08]);
    begin(w, 'm08');
    w.manager.complete('m08');
    expect(w.flags.get('story.m08.keepOpen')).toBe(true);
  });
});

describe('M09 Oswin\'s Ledger', () => {
  function inside() {
    const w = makeWorld([m09]);
    begin(w, 'm09');
    w.bus.emit('interior.entered', { interiorId: 'counting-house' });
    return w;
  }
  it('copies the invoices in any order, once each, then needs a clean exit', () => {
    const w = inside();
    interact(w, 'use:m09-invoice-3');
    interact(w, 'use:m09-invoice-3');
    interact(w, 'use:m09-invoice-1');
    interact(w, 'use:elsewhere');
    expect(done(w, 'm09', 'o3')).toBe(false);
    interact(w, 'use:m09-invoice-2');
    expect(done(w, 'm09', 'o3')).toBe(true);
    stealth(w, 'm09.counting-house', 'exited');
    expect(done(w, 'm09', 'o4')).toBe(false);
    stealth(w, 'm09.counting-house');
    talk(w, 'merrin');
    expect(w.manager.state('m09')).toBe('completed');
    expect(w.bus.of('loot.granted')[0]).toMatchObject({ items: [{ itemId: 'oswin-lockpicks', count: 5 }] });
  });
  it('another interior does not satisfy o2', () => {
    const w = makeWorld([m09]);
    begin(w, 'm09');
    w.bus.emit('interior.entered', { interiorId: 'archive' });
    expect(done(w, 'm09', 'o2')).toBe(false);
  });
  it('invoice interactions before the objective is current earn nothing', () => {
    const w = makeWorld([m09]);
    begin(w, 'm09');
    interact(w, 'use:m09-invoice-1');
    w.bus.emit('interior.entered', { interiorId: 'counting-house' });
    expect(w.manager.objectives('m09')[2].progress).toBe(0);
  });
});

describe('M10 Smoke Over the Rooftops', () => {
  const chase = (w: W, type: string, chaseId = 'm10.rooftops') => w.bus.emit(type, { chaseId });
  it('needs the start and then the catch for the right chase; sets the Ashmare flag on completion only', () => {
    const w = makeWorld([m10]);
    begin(w, 'm10');
    chase(w, 'chase.caught');
    expect(done(w, 'm10', 'o3')).toBe(false); // not started yet
    chase(w, 'chase.started', 'other');
    expect(done(w, 'm10', 'o2')).toBe(false);
    chase(w, 'chase.started');
    chase(w, 'chase.lost');
    chase(w, 'chase.started'); // restart after a loss
    chase(w, 'chase.caught');
    expect(done(w, 'm10', 'o3')).toBe(true);
    expect(w.flags.has('story.m10.ashmare')).toBe(false);
    talk(w, 'gerta');
    expect(w.manager.state('m10')).toBe('completed');
    expect(w.flags.get('story.m10.ashmare')).toBe(true);
  });
});

describe('D02 Hounds of the Underways', () => {
  const stubs = (skip?: string): QuestDef[] => D02_PREREQUISITES.filter((q) => q !== skip).map((id) => ({
    id, titleKey: 't', summaryKey: 's', objectives: [{ id: 'o1', type: 'talk' as const, target: 'x', textKey: 'k' }],
  }));
  const complete = (w: W, ids: string[]) => { for (const id of ids) { w.manager.start(id); w.manager.complete(id); } };

  it.each(D02_PREREQUISITES)('is refused while %s is not completed, by start and by complete', (missing) => {
    const w = makeWorld([...stubs(), d02]);
    complete(w, D02_PREREQUISITES.filter((q) => q !== missing));
    expect(w.manager.start('d02')).toBe(false);
    expect(w.manager.complete('d02')).toBe(false);
    expect(w.manager.state('d02')).toBe('inactive');
    complete(w, [missing]);
    expect(w.manager.start('d02')).toBe(true);
  });
  it('D01 is not a prerequisite', () => {
    expect(D02_PREREQUISITES).not.toContain('d01');
  });
  function running() {
    const w = makeWorld([...stubs(), d02]);
    complete(w, D02_PREREQUISITES);
    begin(w, 'd02');
    return w;
  }
  it('a calmed, released or killed hound all count once; the boss events in one tick credit once', () => {
    const w = running();
    w.bus.emit('interior.entered', { interiorId: 'underways' });
    const tag = 'd02.kennels';
    w.bus.emit('mercy', { verb: 'calm', creature: 'ember-hound', actorId: 'h1', spawnTag: tag });
    w.bus.emit('actor.died', { actorId: 'h1', killerId: 'p', kind: 'ember-hound', spawnTag: tag });
    w.bus.emit('mercy', { verb: 'calm', creature: 'ember-hound', actorId: 'h2', spawnTag: tag });
    w.bus.emit('actor.died', { actorId: 'h3', killerId: 'p', kind: 'ember-hound', spawnTag: 'other' });
    expect(w.manager.objectives('d02')[2].progress).toBe(2);
    w.bus.emit('actor.died', { actorId: 'h3', killerId: 'p', kind: 'ember-hound', spawnTag: tag });
    w.bus.emit('actor.died', { actorId: 'h4', killerId: 'p', kind: 'ember-hound', spawnTag: tag });
    expect(done(w, 'd02', 'o3')).toBe(true);
    w.flags.set('boss.gaffer-grimtooth.outcome', 'released');
    w.bus.emit('boss.released', { bossId: 'gaffer-grimtooth', actorId: 'g' });
    w.bus.emit('boss.defeated', { bossId: 'gaffer-grimtooth', actorId: 'g' });
    expect(done(w, 'd02', 'o4')).toBe(true);
    talk(w, 'rook');
    expect(w.manager.state('d02')).toBe('completed');
    expect(w.bus.of('loot.granted').at(-1)).toMatchObject({ items: [{ itemId: 'sewer-master-key', count: 1 }] });
  });
  it('a boss outcome recorded before the objective is current is credited by doneWhen', () => {
    const w = running();
    w.flags.set('boss.gaffer-grimtooth.outcome', 'defeated');
    w.bus.emit('interior.entered', { interiorId: 'underways' });
    for (const id of ['h1', 'h2', 'h3', 'h4']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'ember-hound', spawnTag: 'd02.kennels' });
    expect(done(w, 'd02', 'o4')).toBe(true);
  });
  it('other bosses do not count', () => {
    const w = running();
    w.bus.emit('interior.entered', { interiorId: 'underways' });
    for (const id of ['h1', 'h2', 'h3', 'h4']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'ember-hound', spawnTag: 'd02.kennels' });
    w.bus.emit('boss.defeated', { bossId: 'ashen-prior', actorId: 'g' });
    expect(done(w, 'd02', 'o4')).toBe(false);
  });
});

describe('R03 and R04', () => {
  it('R03 plays through; the thugs need their spawn tag', () => {
    const w = makeWorld([r03]);
    begin(w, 'r03');
    w.bus.emit('actor.died', { actorId: 't0', killerId: 'p', kind: 'guildhall-thug', spawnTag: 'elsewhere' });
    for (const id of ['t1', 't2', 't3']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'guildhall-thug', spawnTag: 'r03.guildhall' });
    interact(w, 'pickup:brewing-copper');
    talk(w, 'aldith');
    expect(w.manager.state('r03')).toBe('completed');
  });
  it('R04 pages in any order, dedupe repeats, then the verdict talk', () => {
    const w = makeWorld([r04]);
    begin(w, 'r04');
    for (const n of [2, 2, 3, 1]) interact(w, `use:r04-page-${n}`);
    expect(done(w, 'r04', 'o2')).toBe(true);
    talk(w, 'whitlock', 'skip');
    expect(w.manager.state('r04')).toBe('active');
    talk(w, 'whitlock');
    expect(w.manager.state('r04')).toBe('completed');
  });
});

describe('quest props and the interact-flag bridge', () => {
  function propsWorld(anchors: Record<string, boolean>) {
    const w = makeWorld([m07, r04]);
    const registered = new Map<string, { enabled(): boolean; onInteract(): void }>();
    const props = new QuestProps(QUEST_PROPS, {
      bus: w.bus, state: w.state, quests: w.manager,
      anchor: (id) => (anchors[id] ? { x: 1, y: 2, z: 3 } : undefined),
      register: (i) => { registered.set(i.id, i); return () => registered.delete(i.id); },
    });
    return { w, props, registered };
  }
  it('registers only for started quests with an anchor, retries until the anchor exists', () => {
    const anchors: Record<string, boolean> = {};
    const { w, props, registered } = propsWorld(anchors);
    props.update();
    expect(registered.size).toBe(0);
    begin(w, 'm07');
    props.update();
    expect(props.pending()).toContain('pickup:satchel');
    anchors['m07.satchel'] = true;
    props.update();
    expect([...registered.keys()]).toEqual(['pickup:satchel']);
  });
  it('is enabled only while its objective is current and gives the item on use', () => {
    const { w, props, registered } = propsWorld({ 'm07.satchel': true });
    begin(w, 'm07');
    props.update();
    const sat = registered.get('pickup:satchel')!;
    expect(sat.enabled()).toBe(false);
    for (const id of ['a', 'b', 'c']) w.bus.emit('actor.died', { actorId: id, killerId: 'p', kind: 'alley-cutpurse', spawnTag: 'm07.thieves' });
    expect(sat.enabled()).toBe(true);
    sat.onInteract();
    expect(w.bus.of('loot.granted')[0]).toMatchObject({ items: [{ itemId: 'stolen-satchel', count: 1 }] });
  });
  it('a page disables itself once taken', () => {
    const { w, props, registered } = propsWorld({ 'r04.page-1': true, 'r04.page-2': true, 'r04.page-3': true });
    begin(w, 'r04');
    props.update();
    const p1 = registered.get('use:r04-page-1')!;
    expect(p1.enabled()).toBe(true);
    p1.onInteract();
    expect(p1.enabled()).toBe(false);
    expect(registered.get('use:r04-page-2')!.enabled()).toBe(true);
  });
  it('a prop whose registration throws is skipped once and does not block the others', () => {
    const w = makeWorld([m07, r04]);
    const registered: string[] = [];
    const warns: string[] = [];
    const props = new QuestProps(QUEST_PROPS, {
      bus: w.bus, state: w.state, quests: w.manager, warn: (m) => warns.push(m),
      anchor: () => ({ x: 0, y: 0, z: 0 }),
      register: (i) => { if (i.id === 'use:r04-page-1') throw new Error('duplicate'); registered.push(i.id); return () => {}; },
    });
    begin(w, 'r04');
    props.update();
    props.update();
    expect(registered).toEqual(['use:r04-page-2', 'use:r04-page-3']);
    expect(warns).toHaveLength(1);
  });
  it('dispose unregisters everything', () => {
    const { w, props, registered } = propsWorld({ 'm07.satchel': true });
    begin(w, 'm07');
    props.update();
    props.dispose();
    expect(registered.size).toBe(0);
    props.update();
    expect(registered.size).toBe(0);
  });
  it('invoice use writes its flag only while M09 is active and never for a mercy action', () => {
    const w = makeWorld([m09]);
    installBridges(w.bus, w.state, w.manager, undefined, INTERACT_FLAGS);
    interact(w, 'use:m09-invoice-1');
    expect(w.flags.has('story.m09.invoice.1')).toBe(false);
    begin(w, 'm09');
    interact(w, 'use:m09-invoice-1'); // o3 is not current yet: the invoice must stay usable
    expect(w.flags.has('story.m09.invoice.1')).toBe(false);
    w.bus.emit('interior.entered', { interiorId: 'counting-house' });
    interact(w, 'use:m09-invoice-1', 'mercy');
    expect(w.flags.has('story.m09.invoice.1')).toBe(false);
    interact(w, 'use:m09-invoice-2');
    expect(w.flags.get('story.m09.invoice.2')).toBe(true);
    expect(w.flags.has('story.m09.invoice.1')).toBe(false);
  });
});

describe('Harrowmark post rules', () => {
  function world() {
    const defs = questDefs.filter((d) => ['m06', 'm07', 'm08', 'm09', 'm10', 'r02', 'd02'].includes(d.id));
    const w = makeWorld(defs);
    const at = () => resolvePosts(POST_RULES, { state: w.state, quests: w.manager });
    return { w, at };
  }
  it('Stane stays in the Practice Yard until R02 is done AND M07 has started', () => {
    const { w, at } = world();
    expect(at().stane).toEqual({ anchorId: 'npc-post.stane', home: true });
    w.manager.start('m07');
    expect(at().stane.anchorId).toBe('npc-post.stane'); // M07 started, R02 open
    w.manager.start('r02'); w.manager.complete('r02');
    expect(at().stane.anchorId).toBe('npc-post.stane.bastion');
  });
  it('R02 done but M07 not started keeps Stane at home', () => {
    const { w, at } = world();
    w.manager.start('r02'); w.manager.complete('r02');
    expect(at().stane.home).toBe(true);
  });
  it('Gaut: gate during M06, Bastion from M07, back to the Bastion after completion', () => {
    const { w, at } = world();
    w.manager.start('m06');
    expect(at().gaut.anchorId).toBe('npc-post.gaut.south-gate');
    w.manager.complete('m06');
    w.manager.start('m07');
    expect(at().gaut.anchorId).toBe('npc-post.gaut.bastion');
    w.manager.complete('m07');
    expect(at().gaut.anchorId).toBe('npc-post.gaut.bastion');
  });
  it('Rook, Gerta and Pennard follow their quests', () => {
    const { w, at } = world();
    expect(at().rook.anchorId).toBe('npc-post.rook.gate');
    w.manager.start('m06');
    expect(at().rook.anchorId).toBe('npc-post.rook.gate');
    w.manager.complete('m06');
    expect(at().rook.anchorId).toBe('npc-post.rook');
    w.manager.start('m07');
    expect(at().gerta.anchorId).toBe('npc-post.gerta.bastion');
    expect(at().pennard.anchorId).toBe('npc-post.pennard.bastion');
    w.manager.start('m10');
    expect(at().gerta.anchorId).toBe('npc-post.gerta.guild');
  });
  it('Edric and Vey stand in the hall only while M08 is active; Merrin goes inside after sending the player', () => {
    const { w, at } = world();
    w.manager.start('m08');
    expect(at().edric.anchorId).toBe('npc-post.edric.hall');
    expect(at().vey.anchorId).toBe('npc-post.vey.hall');
    w.manager.complete('m08');
    expect(at().edric.home).toBe(true);
    w.manager.start('m09');
    expect(at().merrin.home).toBe(true);
    w.manager.completeObjective('m09', 'o1');
    expect(at().merrin.anchorId).toBe('npc-post.merrin.inside');
  });
  it('re-applies after a load, including a rewind to before M07', () => {
    const { w } = world();
    const placed: [string, string][] = [];
    const npcs = { place: (n: string, a: string) => { placed.push([n, a]); return true; } };
    const dir = new PostDirector(POST_RULES, () => ({ state: w.state, quests: w.manager }), () => npcs);
    w.manager.start('m07');
    dir.update();
    expect(placed).toContainEqual(['gaut', 'npc-post.gaut.bastion']);
    const before = JSON.parse(JSON.stringify(w.manager.serialize()));
    w.manager.complete('m07');
    w.manager.load({ quests: {} }); // a save from before M06
    dir.reset();
    dir.update();
    expect(placed.filter(([n]) => n === 'gaut').at(-1)).toEqual(['gaut', 'npc-post.gaut']);
    w.manager.load(before);
    dir.reset();
    dir.update();
    expect(placed.filter(([n]) => n === 'gaut').at(-1)).toEqual(['gaut', 'npc-post.gaut.bastion']);
  });
});
