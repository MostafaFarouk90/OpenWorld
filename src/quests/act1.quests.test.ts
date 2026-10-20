import { describe, it, expect } from 'vitest';
import { makeWorld } from './testKit';
import { m04 } from './content/m04.quest';
import { d01, D01_BRAZIERS, D01_TABLETS } from './content/d01.quest';
import { r02 } from './content/r02.quest';
import { m03 } from './content/m03.quest';
import { M04_WAGONS } from './content/m04.quest';

const talk = (w: ReturnType<typeof makeWorld>, npcId: string, reason?: string) => w.bus.emit('dialogue.ended', { npcId, reason });
const died = (w: ReturnType<typeof makeWorld>, actorId: string, kind: string) => w.bus.emit('actor.died', { actorId, killerId: 'p', kind });

describe('M04 The Toll at Hollin Ford', () => {
  function toFord() {
    const w = makeWorld([m04]);
    w.manager.start('m04');
    w.bus.emit('trigger.enter', { triggerId: 'trg.ford.toll-post', actorId: 'p' });
    talk(w, 'gaut');
    return w;
  }
  it('plays through with kills and Spares, the sergeant, the ledger, the wagons and the carters', () => {
    const w = toFord();
    died(w, 's1', 'blighted-soldier');
    w.bus.emit('mercy', { verb: 'spare', creature: 'blighted-soldier', actorId: 's2' });
    died(w, 's3', 'blighted-soldier');
    w.bus.emit('mercy', { verb: 'spare', creature: 'blighted-soldier', actorId: 's4' });
    w.bus.emit('mercy', { verb: 'spare', creature: 'toll-sergeant', actorId: 'sg', spawnTag: 'm04.sergeant' });
    expect(w.manager.isObjectiveCurrent('m04', 'o4')).toBe(true);
    died(w, 'tp', 'toll-post');
    talk(w, 'note-m04-toll-box', 'completed');
    talk(w, 'gaut', 'completed');
    for (const id of M04_WAGONS) w.bus.emit('interact', { interactableId: id });
    talk(w, 'carter-1', 'completed'); // out of turn: carter-1 waits for the other two
    expect(w.manager.isObjectiveCurrent('m04', 'carters')).toBe(true);
    talk(w, 'carter-2', 'completed');
    talk(w, 'carter-2', 'completed');
    expect(w.manager.isObjectiveCurrent('m04', 'carters')).toBe(true); // the same carter twice counts once
    talk(w, 'carter-3', 'completed');
    talk(w, 'carter-1');
    talk(w, 'gaut');
    expect(w.manager.state('m04')).toBe('completed');
    expect(w.calls).toContain('xp:350:quest:m04');
    expect(w.bus.of('loot.granted')[0]).toMatchObject({ items: [{ itemId: 'ford-guard-shield', count: 1 }] });
  });
  it('a soldier both spared and killed counts once', () => {
    const w = toFord();
    w.bus.emit('mercy', { verb: 'spare', creature: 'blighted-soldier', actorId: 's1' });
    died(w, 's1', 'blighted-soldier');
    expect(w.manager.objectives('m04')[2].progress).toBe(1);
  });
  it('a toll-post broken before the soldiers are dealt with still counts later (world flag), whoever broke it', () => {
    const w = toFord();
    w.bus.emit('actor.died', { actorId: 'tp', killerId: 'a-mob', kind: 'toll-post' });
    w.flags.set('world.brightwater.tollPost', true);
    for (const id of ['s1', 's2', 's3', 's4']) died(w, id, 'blighted-soldier');
    died(w, 'sg', 'toll-sergeant');
    expect(w.manager.objectiveDone('m04', 'sergeant')).toBe(false); // the sergeant counts only from his own spawner
    w.bus.emit('actor.died', { actorId: 'sg', killerId: 'p', kind: 'toll-sergeant', spawnTag: 'm04.sergeant' });
    expect(w.manager.objectiveDone('m04', 'o4')).toBe(true);
    expect(w.manager.isObjectiveCurrent('m04', 'ledger')).toBe(true);
  });
  it('a stranger killing a soldier does not count', () => {
    const w = toFord();
    w.bus.emit('actor.died', { actorId: 's1', killerId: 'someone-else', kind: 'blighted-soldier' });
    expect(w.manager.objectives('m04')[2].progress).toBe(0);
  });
  it('an aborted dialogue with Gaut earns no credit', () => {
    const w = makeWorld([m04]);
    w.manager.start('m04');
    w.bus.emit('trigger.enter', { triggerId: 'trg.ford.toll-post', actorId: 'p' });
    talk(w, 'gaut', 'skip');
    expect(w.manager.objectiveDone('m04', 'o2')).toBe(false);
  });
});

