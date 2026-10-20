// Act 1 density pass, batch 3 (Harrowmark part 1: M06, M07, R02 in the Bastion, R03, R04): the objective flags that
// gate the new spawns and NPCs, the spawn tables, R02's two sites and the R04 save from before the pages moved.
import { describe, expect, it } from 'vitest';
import { makeWorld } from './testKit';
import { installObjectiveFlags } from './objectiveFlags';
import { OBJECTIVE_FLAGS } from './content/objectiveFlags';
import { m06 } from './content/m06.quest';
import { m07 } from './content/m07.quest';
import { r02, R02_AT_BASTION } from './content/r02.quest';
import { r03 } from './content/r03.quest';
import { r04 } from './content/r04.quest';
import { D02_PREREQUISITES, d02StartWhen } from './content/d02.quest';
import { evalCondition } from './conditions';
import { DENSITY_SPAWNERS_A } from '../enemies/densitySpawners';
import { HARROWMARK_SPAWNERS } from '../enemies/harrowmarkSpawners';
import { DENSITY_LAYOUT_HM } from '../harrowmark/density.layout';
import { HARROWMARK_FLAG_BLOCKERS } from '../interiors/harrowmark/locks';
import { ARCHIVE_STACKS_GATE } from '../interiors/harrowmark/archive';

type W = ReturnType<typeof makeWorld>;
const talk = (w: W, npcId: string) => w.bus.emit('dialogue.ended', { npcId, reason: 'completed' });
const interact = (w: W, interactableId: string) => w.bus.emit('interact', { interactableId, kind: 'use', actorId: 'p', action: 'interact' });

function flagsWorld(defs = [m06, m07, r02, r03, r04]) {
  const w = makeWorld(defs);
  installObjectiveFlags(OBJECTIVE_FLAGS, w.bus, w.state, w.manager);
  return w;
}

describe('batch 3 objective flags', () => {
  it('M06: a stealth pass writes the stealth route and opens the gate; a paid route keeps its own name', () => {
    const w = flagsWorld();
    w.manager.start('m06');
    w.manager.completeObjective('m06', 'o1');
    w.manager.completeObjective('m06', 'queue');
    w.manager.completeObjective('m06', 'o2');
    expect(w.flags.get('story.m06.route')).toBe('stealth');
    expect(w.flags.get('story.m06.gateOpen')).toBe(true);
    const v = flagsWorld();
    v.manager.start('m06');
    v.flags.set('story.m06.route', 'bribe'); // the bribe node writes the route before it completes o2
    for (const o of ['o1', 'queue', 'o2']) v.manager.completeObjective('m06', o);
    expect(v.flags.get('story.m06.route')).toBe('bribe');
  });

  it('M06: the refugees move inside only once Hild has heard the word', () => {
    const w = flagsWorld();
    w.manager.start('m06');
    for (const o of ['o1', 'queue', 'o2', 'brazier', 'proof']) w.manager.completeObjective('m06', o);
    expect(w.flags.has('story.m06.queueTested')).toBe(false);
    talk(w, 'refugee-1');
    expect(w.flags.get('story.m06.queueTested')).toBe(true);
  });

  it('M07: the thieves wait for the coin trail (two stallholders, three coins, each coin once)', () => {
    const w = flagsWorld();
    w.manager.start('m07');
    w.manager.completeObjective('m07', 'o1');
    talk(w, 'stallholder-1');
    talk(w, 'stallholder-1'); // the same stallholder twice counts once
    expect(w.manager.objectiveDone('m07', 'ask')).toBe(false);
    talk(w, 'stallholder-2');
    expect(w.manager.objectiveDone('m07', 'ask')).toBe(true);
    interact(w, 'use:m07-coin-1');
    interact(w, 'use:m07-coin-1');
    interact(w, 'use:m07-coin-2');
    expect(w.flags.has('story.m07.trailFollowed')).toBe(false);
    interact(w, 'use:m07-coin-3');
    expect(w.flags.get('story.m07.trailFollowed')).toBe(true);
  });

  it('R03: the doorman calls the thugs, the thugs bring Pellam, the copper calls the snatch', () => {
    const w = flagsWorld();
    w.manager.start('r03');
    w.manager.completeObjective('r03', 'o1');
    expect(w.flags.has('story.r03.doormanTalked')).toBe(false);
    talk(w, 'guild-doorman');
    expect(w.flags.get('story.r03.doormanTalked')).toBe(true);
    w.manager.completeObjective('r03', 'o2');
    expect(w.flags.get('story.r03.thugsBeaten')).toBe(true);
    w.manager.completeObjective('r03', 'pellam');
    w.manager.completeObjective('r03', 'o3');
    expect(w.flags.get('story.r03.copperTaken')).toBe(true);
    expect(w.flags.has('story.r03.snatchBeaten')).toBe(false);
    w.manager.completeObjective('r03', 'snatch');
    expect(w.flags.get('story.r03.snatchBeaten')).toBe(true);
  });

  it('R04: the stacks gate opens on the lock, and Crabbe comes out once all three pages are in, in either order', () => {
    const w = flagsWorld();
    w.manager.start('r04');
    w.manager.completeObjective('r04', 'o1');
    interact(w, 'use:r04-stacks-lock');
    expect(w.flags.get('story.r04.stacksOpen')).toBe(true);
    // the fence's page before the sexton's
    w.flags.set('story.r04.page.3', true);
    w.manager.completeObjective('r04', 'page3');
    w.flags.set('story.r04.page.2', true);
    w.manager.completeObjective('r04', 'page2');
    expect(w.flags.has('story.r04.pagesFound')).toBe(false);
    interact(w, 'use:r04-page-1');
    expect(w.manager.objectiveDone('r04', 'o2')).toBe(true);
    expect(w.manager.isObjectiveCurrent('r04', 'crabbe')).toBe(true);
    expect(w.flags.get('story.r04.pagesFound')).toBe(true);
  });
});

