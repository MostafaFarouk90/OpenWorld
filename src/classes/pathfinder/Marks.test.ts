import { describe, expect, it } from 'vitest';
import { FakeActor, FakeActors } from '../../spells/testHost';
import { Marks } from './Marks';
import { PF } from './tuning';

function rig() {
  const actors = new FakeActors(new FakeActor('player', 'player'));
  let now = 0;
  const log: string[] = [];
  const marks = new Marks({ actors, now: () => now, added: (id) => log.push(`+${id}`), removed: (id) => log.push(`-${id}`) });
  return { actors, marks, log, at: (s: number) => (now = s) };
}
const origin = { x: 0, y: 0, z: 0 };

describe('Marks (Falcon Eye)', () => {
  it('marks living hostiles within 25 m only', () => {
    const r = rig();
    r.actors.add(new FakeActor('in', 'hostile', 20, 0));
    r.actors.add(new FakeActor('out', 'hostile', 30, 0));
    r.actors.add(new FakeActor('ally', 'ally', 3, 0));
    r.actors.add(new FakeActor('npc', 'neutral', 3, 0));
    r.actors.add(new FakeActor('dead', 'hostile', 3, 0)).kill();
    const hidden = r.actors.add(new FakeActor('hidden', 'hostile', 3, 0));
    hidden.hittable = false;
    expect(r.marks.cast(origin)).toBe(1);
    expect(r.marks.isMarked('in')).toBe(true);
    expect(r.log).toEqual(['+in']);
  });

  it('a mark lasts 12 s, a recast refreshes it without a second glyph', () => {
    const r = rig();
    r.actors.add(new FakeActor('e', 'hostile', 5, 0));
    r.marks.cast(origin);
    r.at(11);
    r.marks.cast(origin);
    r.at(20);
    r.marks.update();
    expect(r.marks.isMarked('e')).toBe(true);
    r.at(23.5);
    r.marks.update();
    expect(r.marks.isMarked('e')).toBe(false);
    expect(r.log).toEqual(['+e', '-e']);
  });

  it('consume pays the weak-point poise once', () => {
    const r = rig();
    r.actors.add(new FakeActor('e', 'hostile', 5, 0));
    r.marks.cast(origin);
    expect(r.marks.consume('e')).toBe(PF.falconEye.weakPoise);
    expect(r.marks.consume('e')).toBe(0);
    expect(r.marks.consume('nobody')).toBe(0);
  });

  it('an expired mark pays nothing even before the next update prunes it', () => {
    const r = rig();
    r.actors.add(new FakeActor('e', 'hostile', 5, 0));
    r.marks.cast(origin);
    r.at(PF.falconEye.seconds + 1);
    expect(r.marks.consume('e')).toBe(0);
  });

  it('prunes the dead and clear removes every glyph', () => {
    const r = rig();
    const e = r.actors.add(new FakeActor('e', 'hostile', 5, 0));
    r.actors.add(new FakeActor('f', 'hostile', 6, 0));
    r.marks.cast(origin);
    e.kill();
    r.marks.update();
    expect(r.marks.count).toBe(1);
    r.marks.clear();
    expect(r.marks.count).toBe(0);
    expect(r.log.filter((l) => l.startsWith('-')).sort()).toEqual(['-e', '-f']);
  });
});