describe('D01 Prayers in the Vault', () => {
  /** The density pass's antechamber: four tablets read, three braziers lit, the four wall wraiths put down. */
  const antechamber = (w: ReturnType<typeof makeWorld>) => {
    for (const id of D01_TABLETS) talk(w, id, 'completed');
    for (const id of D01_BRAZIERS) w.bus.emit('interact', { interactableId: id, actorId: 'p' });
    for (let i = 0; i < 4; i++) w.bus.emit('actor.died', { actorId: `wall${i}`, killerId: 'p', kind: 'ash-wraith', spawnTag: 'd01.antechamber' });
  };
  const enterVault = (w: ReturnType<typeof makeWorld>) => {
    w.manager.start('d01');
    w.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'vault.door' });
    antechamber(w);
    w.bus.emit('trigger.enter', { triggerId: 'trg.vault.arena', actorId: 'p' });
  };
  it('walks the antechamber in order: a brazier before the tablets and a wraith from elsewhere count for nothing', () => {
    const w = makeWorld([d01]);
    w.manager.start('d01');
    w.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'vault.door' });
    w.bus.emit('interact', { interactableId: D01_BRAZIERS[0], actorId: 'p' });
    expect(w.manager.objectives('d01').find((o) => o.def.id === 'braziers')!.progress).toBe(0);
    for (const id of [D01_TABLETS[0], D01_TABLETS[0], D01_TABLETS[1]]) talk(w, id, 'completed');
    talk(w, D01_TABLETS[2], 'aborted');
    expect(w.manager.isObjectiveCurrent('d01', 'tablets')).toBe(true);
    talk(w, D01_TABLETS[2], 'completed');
    talk(w, D01_TABLETS[3], 'completed');
    for (const id of [...D01_BRAZIERS, D01_BRAZIERS[0]]) w.bus.emit('interact', { interactableId: id, actorId: 'p' });
    expect(w.manager.isObjectiveCurrent('d01', 'wake')).toBe(true);
    w.bus.emit('actor.died', { actorId: 'x', killerId: 'p', kind: 'ash-wraith', spawnTag: 'brightwater.vault' });
    expect(w.manager.objectives('d01').find((o) => o.def.id === 'wake')!.progress).toBe(0);
  });
  it.each(['boss.defeated', 'boss.released'])('completes on %s', (ev) => {
    const w = makeWorld([d01]);
    enterVault(w);
    w.bus.emit(ev, { bossId: 'ashen-prior', actorId: 'x' });
    talk(w, 'note-d01-censer', 'completed');
    talk(w, 'aelfreda');
    expect(w.manager.state('d01')).toBe('active'); // the censer still goes on the altar, then the vigil
    w.bus.emit('interact', { interactableId: 'use:d01-altar', actorId: 'p' });
    talk(w, 'aelfreda');
    expect(w.manager.state('d01')).toBe('completed');
    expect(w.calls).toContain('xp:600:quest:d01');
  });
  it('the Prior beaten in an earlier visit still counts when the quest comes late (outcome flag)', () => {
    const w = makeWorld([d01]);
    w.flags.set('boss.ashen-prior.outcome', 'released');
    enterVault(w);
    expect(w.manager.objectiveDone('d01', 'o3')).toBe(true);
  });
  it('another interior does not count, and the boss objective waits for the arena', () => {
    const w = makeWorld([d01]);
    w.manager.start('d01');
    w.bus.emit('interior.entered', { interiorId: 'cellar', doorId: 'x' });
    expect(w.manager.objectiveDone('d01', 'o1')).toBe(false);
    w.bus.emit('interior.entered', { interiorId: 'chapel-vault', doorId: 'vault.door' });
    antechamber(w);
    w.bus.emit('boss.defeated', { bossId: 'ashen-prior' }); // before o1/o2: ignored, the flag handles it later
    expect(w.manager.objectiveDone('d01', 'o3')).toBe(false);
  });
  it('a load inside the vault keeps its place', () => {
    const w = makeWorld([d01]);
    enterVault(w);
    w.manager.load(JSON.parse(JSON.stringify(w.manager.serialize())));
    expect(w.manager.isObjectiveCurrent('d01', 'o3')).toBe(true);
  });
});

describe('R02 The Marshal\'s Last Drill', () => {
  it('needs 3 open hits, 3 parries and 2 guard breaks in order, then Stane', () => {
    const w = makeWorld([r02]);
    w.manager.start('r02');
    w.bus.emit('dummy.parried', {}); // too early
    talk(w, 'stane');
    for (let i = 0; i < 3; i++) w.bus.emit('dummy.hitOpen', { dummyId: 'd1' });
    w.bus.emit('dummy.blocked', { dummyId: 'd1' }); // the dummy's own block is not the player's feat
    for (let i = 0; i < 3; i++) w.bus.emit('dummy.parried', { dummyId: 'd2' });
    expect(w.manager.objectiveDone('r02', 'o4')).toBe(false);
    for (let i = 0; i < 2; i++) w.bus.emit('dummy.guardBroken', { dummyId: 'd3' });
    expect(w.manager.state('r02')).toBe('active');
    talk(w, 'stane');
    expect(w.manager.state('r02')).toBe('completed');
  });
});

describe('doneWhen and loading', () => {
  it('is not read during load, only by recheck() after the world state loaded', () => {
    const w = makeWorld([m03]);
    w.manager.start('m03');
    for (const o of ['o1', 'o2', 'study']) w.manager.completeObjective('m03', o);
    const saved = JSON.parse(JSON.stringify(w.manager.serialize()));
    w.flags.set('ability.surge-leap.learned', true); // stale session flag, not yet replaced by the loaded world state
    w.manager.load(saved);
    expect(w.manager.objectiveDone('m03', 'o3')).toBe(false);
    w.flags.delete('ability.surge-leap.learned'); // the save never learned it
    w.manager.recheck();
    expect(w.manager.objectiveDone('m03', 'o3')).toBe(false);
    w.flags.set('ability.surge-leap.learned', true);
    w.manager.recheck();
    expect(w.manager.objectiveDone('m03', 'o3')).toBe(true);
  });
});

describe('M03 grants nothing by itself', () => {
  it('the Leap, Release unlock and skill point come from dialogue and rewards, not from starting', () => {
    const w = makeWorld([m03]);
    w.manager.start('m03');
    expect(w.calls).toEqual([]);
    expect(w.enemies.unlocked).toEqual([]);
  });
  it('rewards: 300 xp and 1 skill point on completion', () => {
    const w = makeWorld([m03]);
    w.manager.start('m03');
    for (const o of m03.objectives.map((x) => x.id)) w.manager.completeObjective('m03', o);
    expect(w.calls).toEqual(['xp:300:quest:m03', 'sp:1']);
  });
});
