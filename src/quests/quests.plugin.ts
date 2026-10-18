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
import { journalStrings } from './journalStrings.en';
import { JournalTabs, PLACEHOLDER_KEY, defaultSlots } from './journalTabs';
import { installBridges } from './bridges';
import { installPoiRewards } from './poi';
import { POI_REWARDS } from './content/poi';
import { PostDirector, BRIGHTWATER_POST_RULES } from './posts';
import { TorchSystem } from './torch';
import { R02Yard, type R02YardDummies } from './r02Yard';
import { createEffectRunner } from './effects';
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
    ctx.strings.register('en', { ...questStrings, ...journalStrings, 'quest.prompt.carry': '{key} Carry the villager' });

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
      npcs: () => (ctx.services as unknown as { get(n: string): any }).get('npcs'),
      enemies: () => (ctx.services as unknown as { get(n: string): any }).get('enemies'),
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

    const tabs = new JournalTabs(defaultSlots(
      (k) => ctx.state.getFlag(k),
      (root) => {
        const p = root.ownerDocument.createElement('p');
        p.className = 'journal-empty';
        p.textContent = ctx.strings.t(PLACEHOLDER_KEY);
        root.appendChild(p);
      },
    ));
    ctx.services.provide('journal', tabs);

    const offs: Array<() => void> = [];
    let torch: TorchSystem | null = null;
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
      torch: () => torch?.position() ?? null,
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
    const makeJournal = () => createJournalPanel(() => buildJournalModel(journalSource, ctx.strings), undefined, { tabs, t: (k) => ctx.strings.t(k) });
    manager.onChange(() => journalState.widget?.refresh());
    offs.push(ctx.events.on('flag.changed', () => journalState.widget?.refresh()));

    // Event-to-flag bridges, one-time POI rewards and quest-driven NPC posts.
    offs.push(installBridges(bus, ctx.state, manager, warn));
    const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
    const poiEffects = createEffectRunner({
      state: ctx.state, quests: manager, bus, sourceId: 'poi', warn,
      inventory: () => svc('inventory'), progression: () => svc('progression'),
    });
    offs.push(installPoiRewards(POI_REWARDS, {
      bus, state: ctx.state, run: (e) => poiEffects.run(e), warn,
      codexUnlock: (id) => svc('codex')?.unlock?.(id),
    }));
    const posts = new PostDirector(
      BRIGHTWATER_POST_RULES,
      () => ({ state: ctx.state, quests: manager, warn }),
      () => svc('npcs'),
      () => svc('dialogue')?.active === true,
    );
    manager.onChange(() => posts.markDirty());
    // R02's blocking dummies stand in the yard only while R02 is active.
    const yard = new R02Yard({
      active: () => manager.state('r02') === 'active',
      spot: (id) => {
        const a = ctx.anchors.find(id);
        return a ? { feet: { x: a.position.x, y: a.position.y, z: a.position.z }, yaw: a.yaw } : null;
      },
      dummies: () => svc('dummies') as R02YardDummies | undefined,
      warn,
    });
    manager.onChange(() => yard.markDirty());
    offs.push(() => yard.dispose());
    offs.push(ctx.events.on('save.loaded', () => { posts.reset(); yard.markDirty(); manager.recheck(); }));
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
    let torchTried = false;
    let torchMesh: THREE.Mesh | null = null;
    const buildTorch = (): TorchSystem => {
      torchMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff8a2a }),
      );
      torchMesh.visible = false;
      ctx.scene.add(torchMesh);
      const mesh = torchMesh;
      return new TorchSystem({
        bus,
        player: {
          id: () => ctx.player.actor.id,
          feet: () => ctx.player.feet,
          addMoveModifier: (s, m) => ctx.player.addMoveModifier(s, m as MoveModifier),
        },
        braziers: [1, 2].map((n) => ({
          interactableId: `use:r01-brazier-${n}`,
          position: () => {
            const a = ctx.anchors.find(`r01.brazier.${n}`);
            return a && { x: a.position.x, y: a.position.y, z: a.position.z };
          },
        })),
        registerInteractable: (i) =>
          ctx.interaction.register({
            id: i.id, kind: 'use', name: 'brazier', radius: i.radius, promptKey: i.promptKey, enabled: i.enabled,
            position: (out) => { i.position(out); return out; },
            onInteract: () => i.onInteract(),
          }),
        active: () => manager.isObjectiveCurrent('r01', 'o2'),
        setVisual: (on, at) => { mesh.visible = on; if (at) mesh.position.set(at.x, at.y, at.z); },
        warn,
      });
    };

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
        if (!torchTried && manager.state('r01') !== 'inactive') {
          torchTried = true;
          try {
            torch = buildTorch();
          } catch (err) {
            warn(`torch failed to build: ${String(err)}`);
            torchMesh?.removeFromParent();
          }
        }
        torch?.update();
        posts.update();
        yard.update();
      },
      dispose: () => {
        carry?.dispose();
        carry = null;
        for (const o of offs.splice(0)) o();
        torch?.dispose();
        torch = null;
        torchMesh?.removeFromParent();
        torchMesh?.geometry.dispose();
        (torchMesh?.material as THREE.Material | undefined)?.dispose();
        disposeVisuals();
        manager.dispose();
      },
    });
  },
};

export default plugin;
