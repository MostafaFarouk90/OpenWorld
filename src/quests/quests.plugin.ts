import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import type { MoveModifier } from '../core/MoveModifiers';
import { QuestManager } from './QuestManager';
import { CarrySystem, type Carryable } from './carry';
import {
  buildJournalModel, createJournalPanel, createJournalToggleState, toggleJournal,
} from './JournalPanel';
import { validateQuest } from './validate';
import { questDefs } from './content';
import { questStrings } from './strings.en';
import type { BusPort } from './ports';
import type { QuestDef } from './types';
import './service';

const VILLAGERS = 3;
/** Synthetic interact id that completes T12's "open the quest log" objective. */
const JOURNAL_OPENED = 'use:t12-journal-open';

const plugin: GamePlugin = {
  id: 'quests',
  dependsOn: ['core'],
  setup(ctx) {
    const warn = (m: string): void => console.warn(`[quests] ${m}`);
    ctx.strings.register('en', { ...questStrings, 'quest.prompt.carry': '{key} Carry the villager' });

    const bus = ctx.events as unknown as BusPort;
    const manager = new QuestManager({
      bus,
      state: ctx.state,
      playerId: () => ctx.player.actor.id,
      // spawnTag is set by the spawner on the actor (contract: actors-and-damage.md).
      actorMeta: (id) => ({ spawnTag: (ctx.actors.get(id) as { spawnTag?: string } | undefined)?.spawnTag }),
      triggers: {
        isInside: (triggerId, actorId) =>
          ctx.triggers.isInside(triggerId, actorId),
      },
      progression: () => (ctx.services as unknown as { get(n: string): any }).get('progression'),
      inventory: () => (ctx.services as unknown as { get(n: string): any }).get('inventory'),
      warn,
    });

    const registered: QuestDef[] = [];
    const register = (def: QuestDef): void => {
      const errors = validateQuest(def, (k) => ctx.strings.has(k));
      if (errors.length) {
        warn(`quest "${def.id}" skipped: ${errors.join('; ')}`);
        return;
      }
      manager.register(def);
      registered.push(def);
    };
    for (const def of questDefs) register(def);

    ctx.services.provide('quests', {
      register,
      get: (id) => manager.get(id),
      state: (id) => manager.state(id),
      start: (id) => manager.start(id),
      complete: (id) => manager.complete(id),
      fail: (id) => manager.fail(id),
      completeObjective: (q, o) => manager.completeObjective(q, o),
      objectiveDone: (q, o) => manager.objectiveDone(q, o),
      isObjectiveCurrent: (q, o) => manager.isObjectiveCurrent(q, o),
      objectives: (id) => manager.objectives(id),
      active: () => manager.active(),
      onChange: (l) => manager.onChange(l),
    });
    ctx.persist.register({
      key: 'quests',
      version: 1,
      serialize: () => manager.serialize(),
      load: (data) => manager.load(data),
    });

    // Journal (J).
    const journalState = createJournalToggleState();
    const journalSource = {
      all: () =>
        registered.map((def) => ({ def, state: manager.state(def.id), objectives: manager.objectives(def.id) })),
    };
    const makeJournal = () => createJournalPanel(() => buildJournalModel(journalSource, ctx.strings));
    manager.onChange(() => journalState.widget?.refresh());
    const journalHud = {
      get modalOpen() {
        return ctx.hud.modalOpen;
      },
      openModal: (w: { element: HTMLElement | null; dispose(): void }) =>
        w.element ? ctx.hud.openModal({ id: 'journal', element: w.element, dispose: () => w.dispose() }) : null,
    };

    // Carrying is built on the first rules tick, after every plugin (and thread 4's anchors) exists.
    let carry: CarrySystem | null = null;
    const visuals: THREE.Mesh[] = [];
    const disposeVisuals = (): void => {
      for (const m of visuals) {
        m.removeFromParent();
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      visuals.length = 0;
    };
    const buildCarry = (): CarrySystem => {
      const carryables: Carryable[] = [];
      for (let i = 1; i <= VILLAGERS; i++) {
        const mesh = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.3, 1.0, 4, 8),
          new THREE.MeshStandardMaterial({ color: 0x8a6d4b }),
        );
        mesh.visible = false;
        ctx.scene.add(mesh);
        visuals.push(mesh);
        const anchor = ctx.anchors.find(`m01.villager-${i}`);
        carryables.push({
          id: `villager-${i}`,
          interactableId: `pickup:villager-${i}`,
          home: () => anchor && { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z },
          setPosition: (p) => mesh.position.set(p.x, p.y + 0.8, p.z),
          setVisible: (on) => { mesh.visible = on; },
          deliveredFlag: `quest.m01.villager${i}.delivered`,
          questId: 'm01',
          objectiveId: 'o2',
          destination: 'm01.chapel-door',
          promptKey: 'quest.prompt.carry',
        });
      }
      return new CarrySystem({
        bus,
        flags: {
          get: (k) => ctx.state.getFlag(k) === true,
          set: (k, v) => ctx.state.setFlag(k, v),
        },
        player: {
          id: () => ctx.player.actor.id,
          feet: () => ctx.player.feet,
          addMoveModifier: (s, m) => ctx.player.addMoveModifier(s, m as MoveModifier),
        },
        interactables: {
          register: (i) =>
            ctx.interaction.register({
              id: i.id,
              kind: 'pickup',
              name: 'villager',
              position: (out) => {
                i.position(out);
                return out;
              },
              radius: i.radius,
              promptKey: i.promptKey,
              enabled: i.enabled,
              onInteract: () => i.onInteract(),
            }),
        },
        objectiveCurrent: (q, o) => manager.isObjectiveCurrent(q, o),
        carryables,
        isActionHeld: (a) => ctx.input.actions.down(a),
        warn,
      });
    };

    ctx.systems.add({
      id: 'quests-journal',
      fixedPhase: 'input',
      order: 20,
      fixedUpdate: () => {
        if (!ctx.input.actions.pressed('journal')) return;
        const open = toggleJournal(journalHud, makeJournal, journalState);
        if (open) {
          // T12 "open the log" and the journal tutorial prompt count this as a successful use.
          ctx.events.emit('interact', { interactableId: JOURNAL_OPENED, kind: 'use', actorId: ctx.player.actor.id, action: 'interact' });
          ctx.services.get('prompts')?.success('journal');
        }
      },
    });
    // Built once, after M01 has started (or was loaded as started), when every plugin and thread 4's
    // anchors exist. A build failure is logged once and never retried (no leaked meshes).
    let carryTried = false;
    ctx.systems.add({
      id: 'quests-carry',
      fixedPhase: 'rules',
      order: 10,
      fixedUpdate: (dt) => {
        if (!carryTried && manager.state('m01') !== 'inactive') {
          carryTried = true;
          try {
            carry = buildCarry();
          } catch (err) {
            warn(`carry system failed to build: ${String(err)}`);
            disposeVisuals();
          }
        }
        carry?.update(dt);
      },
      dispose: () => {
        carry?.dispose();
        carry = null;
        disposeVisuals();
        manager.dispose();
      },
    });
  },
};

export default plugin;
