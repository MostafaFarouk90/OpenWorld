import * as THREE from 'three';
import { CLASS_IDS, type ClassId } from '../actors/classes';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { KnightAvatar } from '../characters/KnightAvatar';
import type { PlayerAvatar } from '../characters/PlayerAvatar';
import '../hud/events';
import { asHtml, hudDocument } from '../hud/soft';
import type { ProgressionService } from '../hud/ports';
import type { RespecModalService } from '../hud/RespecModal';
import { getItem } from '../inventory/items';
import { registerClassStats } from '../progression/classStats';
import { SKILLS } from '../progression/skills';
import { ClassAvatar, type ClassAssetSource } from './ClassAvatar';
import { Classes, type ClassInventory } from './Classes';
import { DrillRunner, type DrillPorts } from './DrillRunner';
import {
  CHOSEN_FLAG,
  CLASSES_OFFERED,
  CLASS_OPEN_FLAG,
  CLASS_STATS,
  DEFAULT_KITS,
  YARD_ANCHOR,
  availableFlag,
  drillFlag,
  npcBastionPost,
  trainerAnchor,
  trainerId,
} from './kits';
import { KitSwapper } from './KitSwapper';
import { CLASSES_STRINGS_EN } from './strings.en';
import { TrainerDesk } from './TrainerDesk';
import './types';

/** A trainer serves only while its NPC stands within this many metres of its Bastion post (Gaut is at the gate in M06). */
export const TRAINER_POST_RADIUS = 4;
/** Fixed-phase order inside the `rules` band reserved for classes (500..549). */
const ORDER = 510;

type Loose = { get(name: string): unknown };

