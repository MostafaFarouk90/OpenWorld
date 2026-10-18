import type { GamePlugin } from '../core/plugins';
import { DialogueRunner } from './DialogueRunner';
import { createDialoguePanel, handleDialogueInput } from './DialoguePanel';
import { computeVowTone, T04_DIALOGUE_ID } from './content/t04-vow.dialogue';
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
      npcs: () => svc('npcs'),
      enemies: () => svc('enemies'),
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

    // The dialogue is a HUD modal that pushes the `dialogue` input context (input-and-hud.md item 10).
    // The panel element is detached on close and re-attached on the next open; the widget itself has no
    // dispose, so the panel lives for the plugin's lifetime.
    const panel = createDialoguePanel(runner);
    let closeModal: (() => void) | null = null;
    const openModal = (): boolean => {
      // Headless (tests): the HUD has no DOM, so any element stands in.
      const element = panel.element ?? ({} as HTMLElement);
      closeModal = ctx.hud.openModal({ id: 'dialogue', element }, { context: 'dialogue' });
      return closeModal !== null;
    };
    runner.onChange(() => {
      if (!runner.isOpen && closeModal) {
        const close = closeModal;
        closeModal = null;
        close();
      }
    });

    // T04 tone follows the vows however the dialogue ended (a skip keeps unchosen vows at earnest).
    ctx.events.on('dialogue.ended', (e) => {
      if (e.dialogueId !== T04_DIALOGUE_ID) return;
      const vow = (n: number): string => String(ctx.state.getFlag(`tutorial.t04.vow${n}`) ?? 'earnest');
      try {
        ctx.state.setFlag('tutorial.t04.tone', computeVowTone(vow(1), vow(2), vow(3)));
      } catch (err) {
        warn(`could not write tutorial.t04.tone: ${String(err)}`);
      }
    });

    ctx.events.on('actor.died', (e) => {
      if (e.actorId === ctx.player.actor.id) runner.close('death');
    });
    ctx.events.on('save.loaded', () => runner.close('load'));

    ctx.services.provide('dialogue', {
      start: (dialogueId, npcId) => {
        if (ctx.hud.modalOpen || runner.isOpen) return false;
        // The modal (and its context) opens first so `dialogue.started` listeners already see it.
        if (!openModal()) return false;
        if (runner.start(dialogueId, npcId)) return true;
        const close = closeModal;
        closeModal = null;
        close?.();
        return false;
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
        panel.dispose();
      },
    });
  },
};

export default plugin;
