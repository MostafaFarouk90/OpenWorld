import type { GamePlugin } from '../core/plugins';
import { DialogueRunner } from './DialogueRunner';
import { createDialoguePanel, handleDialogueInput } from './DialoguePanel';
import { validateDialogue } from './validate';
import { dialogueDefs } from './content';
import { dialogueStrings } from './strings.en';
import { createEffectRunner } from '../quests/effects';
import type { BusPort } from '../quests/ports';
import '../quests/service';

const plugin: GamePlugin = {
  id: 'dialogue',
  dependsOn: ['core', 'quests'],
  setup(ctx) {
    const warn = (m: string): void => console.warn(`[dialogue] ${m}`);
    ctx.strings.register('en', { ...dialogueStrings, 'dialogue.next': '{key}: next' });

    const quests = ctx.services.require('quests');
    const bus = ctx.events as unknown as BusPort;
    const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
    const effects = createEffectRunner({
      state: ctx.state,
      quests,
      bus,
      progression: () => svc('progression'),
      inventory: () => svc('inventory'),
      sourceId: 'dialogue',
      warn,
    });
    const runner = new DialogueRunner({
      bus,
      state: ctx.state,
      quests,
      effects,
      strings: ctx.strings,
      playerName: () => {
        const n = ctx.state.getFlag('player.name');
        return typeof n === 'string' && n ? n : 'Cael';
      },
      warn,
    });
    for (const def of dialogueDefs) {
      const { errors } = validateDialogue(def, (k) => ctx.strings.has(k));
      if (errors.length) {
        warn(`dialogue "${def.id}" skipped: ${errors.join('; ')}`);
        continue;
      }
      runner.register(def);
    }

    ctx.persist.register({
      key: 'dialogue',
      version: 1,
      serialize: () => runner.serialize(),
      load: (data) => runner.load(data),
    });

    // The input context follows the runner: pushed while a dialogue is open, popped when it ends.
    let popContext: (() => void) | null = null;
    const syncContext = (): void => {
      if (runner.isOpen && !popContext) {
        popContext = ctx.input.contexts.push('dialogue', 'dialogue');
        if (typeof document !== 'undefined') document.exitPointerLock?.();
      } else if (!runner.isOpen && popContext) {
        popContext();
        popContext = null;
      }
    };
    runner.onChange(syncContext);

    const panel = createDialoguePanel(runner);
    if (panel.element) {
      ctx.hud.mount('bottom-center', { id: 'dialogue-panel', element: panel.element, order: 50, dispose: () => panel.dispose() });
    }

    ctx.events.on('actor.died', (e) => {
      if (e.actorId === ctx.player.actor.id) runner.close('death');
    });
    ctx.events.on('save.loaded', () => runner.close('load'));

    ctx.services.provide('dialogue', {
      start: (dialogueId, npcId) => {
        if (ctx.hud.modalOpen) return false;
        return runner.start(dialogueId, npcId);
      },
      get active() {
        return runner.isOpen;
      },
      close: (reason = 'script') => runner.close(reason),
      hasSeen: (id) => runner.hasSeen(id),
    });

    ctx.systems.add({
      id: 'dialogue-input',
      fixedPhase: 'input',
      order: 10,
      fixedUpdate: () => handleDialogueInput(runner, ctx.input.actions),
      dispose: () => {
        runner.close('dispose');
        syncContext();
      },
    });
  },
};

export default plugin;
