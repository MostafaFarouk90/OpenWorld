import * as THREE from 'three';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import corePlugin from '../core/core.plugin';
import { Game } from '../core/Game';
import { MoveModifiers } from '../core/MoveModifiers';
import type { GamePlugin, PluginModule } from '../core/plugins';
import { InputManager } from '../input/InputManager';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { TerrainColliders } from '../world/TerrainColliders';
import { World } from '../world/World';
import questsPlugin from '../quests/quests.plugin';
import { FAVOUR_TAB_FLAG, PLACEHOLDER_KEY, TAB_FAVOUR, TAB_STORY, type JournalService, type JournalTabs } from '../quests/journalTabs';
import hudJournalPlugin from './hudJournal.plugin';
import { asFake, fakeRoot } from './fakeDom';

let physics: PhysicsWorld;
beforeAll(() => { (globalThis as any).self ??= globalThis; });
beforeEach(async () => {
  physics = new PhysicsWorld();
  await physics.init();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const modules = (...plugins: GamePlugin[]): Record<string, PluginModule> =>
  Object.fromEntries(plugins.map((p) => [`/src/test/${p.id}.plugin.ts`, { default: p }]));

async function boot(...plugins: GamePlugin[]) {
  const scene = new THREE.Scene();
  const moveModifiers = new MoveModifiers();
  const world = new World(scene, physics, {
    colliders: new TerrainColliders(physics, { patchSize: 50, cells: 16 }),
    moveModifier: () => moveModifiers.state(),
  });
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as Element | null });
  const element = Object.assign(new EventTarget(), { requestPointerLock: () => {} }) as unknown as HTMLElement;
  const input = new InputManager(element, win, doc, { storage: null });
  const game = new Game({ scene, physics, world, input, moveModifiers, report: () => {} });
  const statuses = await game.loadPlugins(modules(...plugins));
  const journal = game.ctx.services.get('journal') as JournalTabs | undefined;
  return { game, world, statuses, ctx: game.ctx, journal };
}
const done = (t: { game: Game; world: World }) => { t.game.dispose(); t.world.dispose(); };
const text = (root: HTMLElement) => asFake(root).all().map((e) => e.textContent).filter(Boolean);

describe('hud-journal plugin', () => {
  it('registers both tabs even when listed before quests (dependsOn orders it after)', async () => {
    const t = await boot(corePlugin, hudJournalPlugin, questsPlugin);
    expect(t.statuses.filter((s) => s.state !== 'ok')).toEqual([]);
    const fav = t.journal!.get(TAB_FAVOUR)!;
    const story = t.journal!.get(TAB_STORY)!;
    const root = fakeRoot();
    fav.render(root);
    expect(text(root)).toContain('Halvard');
    const sroot = fakeRoot();
    story.render(sroot);
    expect(text(sroot)).toContain('Story so far');
    expect(text(sroot)).toContain('Your story has only just begun.');
    done(t);
  });

  it('Favour visibility is set by a load (flag without event) and by play', async () => {
    const t = await boot(corePlugin, questsPlugin, hudJournalPlugin);
    expect(t.journal!.visible().map((x) => x.id)).toEqual([TAB_STORY]);
    (t.ctx.state as any).flags.set(FAVOUR_TAB_FLAG, true);
    expect(t.journal!.visible().map((x) => x.id)).toEqual([TAB_FAVOUR, TAB_STORY]);
    done(t);
  });

  it('story tab reads quests and flags through the real services', async () => {
    const t = await boot(corePlugin, questsPlugin, hudJournalPlugin);
    t.ctx.state.setFlag('world.brightwater.barley', 'saved');
    const root = fakeRoot();
    t.journal!.get(TAB_STORY)!.render(root);
    expect(text(root).some((s) => s.includes('barley'))).toBe(true);
    done(t);
  });

  it('dispose restores the placeholders', async () => {
    const t = await boot(corePlugin, questsPlugin, hudJournalPlugin);
    const journal = t.journal!;
    const real = journal.get(TAB_FAVOUR)!;
    t.game.dispose();
    const back = journal.get(TAB_FAVOUR)!;
    expect(back).not.toBe(real);
    const root = fakeRoot();
    back.render(root);
    // the placeholder is quests' own text, not ours
    expect(asFake(root).byClass('favour-row')).toHaveLength(0);
    expect(journal.get(TAB_STORY)).toBeDefined();
    void PLACEHOLDER_KEY;
    t.world.dispose();
  });

  it('a render that throws is catchable by the caller (the panel catches it)', async () => {
    const t = await boot(corePlugin, questsPlugin, hudJournalPlugin);
    const root = fakeRoot();
    root.replaceChildren = () => { throw new Error('bad root'); };
    expect(() => t.journal!.get(TAB_STORY)!.render(root)).toThrow('bad root');
    expect(() => t.journal!.get(TAB_FAVOUR)!.render(root)).toThrow('bad root');
    done(t);
  });

  it('without quests the plugin is skipped, not crashed', async () => {
    const t = await boot(corePlugin, hudJournalPlugin);
    expect(t.statuses.find((s) => s.id === 'hud-journal')?.state).toBe('skipped');
    expect(t.journal).toBeUndefined();
    done(t);
  });
});

void (null as unknown as JournalService);
