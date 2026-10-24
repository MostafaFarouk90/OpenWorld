import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import type { MoveModifier } from '../core/MoveModifiers';
import { QuestManager } from './QuestManager';
import { CarrySystem, type Carryable } from './carry';
import { KILL_FAILSAFE_QUESTS, KillFailsafe, currentKillTargets } from './killFailsafe';
import { VillagerBody, isModelLoader } from './carryBody';
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
import { PostDirector, POST_RULES } from './posts';
import { TorchSystem } from './torch';
import { R02Yard, type R02YardDummies } from './r02Yard';
import { R02_AT_BASTION } from './content/r02.quest';
import { QuestProps } from './props';
import { QUEST_PROPS, INTERACT_FLAGS } from './content/props';
import { CARRY_ITEMS } from './content/carry';
import { QuestNotes, noteNeeded } from './notes';
import { QUEST_NOTES, NOTE_LOOKS, NOTE_CODEX } from './content/notes';
import { installObjectiveFlags } from './objectiveFlags';
import { OBJECTIVE_FLAGS } from './content/objectiveFlags';
import { ACT2_PROPS, ACT2_CARRY, ACT2_OBJECTIVE_FLAGS, ACT2_QUEST_NOTES, ACT2_NOTE_LOOKS, ACT2_NOTE_CODEX, ACT2_QUEST_ITEM_STRINGS } from './content/act2';
import { QuestLooks, lookSpecs } from './looks';
import { buildPropLook, disposePropLook } from './propLooks';
import { codexEntry } from '../codex/entries';
import { createEffectRunner } from './effects';
import type { BusPort } from './ports';
import type { QuestDef } from './types';
import { QUESTS_SAVE_VERSION } from './types';
import './service';

/** Synthetic interact id that completes T12's "open the quest log" objective. */
const JOURNAL_OPENED = 'use:t12-journal-open';

