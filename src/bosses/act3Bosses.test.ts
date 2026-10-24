import { describe, expect, it } from 'vitest';
import { GameEvents } from '../core/events';
import { WorldState } from '../state/WorldState';
import { ActorRegistry } from '../actors/ActorRegistry';
import { BossRegistry, type BossDef } from '../actors/BossRegistry';
import { DamageResolver } from '../actors/DamageResolver';
import { playerInit } from '../actors/teams';
import { ACT3_BOSS_IDS, ACT3_BOSS_RULES } from './act3Bosses';

function setup(def: BossDef) {
  const events = new GameEvents(() => {});
  const actors = new ActorRegistry(events);
  const dr = new DamageResolver(actors, events, () => {});
  const bosses = new BossRegistry({ events, actors, damage: dr, state: new WorldState(events, () => {}), report: () => {} });
  const player = actors.spawn(playerInit());
  const boss = actors.spawn({ kind: 'prior', team: 'hostile', maxHealth: 100, maxPoise: 10 });
  const seen: string[] = [];
  events.onAny((t) => seen.push(String(t)));
  const undo = bosses.register(boss.id, def);
  const stagger = () => { boss.restorePoise(); dr.stagger(boss.id, player.id, 10); };
  return { bosses, seen, stagger, undo };
}
const defFor = (id: keyof typeof ACT3_BOSS_RULES, extra: Partial<BossDef> = {}): BossDef =>
  ({ bossId: id, nameKey: `boss.${id}`, phases: [], breaksPerPhase: 1, ...ACT3_BOSS_RULES[id], ...extra });

describe('Act 3 boss ids and rules', () => {
  it('ids are kebab-case and the rules cover every id', () => {
    expect(ACT3_BOSS_IDS).toEqual({ murkjaw: 'murkjaw', corvinSkarl: 'corvin-skarl' });
    expect(Object.keys(ACT3_BOSS_RULES).sort()).toEqual(Object.values(ACT3_BOSS_IDS).sort());
    expect(ACT3_BOSS_RULES.murkjaw.releaseWindowSeconds).toBe(0);
    expect(ACT3_BOSS_RULES['corvin-skarl'].mercyVerb).toBe('spare');
  });

  it('the registry accepts a def built from each', () => {
    for (const id of Object.values(ACT3_BOSS_IDS)) {
      const { bosses } = setup(defFor(id));
      expect(bosses.active()).toEqual([id]);
    }
  });

  it('murkjaw: the last break opens no release window', () => {
    const { stagger, seen } = setup(defFor('murkjaw'));
    stagger();
    expect(seen).toContain('boss.break');
    expect(seen).not.toContain('boss.releaseWindow');
  });

  it('corvin-skarl keeps the default window, and acceptBreak (the forced-break hook) holds or lets a break through', () => {
    let allow = false;
    const { stagger, seen } = setup(defFor('corvin-skarl', { acceptBreak: () => allow }));
    stagger();
    expect(seen).not.toContain('boss.break');
    allow = true;
    stagger();
    expect(seen).toContain('boss.break');
    expect(seen).toContain('boss.releaseWindow');
  });
});