const classesPlugin: GamePlugin = {
  id: 'classes',
  dependsOn: ['core', 'progression'],
  setup(ctx: GameContext) {
    const loose = ctx.services as unknown as Loose;
    const svc = <T>(name: string): T | undefined => loose.get(name) as T | undefined;
    const warn = (m: string) => console.warn(m);
    const progression = () => svc<ProgressionService>('progression');
    const toast = (textKey: string, params?: Record<string, string | number>) => ctx.events.emit('hud.toast', { textKey, params });
    ctx.strings.register('en', CLASSES_STRINGS_EN);

    // Design 9 rows; a plugin restart finds them registered already, which is fine.
    for (const [id, row] of Object.entries(CLASS_STATS)) {
      const r = registerClassStats(id, row);
      if (!r.ok && r.reason !== 'duplicate') warn(`classes: stats for ${id} refused (${r.reason})`);
    }

    const playerId = () => ctx.actors.player.id;
    const inCombat = () => svc<{ hostileAggro?: boolean }>('waystones')?.hostileAggro === true;
    let casting = false;
    let attached = ctx.player.avatar !== null;

    const yardDistance = (): number | null => {
      const yard = ctx.anchors.find(YARD_ANCHOR);
      if (!yard) return null;
      const f = ctx.player.feet;
      return Math.hypot(f.x - yard.position.x, f.z - yard.position.z);
    };

    const drillPorts: DrillPorts = {
      prompts: () => svc('prompts'),
      enemies: () => svc('enemies'),
      pauseKillXp: (source) => progression()?.pauseKillXp(source),
      wornClass: () => ctx.player.avatar?.classId ?? null,
      hasSkills: (id) => SKILLS.some((s) => s.classId === id && s.availableWhen === true),
      canBuySkill: () => progression()?.nextUnlock().kind === 'skill',
      hasBarAbility: () => (progression()?.bar() ?? []).some((s) => s !== null),
      distanceFromYard: yardDistance,
      hasString: (k) => ctx.strings.has(k),
      emit: (p) => ctx.events.emit('class.drill', p),
      warn,
    };
    const runner = new DrillRunner(drillPorts);

    const assets = ctx.assets as unknown as (ClassAssetSource & Parameters<typeof KnightAvatar.load>[0]) | null;
    const swapper = new KitSwapper({
      wornClass: () => ctx.player.avatar?.classId ?? null,
      attached: () => attached,
      idle: () => !ctx.actors.player.dead && !inCombat() && !casting && svc<{ busy?: boolean }>('combatVerbs')?.busy !== true,
      build: (id): Promise<PlayerAvatar> => {
        if (!assets) return Promise.reject(new Error('no asset loader'));
        const kit = classes.kit(id) ?? DEFAULT_KITS[id];
        return id === 'knight' ? KnightAvatar.load(assets) : ClassAvatar.load(kit, assets);
      },
      swap: (avatar) => ctx.player.swapAvatar(avatar),
      warn,
      failed: (id) => {
        runner.kitFailed(id);
        toast('classes.kit.failed');
      },
    });

    const classes: Classes = new Classes(
      {
        progression,
        inventory: () => svc<ClassInventory>('inventory'),
        flag: (k) => ctx.state.getFlag(k),
        inCombat,
        emit: ((type: string, payload: unknown) => (ctx.events.emit as (t: string, p: unknown) => void)(type, payload)) as never,
        itemExists: (id) => getItem(id) !== undefined,
        dress: (id) => swapper.request(id),
        warn,
      },
      runner,
    );
    ctx.services.provide('classes', classes);
    // A save without a `classes` entry (every Phase A save) never calls load: reset on its save.loaded instead.
    let loadedEntry = false;
    ctx.persist.register({
      key: Classes.key,
      version: Classes.version,
      serialize: () => classes.serialize(),
      load: (data) => {
        loadedEntry = true;
        classes.load(data);
      },
    });

    // classes.available.<id> follow thread 6's `story.m07.classOpen` (M07 o4), re-derived on a load through ctx.gates.
    const syncAvailable = (): void => {
      const open = ctx.state.getFlag(CLASS_OPEN_FLAG) === true;
      for (const id of CLASSES_OFFERED) {
        const key = availableFlag(id);
        const has = ctx.state.getFlag(key) === true;
        if (open !== has) ctx.state.setFlag(key, open);
      }
    };
    ctx.gates.flag(CLASS_OPEN_FLAG, () => syncAvailable());
    // Mirrors for thread 6's `doneWhen` objectives: `classes.chosen` and `classes.drill.<id>` ('done' | 'skipped').
    const syncMirrors = (): void => {
      const chosen = classes.chosen();
      if ((ctx.state.getFlag(CHOSEN_FLAG) === true) !== chosen) ctx.state.setFlag(CHOSEN_FLAG, chosen);
      for (const id of CLASS_IDS) {
        const outcome = classes.drillOutcome(id);
        if (outcome && ctx.state.getFlag(drillFlag(id)) !== outcome) ctx.state.setFlag(drillFlag(id), outcome);
      }
    };

    // Trainers: a fixed interactable at its own anchor, beside the NPC's post (the NPC's talk stays its dialogue's).
    const desk = new TrainerDesk({
      classes,
      progression,
      respecModal: () => svc<RespecModalService>('respecModal'),
      openModal: (w) => ctx.hud.openModal({ id: w.id, element: asHtml(w.element), dispose: w.dispose }, { context: 'menu' }),
      doc: hudDocument,
      t: (k, p) => ctx.strings.t(k, p),
      toast,
    });
    const warned = new Set<string>();
    const trainerReady = (id: ClassId): boolean => {
      if (!classes.available(id)) return false;
      const kit = classes.kit(id) ?? DEFAULT_KITS[id];
      if (!ctx.anchors.find(trainerAnchor(kit))) {
        if (!warned.has(id)) {
          warned.add(id);
          warn(`classes: anchor "${trainerAnchor(kit)}" is missing; the ${id} trainer is closed`);
        }
        return false;
      }
      const post = ctx.anchors.find(npcBastionPost(kit));
      const at = svc<{ position(id: string): { x: number; y: number; z: number } | undefined }>('npcs')?.position(kit.trainer.npcId);
      if (!post || !at) return true;
      return Math.hypot(at.x - post.position.x, at.z - post.position.z) <= TRAINER_POST_RADIUS;
    };
    const openTrainer = (id: ClassId): void => {
      if (!trainerReady(id)) return;
      const kit = classes.kit(id) ?? DEFAULT_KITS[id];
      desk.open(id, kit.trainer.nameKey);
    };
    for (const id of CLASSES_OFFERED) {
      const kit = DEFAULT_KITS[id];
      ctx.interaction.register({
        id: trainerId(kit),
        kind: 'trainer',
        promptKey: 'classes.trainer.prompt',
        name: ctx.strings.t(kit.trainer.nameKey),
        position: (out: THREE.Vector3) => {
          const a = ctx.anchors.find(trainerAnchor(kit));
          return a ? out.set(a.position.x, a.position.y, a.position.z) : out.set(0, -1e6, 0);
        },
        enabled: () => trainerReady(id),
        onInteract: () => openTrainer(id),
      });
    }

    ctx.events.on('classes.trainer.open', (e) => openTrainer(e.classId));
    ctx.events.on('class.chosen', syncMirrors);
    ctx.events.on('class.changed', syncMirrors);
    ctx.events.on('class.drill', syncMirrors);
    ctx.events.on('player.avatar', () => {
      attached = true;
      // The first avatar is always the Knight; a loaded Warden is dressed as soon as it can be.
      swapper.request(classes.current());
    });
    ctx.events.on('spell.cast', (e) => {
      if (e.casterId === playerId()) casting = true;
    });
    ctx.events.on('spell.released', (e) => {
      if (e.casterId === playerId()) casting = false;
    });
    ctx.events.on('spell.cancelled', (e) => {
      if (e.casterId === playerId()) casting = false;
    });
    ctx.events.on('actor.died', (e) => {
      if (e.actorId !== playerId()) return;
      casting = false;
      desk.closeAll();
    });
    ctx.events.on('save.loaded', () => {
      if (!loadedEntry) classes.load(undefined);
      loadedEntry = false;
      casting = false;
      desk.closeAll();
      syncAvailable();
      syncMirrors();
      swapper.request(classes.current());
      if (classes.chosen() && classes.drillOutcome(classes.current()) === null) {
        const kit = classes.kit(classes.current());
        toast('classes.drill.resume', { trainer: ctx.strings.t(kit?.trainer.nameKey ?? '') });
      }
    });
    ctx.systems.add({
      id: 'classes.fixed',
      fixedPhase: 'rules',
      order: ORDER,
      fixedUpdate() {
        swapper.tick();
        runner.tick();
      },
      dispose() {
        desk.closeAll();
        runner.cancel(true);
        swapper.dispose();
      },
    });
  },
};

export default classesPlugin;