const plugin: GamePlugin = {
  id: 'quests',
  dependsOn: ['core'],
  setup(ctx) {
    const warn = (m: string): void => console.warn(`[quests] ${m}`);
    ctx.strings.register('en', { ...questStrings, ...journalStrings, ...ACT2_QUEST_ITEM_STRINGS, 'quest.prompt.carry': '{key} Carry the villager' });

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
      npcObjectiveLive: (npcId) => manager.npcObjectiveLive(npcId),
      onChange: (l) => manager.onChange(l),
      torch: () => torch?.position() ?? null,
      recheck: () => manager.recheck(),
    });
    ctx.persist.register({
      key: 'quests',
      version: QUESTS_SAVE_VERSION,
      serialize: () => manager.serialize(),
      load: (data, version) => manager.load(data, version),
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
    offs.push(installBridges(bus, ctx.state, manager, warn, INTERACT_FLAGS));
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
      POST_RULES,
      () => ({ state: ctx.state, quests: manager, gold: () => svc('inventory')?.gold, warn }),
      () => svc('npcs'),
      () => svc('dialogue')?.active === true,
    );
    manager.onChange(() => posts.markDirty());
    // A post row keyed on a flag alone (Wenna at the camp, the hall stewards' hostile flag) must apply when the flag changes,
    // also when no quest changes after it (review R3-2). `update()` returns at once when nothing is dirty.
    offs.push(ctx.events.on('flag.changed', () => posts.markDirty()));
    // R02's blocking dummies stand in the yard only while R02 is active (the Bastion yard from M06 on).
    const yard = new R02Yard({
      active: () => manager.state('r02') === 'active',
      atBastion: () => ctx.state.getBool(R02_AT_BASTION),
      spot: (id) => {
        const a = ctx.anchors.find(id);
        return a ? { feet: { x: a.position.x, y: a.position.y, z: a.position.z }, yaw: a.yaw } : null;
      },
      dummies: () => svc('dummies') as R02YardDummies | undefined,
      warn,
    });
    manager.onChange(() => yard.markDirty());
    offs.push(() => yard.dispose());
    // Story flags set as objectives finish (fires, spawners, walk-offs read them).
    const objectiveFlags = installObjectiveFlags([...OBJECTIVE_FLAGS, ...ACT2_OBJECTIVE_FLAGS], bus, ctx.state, manager, warn);
    offs.push(objectiveFlags.dispose);
    objectiveFlags.sync();
    offs.push(ctx.events.on('save.loaded', () => { posts.reset(); yard.markDirty(); manager.recheck(); objectiveFlags.sync(); }));
    // Points the player at the next giver; only the live event, so a load never re-announces it.
    offs.push(ctx.events.on('quest.completed', (e) => {
      if (e.questId === 'm02') ctx.events.emit('hud.toast', { textKey: 'quest.lead.m03' });
    }));
    const journalHud = {
      get modalOpen() {
        return ctx.hud.modalOpen;
      },
      openModal: (w: { element: HTMLElement | null; dispose(): void }) =>
        w.element ? ctx.hud.openModal({ id: 'journal', element: w.element, dispose: () => w.dispose() }) : null,
    };

    // Carrying is built on the first rules tick, after every plugin (and thread 4's anchors) exists.
    let carry: CarrySystem | null = null;
    const visuals: THREE.Object3D[] = [];
    const bodies: VillagerBody[] = [];
    const disposeVisuals = (): void => {
      for (const b of bodies.splice(0)) b.dispose();
      for (const m of visuals) {
        if ((m as THREE.Mesh).isMesh) {
          m.removeFromParent();
          (m as THREE.Mesh).geometry.dispose();
          ((m as THREE.Mesh).material as THREE.Material).dispose();
        } else {
          disposePropLook(m);
        }
      }
      visuals.length = 0;
    };
    const buildCarry = (): CarrySystem => {
      const carryables: Carryable[] = [];
      let villagers = 0;
      for (const item of [...CARRY_ITEMS, ...ACT2_CARRY]) {
        // villagers are KayKit figures (a capsule until the model loads), cradled across the Knight's arms; buckets are the greybox bucket held low
        const villager = item.look === 'villager' || item.look === 'wounded';
        const body = villager
          ? new VillagerBody(villagers++, item.look === 'wounded' ? 0x7a5a4a : 0x8a6d4b, isModelLoader(ctx.assets) ? ctx.assets : null)
          : null;
        const mesh: THREE.Object3D = body ? body.root : buildPropLook(item.look === 'bundle' ? 'box' : 'bucket');
        mesh.visible = false;
        ctx.scene.add(mesh);
        if (body) bodies.push(body);
        else visuals.push(mesh);
        const anchor = ctx.anchors.find(item.homeAnchor);
        const needs = item.requiresFlag;
        carryables.push({
          id: item.id,
          interactableId: item.interactableId,
          home: () => anchor && { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z },
          setPosition: (p, yaw) => {
            if (body) body.setPose(p, yaw);
            else mesh.position.set(p.x, p.y + (yaw === undefined ? -0.3 : 0.7), p.z);
          },
          setVisible: (on) => { mesh.visible = on; },
          deliveredFlag: item.deliveredFlag,
          questId: item.questId,
          objectiveId: item.objectiveId,
          destination: item.destination,
          promptKey: item.promptKey,
          ...(needs ? { requires: () => ctx.state.getFlag(needs) === true } : {}),
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
          facingYaw: () => ctx.player.facingYaw,
          addMoveModifier: (s, m) => ctx.player.addMoveModifier(s, m as MoveModifier),
        },
        interactables: {
          register: (i) =>
            ctx.interaction.register({
              id: i.id,
              kind: 'pickup',
              name: i.id.replace(/^pickup:/, ''),
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
          facingYaw: () => ctx.player.facingYaw,
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
    const propEnv = () => ({ state: ctx.state, quests: manager, gold: () => svc('inventory')?.gold, warn });
    const props = new QuestProps([...QUEST_PROPS, ...ACT2_PROPS], {
      bus,
      env: propEnv,
      state: ctx.state,
      quests: manager,
      anchor: (id) => {
        const a = ctx.anchors.find(id);
        return a && { x: a.position.x, y: a.position.y, z: a.position.z };
      },
      register: (i) =>
        ctx.interaction.register({
          id: i.id, kind: i.kind as 'use' | 'pickup', name: i.name, radius: i.radius, promptKey: i.promptKey, enabled: i.enabled, priority: i.priority,
          // enabled only while its objective is current, so an enabled prop is always one an objective needs (playtest bug 2)
          live: () => true,
          position: (out) => { i.position(out); return out; },
          onInteract: () => i.onInteract(),
        }),
      warn,
    });
    // Readable notes: F opens a short dialogue under the note's own id; the first full read unlocks its codex entry.
    const notes = new QuestNotes([...QUEST_NOTES, ...ACT2_QUEST_NOTES], {
      bus,
      env: propEnv,
      anchor: (id) => {
        const a = ctx.anchors.find(id);
        return a && { x: a.position.x, y: a.position.y, z: a.position.z };
      },
      register: (i) =>
        ctx.interaction.register({
          id: i.id, kind: 'use', name: i.id.replace(/^use:/, ''), radius: i.radius, promptKey: i.promptKey, enabled: i.enabled,
          // read live: a note standing on an NPC gives way once read (QuestNotes.priorityOf)
          get priority() { return i.priority; },
          live: () => i.live(),
          position: (out) => { i.position(out); return out; },
          onInteract: () => i.onInteract(),
        }),
      startDialogue: (d, n) => svc('dialogue')?.start?.(d, n) === true,
      codexUnlock: (id) => svc('codex')?.unlock?.(id),
      quests: {
        isObjectiveCurrent: (q, o) => manager.isObjectiveCurrent(q, o),
        counted: (q, o, key) => manager.counted(q, o, key),
        npcObjectiveLive: (npcId) => manager.npcObjectiveLive(npcId),
        noteNeeded: (noteId) => noteNeeded(manager, noteId),
      },
      warn,
    });
    const looks = new QuestLooks(lookSpecs([...QUEST_PROPS, ...ACT2_PROPS], [...QUEST_NOTES, ...ACT2_QUEST_NOTES], { ...NOTE_LOOKS, ...ACT2_NOTE_LOOKS }), {
      state: ctx.state,
      quests: manager,
      anchor: (id) => {
        const a = ctx.anchors.find(id);
        return a && { x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw };
      },
      build: (look, at) => {
        const g = buildPropLook(look);
        g.position.set(at.x, at.y, at.z);
        g.rotation.y = at.yaw;
        ctx.scene.add(g);
        return { setVisible: (on) => { g.visible = on; }, dispose: () => disposePropLook(g) };
      },
      warn,
    });
    // The notes' lore entries, registered once the codex service exists.
    let codexOff: (() => void) | null = null;
    const registerLore = (): void => {
      const codex = svc('codex');
      if (codexOff || !codex?.register) return;
      const slug = (id: string) => id.replace(/^lore\./, '');
      codexOff = codex.register([...Object.values(NOTE_CODEX), ...ACT2_NOTE_CODEX].map((id) => codexEntry('lore', id, slug(id))));
    };
    const killFailsafe = new KillFailsafe({
      // the groups are gated on the tutorial's end (M01 is already active during T13 to T15)
      targets: () => (ctx.state.getBool('tutorial.complete') ? currentKillTargets(manager, KILL_FAILSAFE_QUESTS) : []),
      live: (tag) => {
        let n = 0;
        for (const a of ctx.actors.all()) if (!a.dead && (a as { spawnTag?: string }).spawnTag === tag) n++;
        return n;
      },
      spawnGroup: (id, opts) => svc('enemies')?.spawnGroup(id, opts),
      reset: (id) => svc('enemies')?.reset(id),
      warn,
    });
    let propTick = 0;
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
        killFailsafe.update(dt);
        for (const b of bodies) b.update(dt);
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
        if (++propTick % 30 === 0) {
          props.update();
          notes.update();
          looks.update();
          registerLore();
        }
        posts.update();
        yard.update();
      },
      dispose: () => {
        carry?.dispose();
        carry = null;
        for (const o of offs.splice(0)) o();
        props.dispose();
        notes.dispose();
        looks.dispose();
        codexOff?.();
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
