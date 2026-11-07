/**
 * D08 on the real game (L11, stacked on L6 PR 2): from the Act 4 d08 fixture, Leofric at the door, the cathedral entered the
 * real way, the narthex's knights put down, the notes read, the real Eormen fight won with L6's `winEormenForTest` (gong only
 * at a phase floor, the Release window) for each outcome, the crypt notes, and Wulfhild's report. The Crown Shard comes only
 * from a defeat.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFromSave, type ChapterHarness } from './chapterHarness';
import { winEormenForTest } from '../bosses/act4/eormen/testing';
import { ARENA } from '../bosses/act4/eormen/tuning';
import { HUSK_CATHEDRAL_DOOR_ID, HUSK_CATHEDRAL_OUTSIDE } from '../waste/interiors/huskCathedral';
import { CATHEDRAL_ID, D08_BOSS_FLAG, D08_DYING, D08_KNIGHTS, D08_NOTES, D08_SHARD_GIVEN } from '../quests/content/act4/waste/d08.quest';
import { WASTE_REWARD_IDS } from '../quests/content/act4/waste/rewards';

const FILES = import.meta.glob<Record<string, unknown>>('../save/__fixtures__/act4/act4-d08.json', { eager: true, import: 'default' });
const D08_SAVE = FILES['../save/__fixtures__/act4/act4-d08.json']!;

let h: (ChapterHarness & { loaded: boolean }) | null = null;
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  h?.dispose();
  h = null;
  vi.restoreAllMocks();
});

describe('D08 on the real game', () => {
  for (const outcome of ['released', 'defeated'] as const) {
    it(`plays through to the report when Eormen is ${outcome}`, async () => {
      h = await bootFromSave(D08_SAVE, { models: true, virtualClock: true });
      expect(h.loaded).toBe(true);
      const { ctx } = h;
      const q = ctx.services.require('quests');
      const cur = () => q.get('d08')!.objectives.find((o) => !q.objectiveDone('d08', o.id))?.id ?? null;
      /** An interior transition resolves only as the game ticks: tick until it does, then settle. */
      const settle = async (p: Promise<void>) => {
        let done = false;
        void p.then(() => { done = true; });
        for (let i = 0; i < 40 && !done; i++) await h!.runAsync(15);
        expect(done, 'the transition finished').toBe(true);
        await h!.runAsync(30);
      };
      // the fixture predates the Waste quests: Phase G is done; M42 and M43 are completed here
      expect(q.state('m41')).toBe('completed');
      for (const id of ['m42', 'm43']) { q.start(id); q.complete(id); }
      await h.runAsync(10);
      expect(q.state('m43')).toBe('completed');
      // the brief: the quest offered by Wulfhild (her hub is covered by the dialogue tests)
      expect(q.start('d08')).toBe(true);
      ctx.events.emit('dialogue.ended', { dialogueId: 'npc-wulfhild', npcId: 'wulfhild', reason: 'completed' });
      await h.runAsync(30);
      expect(cur()).toBe('dying');
      // Leofric by the door, a real conversation
      const lp = ctx.services.require('npcs').position(D08_DYING)!;
      expect(lp, 'Leofric kneels by the door').toBeTruthy();
      await h.approach(lp, 2);
      expect(h.talk(`npc-${D08_DYING}`, D08_DYING)).toBeGreaterThan(0);
      await h.runAsync(30);
      expect(cur()).toBe('enter');
      // the door, the real way
      await h.approach(h.anchor(HUSK_CATHEDRAL_OUTSIDE), 1.5);
      await settle(ctx.services.require('interiors').enter(CATHEDRAL_ID, HUSK_CATHEDRAL_DOOR_ID));
      expect(cur()).toBe('knights');
      // the narthex: each Husk Knight rises once, so keep striking until every tagged body is gone
      const tagged = () => [...ctx.actors.all()].filter((a) => (D08_KNIGHTS as readonly string[]).includes(a.spawnTag ?? '') && a.health > 0);
      for (let i = 0; i < 120 && cur() === 'knights'; i++) {
        for (const a of tagged()) ctx.damage.apply({ attackerId: ctx.player.actor.id, targetId: a.id, amount: 100_000, poise: 999, kind: 'melee' });
        await h.runAsync(30);
        ctx.player.actor.health = ctx.player.actor.maxHealth;
      }
      expect(cur()).toBe('bones');
      for (const n of [D08_NOTES.bones, D08_NOTES.rope]) { h.talk(n, n); await h.runAsync(10); }
      expect(cur()).toBe('boss');
      // the nave: the real fight
      await h.enterTrigger(ARENA.trigger);
      const r = winEormenForTest({ ctx, step: () => h!.run(1) }, { outcome });
      expect(r.outcome).toBe(outcome);
      expect(ctx.state.getFlag(D08_BOSS_FLAG)).toBe(outcome);
      await h.runAsync(60);
      expect(cur()).toBe('tablets');
      for (const n of [D08_NOTES.tablets, D08_NOTES.niche]) { h.talk(n, n); await h.runAsync(10); }
      expect(cur()).toBe('report');
      // out, and the report with Wulfhild
      await settle(ctx.services.require('interiors').exit(HUSK_CATHEDRAL_DOOR_ID));
      await h.approach(ctx.services.require('npcs').position('wulfhild')!, 2);
      expect(h.talk('npc-wulfhild', 'wulfhild')).toBeGreaterThan(0);
      await h.runAsync(30);
      expect(q.state('d08')).toBe('completed');
      expect(ctx.state.getFlag(D08_SHARD_GIVEN) === true).toBe(outcome === 'defeated');
      expect(ctx.services.require('inventory').count(WASTE_REWARD_IDS.d08)).toBe(outcome === 'defeated' ? 1 : 0);
    }, 600_000);
  }
});
