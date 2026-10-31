import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEAVY_CHOP_CLIP } from '../../combat/heavyBlow';
import { createFakeCore } from '../../region/testing/fakeCore';
import { ENEMY_DEFS } from '../defs';
import { AERIE_WYRMS_AWAY_FLAG } from '../act3Spawners';
import { DRAGONSPINE_CODEX, DRAGONSPINE_CODEX_SIGHT } from './codex';
import { DRAGONSPINE_FAUNA_LAYOUT } from './dragonspineFauna.layout';
import plugin, { D06_QUEST_ID, DRAGONSPINE_KILL_XP_FACTOR, SKARL_BOSS_ID, skarlFightArmed } from './peak.plugin';

type Enemy = { id: string; def: { kind: string }; active: boolean; feet: { x: number; z: number } };

function setup(opts: { factor?: boolean } = {}) {
  const fc = createFakeCore();
  const enemies: Enemy[] = [];
  fc.services.set('enemies', { ground: { all: () => enemies, get: (id: string) => enemies.find((e) => e.id === id) } });
  const factors = new Map<string, number>();
  if (opts.factor ?? true) {
    fc.services.set('killXpRegionFactor', {
      set(region: string, f: number) {
        factors.set(region, f);
        return () => factors.delete(region);
      },
    });
  }
  const unlocked: string[] = [];
  const registered: unknown[][] = [];
  fc.services.set('codex', {
    register(entries: unknown[]) {
      registered.push(entries);
      return () => registered.splice(registered.indexOf(entries), 1);
    },
    unlock: (id: string) => void unlocked.push(id),
  });
  const quests = { list: [] as string[], active: () => quests.list };
  fc.services.set('quests', quests);
  const bosses = new Map<string, { outcome: string | null }>();
  (fc.ctx as unknown as { bosses: unknown }).bosses = { state: (id: string) => bosses.get(id) ?? null };
  const add = (id: string, kind: string, x = 0, z = 0) => enemies.push({ id, def: { kind }, active: true, feet: { x, z } });
  const hit = (targetId: string, req: Record<string, unknown>, attackerTeam = 'player') => {
    const r = { outcome: 'hit', kind: 'melee', amount: 10, poise: 10, ...req };
    fc.modifiers.get('peak.ogre-poise')!(r, { id: targetId, poise: 100 }, { team: attackerTeam });
    return r as { poise: number };
  };
  return { fc, enemies, factors, unlocked, registered, quests, bosses, add, hit };
}

afterEach(() => {
  plugin.dispose?.();
});

describe('peak-creatures plugin', () => {
  it('defines every fauna anchor, the Dragonspine factor, the codex entries and the strings; dispose undoes them', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    expect(s.fc.anchors.size).toBe(DRAGONSPINE_FAUNA_LAYOUT.anchors.length);
    expect(s.factors.get('dragonspine')).toBe(DRAGONSPINE_KILL_XP_FACTOR);
    expect(s.registered[0]).toBe(DRAGONSPINE_CODEX);
    expect(s.fc.strings.get('codex.bestiary.rime-hawk.name')).toBe('Rime Hawk');
    expect(s.fc.strings.get('codex.bestiary.crag-ogre.name')).toBe('Crag Ogre');
    plugin.dispose?.();
    expect(s.fc.anchors.size).toBe(0);
    expect(s.factors.has('dragonspine')).toBe(false);
    expect(s.registered).toHaveLength(0);
    expect(s.fc.modifiers.has('peak.ogre-poise')).toBe(false);
  });

  it('with no factor service it warns and still sets up', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = setup({ factor: false });
    plugin.setup(s.fc.ctx);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('killXpRegionFactor'));
    expect(s.fc.anchors.size).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('a player\'s or an ally\'s heavy chop on an ogre deals double poise; light swings, other kinds and hostiles are untouched', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    s.add('ogre#1', 'crag-ogre');
    s.add('hawk#1', 'rime-hawk');
    expect(s.hit('ogre#1', { attackId: HEAVY_CHOP_CLIP, poise: 12 }).poise).toBe(24);
    expect(s.hit('ogre#1', { attackId: HEAVY_CHOP_CLIP, poise: 12 }, 'ally').poise).toBe(24);
    expect(s.hit('ogre#1', { attackId: 'x', poise: 12 }).poise).toBe(12);
    expect(s.hit('hawk#1', { attackId: HEAVY_CHOP_CLIP, poise: 12 }).poise).toBe(12);
    expect(s.hit('ogre#1', { attackId: HEAVY_CHOP_CLIP, poise: 12 }, 'hostile').poise).toBe(12);
    expect(s.hit('ogre#1', { attackId: HEAVY_CHOP_CLIP, poise: 12, outcome: 'blocked' }).poise).toBe(12);
  });

  it('unlocks a hawk or an ogre on first sight within range', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    s.add('hawk#1', 'rime-hawk', 0, DRAGONSPINE_CODEX_SIGHT + 5);
    s.fc.tick('afterCombat', 0.6);
    expect(s.unlocked).toEqual([]);
    s.enemies[0]!.feet.z = DRAGONSPINE_CODEX_SIGHT - 1;
    s.fc.tick('afterCombat', 0.6);
    expect(s.unlocked).toEqual(['rime-hawk']);
  });

  it('sends the Aerie wyrms off while Skarl\'s fight is armed (his boss undecided, or D06 active), and back after', () => {
    const s = setup();
    plugin.setup(s.fc.ctx);
    s.fc.tick('afterCombat', 0.6);
    expect(s.fc.flags.get(AERIE_WYRMS_AWAY_FLAG) ?? false).toBe(false);
    s.quests.list = [D06_QUEST_ID];
    s.fc.tick('afterCombat', 0.6);
    expect(s.fc.flags.get(AERIE_WYRMS_AWAY_FLAG)).toBe(true);
    s.quests.list = [];
    s.bosses.set(SKARL_BOSS_ID, { outcome: null });
    s.fc.tick('afterCombat', 0.6);
    expect(s.fc.flags.get(AERIE_WYRMS_AWAY_FLAG)).toBe(true);
    s.bosses.set(SKARL_BOSS_ID, { outcome: 'spared' });
    s.fc.tick('afterCombat', 0.6);
    expect(s.fc.flags.get(AERIE_WYRMS_AWAY_FLAG)).toBe(false);
  });

  it('skarlFightArmed with no bosses or quests reads false', () => {
    expect(skarlFightArmed(undefined, undefined)).toBe(false);
    expect(skarlFightArmed({ state: () => null }, { active: () => ['m31'] })).toBe(false);
  });
});

describe('dragonkin (v0.7 item 13)', () => {
  it('the Ember Wyrm and the wyrmling carry the tag R16\'s bonus reads; the hawk and the ogre do not', () => {
    expect(ENEMY_DEFS['ember-wyrm'].tags).toEqual(['dragonkin']);
    expect(ENEMY_DEFS.wyrmling.tags).toEqual(['dragonkin']);
    expect(ENEMY_DEFS['rime-hawk'].tags).toBeUndefined();
    expect(ENEMY_DEFS['crag-ogre'].tags).toBeUndefined();
  });
});