describe('batch 3 gates and spawns', () => {
  const by = (id: string) => [...DENSITY_SPAWNERS_A, ...HARROWMARK_SPAWNERS].find((s) => s.id === id)!;

  it('each R02 bout has a spawner per site, live only once Stane calls it there', () => {
    for (const bout of ['bout', 'pair']) {
      // a bout called in the Practice Yard is called off when M06 starts (Stane calls it again in the Bastion)
      expect(by(`density.r02.${bout}-yard`)).toMatchObject({ tag: `r02.${bout}`, enemy: 'yard-veteran', respawn: 'never', activation: { flag: `story.r02.${bout}.yard`, until: R02_AT_BASTION } });
      expect(by(`density.r02.${bout}-bastion`)).toMatchObject({ tag: `r02.${bout}`, enemy: 'yard-veteran', respawn: 'never', activation: { quest: 'r02', flag: `story.r02.${bout}.bastion` } });
    }
    expect(by('density.r02.bout-yard').count).toBe(1);
    expect(by('density.r02.pair-bastion').count).toBe(2);
    expect(r02.objectives.find((o) => o.id === 'bout')).toMatchObject({ type: 'kill', target: 'yard-veteran', spawnTag: 'r02.bout' });
    expect(r02.objectives.find((o) => o.id === 'pair')).toMatchObject({ type: 'kill', target: 'yard-veteran', required: 2, spawnTag: 'r02.pair' });
  });

  it('the snatchers rise with the copper and stop once beaten; the guildhall and the alley wait on their flags', () => {
    expect(by('density.r03.snatch')).toMatchObject({ enemy: 'guildhall-thug', count: 2, respawn: 'never', activation: { flag: 'story.r03.copperTaken', until: 'story.r03.snatchBeaten' } });
    expect(by('r03.guildhall').activation).toEqual({ quest: 'r03', flag: 'story.r03.doormanTalked' });
    expect(by('m07.thieves').activation).toEqual({ quest: 'm07', flag: 'story.m07.trailFollowed' });
  });

  it('Pellam and Crabbe appear only when their scene is due; the stacks gate is a flag blocker', () => {
    const npc = (id: string) => DENSITY_LAYOUT_HM.npcs.find((n) => n.id === id)!;
    expect(npc('pellam').presentWhen).toBe('story.r03.thugsBeaten');
    expect(npc('crabbe').presentWhen).toBe('story.r04.pagesFound');
    expect((HARROWMARK_FLAG_BLOCKERS as Record<string, string>)[ARCHIVE_STACKS_GATE]).toBe('story.r04.stacksOpen');
  });
});

describe('R02 in the Bastion', () => {
  it('runs at the Bastion from M06 on, and finishing it there still opens D02', () => {
    const w = makeWorld([m06, r02]);
    expect(R02_AT_BASTION).toBe('story.m06.started');
    w.flags.set(R02_AT_BASTION, true);
    w.manager.start('r02');
    for (const o of r02.objectives) w.manager.completeObjective('r02', o.id);
    expect(w.manager.state('r02')).toBe('completed');
    expect(D02_PREREQUISITES).toContain('r02');
    const states: Record<string, string> = Object.fromEntries(D02_PREREQUISITES.map((q) => [q, 'completed']));
    const env = { state: w.state, quests: { ...w.manager, state: (q: string) => states[q] ?? 'inactive', objectiveDone: () => false } };
    expect(evalCondition(d02StartWhen, env as never)).toBe(true);
  });
});

describe('R04 saves from before the pages moved indoors', () => {
  it('an old save with the three outdoor pages in hand (o2 done) loads at Crabbe, the new page steps credited', () => {
    const w = makeWorld([r04]);
    w.manager.load({ quests: { r04: { state: 'active', objectives: { o1: 1, o2: 3 } } } });
    for (const o of ['stacks', 'page1', 'page2', 'page3', 'o2']) expect(w.manager.objectiveDone('r04', o), o).toBe(true);
    expect(w.manager.isObjectiveCurrent('r04', 'crabbe')).toBe(true);
  });

  it('an old save part way through the pages (o2 at 2) is not sent back: the new steps count as found, Crabbe is next', () => {
    const w = makeWorld([r04]);
    w.manager.load({ quests: { r04: { state: 'active', objectives: { o1: 1, o2: 2 } } } });
    w.manager.recheck(); // as on save.loaded: o2's doneWhen reads the three page objectives
    expect(w.manager.objectiveDone('r04', 'page3')).toBe(true);
    expect(w.manager.isObjectiveCurrent('r04', 'crabbe')).toBe(true);
  });

  it('an old save that had not found a page yet starts at the stacks lock', () => {
    const w = makeWorld([r04]);
    w.manager.load({ quests: { r04: { state: 'active', objectives: { o1: 1 } } } });
    expect(w.manager.isObjectiveCurrent('r04', 'stacks')).toBe(true);
  });
});
