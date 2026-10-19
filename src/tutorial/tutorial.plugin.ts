import * as THREE from 'three';
import { PLAYER_ID } from '../actors/teams';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import { parseAct1 } from '../quests/act1Jump';
import type { Action } from '../input/actions';
import { STARTER_KIT } from '../inventory/items';
import { heightAt } from '../terrain/heightfield';
import { ATTACK_SLOTS } from '../world/World';
import '../enemies/events';
import '../hud/events';
import '../quests/service';
import '../save/service';
import '../waystones/service';
import { BEATS, FULL_ORDER, KETTLEWICK_ORDER, LOCKABLE_VERBS, TUTORIAL_ANCHORS, VETERAN_ORDER } from './beats';
import { CutsceneDirector, type CutsceneShot } from './Cutscene';
import { createGoal } from './goals';
import { TUTORIAL_QUESTS } from './quests';
import { createReplayMenu } from './ReplayMenu';
import { createSkipWidget, SkipHold } from './SkipHold';
import { createStartScreen } from './StartScreen';
import { TUTORIAL_STRINGS_EN } from './strings.en';
import { TutorialDirector, type DrillDef } from './TutorialDirector';
import { BEAT_IDS, type BeatId, type DirectorEvent, type DirectorPorts, type TickSample, type TutorialMode } from './types';

/** localStorage key recording that a run finished once ("Skip to Kettlewick" is then offered). */
export const COMPLETION_KEY = 'owg.tutorial.v1';
const LINE_MS = 5000;
/** Design section 2 beat minutes (39 in total; the skirmish replaces T06 to T11, about 5). */
const DESIGN_MINUTES: Record<BeatId, number> = {
  t01: 2, t02: 1, t03: 2.5, t04: 3.5, t05: 3, t06: 1.5, t07: 1.5, t08: 4, t09: 3, t10: 3, t11: 3, t12: 3, t13: 2, t14: 2.5, t15: 3.5,
  skirmish: 5,
};

/** Replay board drills (plan section 3; yard spawners added by this thread in spawnerDefs.ts). */
export const DRILLS: Record<string, DrillDef & { labelKey: string }> = {
  attacks: {
    id: 'attacks',
    labelKey: 'tutorial.replay.attacks',
    steps: [[{ kind: 'attacks', slots: [1, 2, 3, 4], chain: 4, window: 1.5 }]],
  },
  block: {
    id: 'block',
    labelKey: 'tutorial.replay.block',
    waves: [{ spawnerId: 'replay.blocker', moves: ['soldier.chop'], aggro: true }],
    steps: [[{ kind: 'count', event: 'blocked', count: 3 }], [{ kind: 'cleared', spawnerIds: ['replay.blocker'] }]],
  },
  dodge: {
    id: 'dodge',
    labelKey: 'tutorial.replay.dodge',
    waves: [{ spawnerId: 'replay.dodge', moves: ['wraith.sweep'], aggro: true }],
    steps: [[{ kind: 'count', event: 'dodged', count: 3 }], [{ kind: 'cleared', spawnerIds: ['replay.dodge'] }]],
  },
  lockon: {
    id: 'lockon',
    labelKey: 'tutorial.replay.lockon',
    waves: [{ spawnerId: 'replay.lockon', aggro: true }],
    steps: [[{ kind: 'lockSwap', kills: 2 }], [{ kind: 'cleared', spawnerIds: ['replay.lockon'] }]],
  },
};

function readCompletion(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(COMPLETION_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCompletion(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(COMPLETION_KEY, '1');
  } catch {
    // Storage blocked: the Kettlewick skip simply stays hidden.
  }
}

/** `?tutorial=full|veteran|kettlewick|t09`: skip the start screen (tests and smoke runs). */
export function tutorialFromQuery(search: string): { mode: TutorialMode; at?: BeatId } | null {
  const raw = new URLSearchParams(search).get('tutorial');
  // A valid `?act1=` jump (dev) finishes the tutorial itself from a Kettlewick start: no start screen.
  if (!raw) {
    const act1 = import.meta.env.DEV ? parseAct1(search) : null;
    return act1 && !('error' in act1) ? { mode: 'kettlewick' } : null;
  }
  if (raw === 'full' || raw === 'veteran' || raw === 'kettlewick') return { mode: raw };
  if ((BEAT_IDS as readonly string[]).includes(raw) && raw !== 'skirmish') return { mode: 'full', at: raw as BeatId };
  return null;
}

/** Yaw that puts the follow camera behind the player looking at (x, z) (ThirdPersonCamera offsets by sin/cos yaw). */
function shotToward(from: THREE.Vector3Like, to: { x: number; z: number }, pitch: number, seconds: number): CutsceneShot {
  return { yaw: Math.atan2(from.x - to.x, from.z - to.z), pitch, seconds };
}

const doc = (): Document | null => (typeof document === 'undefined' ? null : document);

/** Normalises the merged plugins' bus events into the director's events. */
function routeEvents(ctx: GameContext, send: (e: DirectorEvent) => void): void {
  const ev = ctx.events;
  const loose = <P>(type: string, fn: (p: P) => void) =>
    (ev as unknown as { on(t: string, f: (p: P) => void): () => void }).on(type, fn);
  ev.on('trigger.enter', (e) => {
    if (e.actorId === PLAYER_ID) send({ type: 'trigger', id: e.triggerId });
  });
  ev.on('actor.died', (e) =>
    send({ type: 'kill', actorId: e.actorId, kind: e.kind, spawnTag: e.spawnTag, byPlayer: e.killerId === PLAYER_ID }),
  );
  ev.on('mercy', (e) =>
    send({ type: 'mercy', actorId: e.actorId, creature: e.creature, spawnTag: e.actorId ? ctx.actors.get(e.actorId)?.spawnTag : undefined }),
  );
  ev.on('enemies.groupCleared', (e) => send({ type: 'groupCleared', spawnerId: e.spawnerId }));
  ev.on('player.blocked', () => send({ type: 'blocked' }));
  ev.on('player.parried', () => send({ type: 'blocked' }));
  ev.on('player.dodged', () => send({ type: 'dodged' }));
  ev.on('damage.dealt', (r) => {
    if (r.attackerId !== PLAYER_ID || r.dealt <= 0) return;
    const i = r.attackId ? ATTACK_SLOTS.indexOf(r.attackId) : -1;
    send({ type: 'hit', slot: (i >= 0 ? i + 1 : 0) as 0 | 1 | 2 | 3 | 4, targetId: r.targetId, killed: r.killed });
  });
  ev.on('lockon.changed', (e) => send({ type: 'lockon', targetId: e.targetId }));
  ev.on('inventory.equipped', (e) => send({ type: 'equipped', slot: e.slot, itemId: e.itemId }));
  ev.on('item.used', (e) => send({ type: 'itemUsed', itemId: e.itemId }));
  ev.on('quest.completed', (e) => send({ type: 'questCompleted', questId: e.questId }));
  ev.on('skill.learned', (e) => send({ type: 'learned', skillId: e.skillId }));
  ev.on('ability.used', (e) => send({ type: 'abilityUsed', skillId: e.skillId }));
  ev.on('skill.triggered', (e) => send({ type: 'skillTriggered', skillId: e.skillId }));
  ev.on('waystone.rekindled', (e) => send({ type: 'rekindled', waystoneId: e.waystoneId }));
  ev.on('fastTravel', (e) => send({ type: 'fastTravel', fromId: e.fromId, toId: e.toId }));
  ev.on('spell.released', (e) => {
    if (e.casterId === PLAYER_ID) send({ type: 'spellReleased', spellId: e.spellId });
  });
  ev.on('rest', (e) => {
    if (e.waystoneId) send({ type: 'rest', waystoneId: e.waystoneId });
  });
  ev.on('interact', (e) => {
    if (e.action === 'interact') send({ type: 'interact', id: e.interactableId });
  });
  loose<unknown>('tutorial.vow.complete', () => send({ type: 'vowComplete' }));
  ev.on('dialogue.ended', (e) =>
    send({ type: 'dialogueEnded', dialogueId: e.dialogueId, reason: e.reason }),
  );
  ev.on('ui.modal', (e) => send({ type: 'modal', id: e.id, open: e.open }));
}

/** Builds the director's ports over the merged services (every service optional). */
function makePorts(ctx: GameContext, ui: {
  cutscene: CutsceneDirector;
  line(key: string, slot: 'subtitle' | 'toast'): void;
}): { ports: DirectorPorts; dispose(): void } {
  const svc = ctx.services;
  const warned = new Set<string>();
  const warnOnce = (m: string) => {
    if (warned.has(m)) return;
    warned.add(m);
    console.warn(m);
  };
  const beatStart = new Map<BeatId, number>();
  let locksOff: (() => void) | null = null;
  let xpRelease: (() => void) | null = null;
  const anchorPos = (id: string) => ctx.anchors.find(id) ?? null;

  const ports: DirectorPorts = {
    state: {
      equipped: (slot) => svc.get('inventory')?.equipped(slot as never) ?? null,
      learned: (id) => svc.get('progression')?.learned(id) ?? false,
      isLit: (id) => svc.get('waystones')?.isLit(id) ?? false,
      flag: (key) => ctx.state.getBool(key) || (ctx.state.getString(key) !== ''),
      anchor: (id) => {
        const a = anchorPos(id);
        return a ? { x: a.position.x, y: a.position.y, z: a.position.z } : null;
      },
      questState: (id) => svc.get('quests')?.state(id) ?? 'inactive',
    },
    warn: warnOnce,
    now: () => ctx.clock.seconds,
    setFlag: (k, v) => ctx.state.setFlag(k, v),
    startQuest: (id) => void svc.get('quests')?.start(id),
    completeQuest: (id) => void svc.get('quests')?.complete(id),
    completeObjective: (q, o) => void svc.get('quests')?.completeObjective(q, o),
    startVow: () => svc.get('dialogue')?.start('t04-vow', 'aelfreda') ?? false,
    closeVow: () => svc.get('dialogue')?.close('skip'),
    vowOpen: () => svc.get('dialogue')?.active ?? false,
    teleport: (id) => {
      const a = anchorPos(id);
      if (!a) return warnOnce(`Tutorial: anchor ${id} is missing; no teleport`);
      ctx.player.teleport(a.position, a.yaw, { faceCamera: true });
    },
    placeNpc: (npc, anchor) => {
      const npcs = svc.get('npcs');
      if (npcs && !npcs.place(npc, anchor)) warnOnce(`Tutorial: could not place ${npc} at ${anchor}`);
    },
    spawn: (sp) => {
      const enemies = svc.get('enemies');
      if (!enemies) return [];
      return enemies.spawnGroup(sp.spawnerId, { moves: sp.moves, healthScale: sp.healthScale, aggro: sp.aggro });
    },
    despawn: (id) => svc.get('enemies')?.despawnGroup(id),
    resetGroup: (id) => svc.get('enemies')?.reset(id),
    alive: (id) => svc.get('enemies')?.alive(id).length ?? 0,
    playerInTrigger: (id) => ctx.triggers.isInside(id, PLAYER_ID),
    setLocks: (actions) => {
      locksOff?.();
      locksOff = actions.length > 0 ? ctx.player.addMoveModifier('tutorial.locks', { lockActions: actions as Action[] }) : null;
    },
    reArm: (n) => svc.get('combatVerbs')?.reArm(n),
    playerHealthFraction: () => {
      const a = ctx.player.actor;
      return a.maxHealth > 0 ? a.health / a.maxHealth : 1;
    },
    smokeHit: (f) => {
      const a = ctx.player.actor;
      if (a.dead) return;
      // Never lethal: at most down to 1 health.
      const amount = Math.min(a.maxHealth * f, a.health - 1);
      if (amount <= 0) return;
      ctx.damage.apply({ attackerId: null, targetId: a.id, amount, poise: 0, kind: 'script', unblockable: true });
    },
    healFull: () => {
      const a = ctx.player.actor;
      ctx.damage.heal(a.id, a.maxHealth);
    },
    fadeTeleport: async (id) => {
      const a = anchorPos(id);
      if (!a) {
        warnOnce(`Tutorial: anchor ${id} is missing; restart in place`);
        return;
      }
      const ws = svc.get('waystones');
      const outcome = ws ? await ws.safeTeleport(a.position, a.yaw) : null;
      // Busy or terrain not ready: never leave a restarted player where they fell.
      if (!outcome || !outcome.ok) ctx.player.teleport(a.position, a.yaw, { faceCamera: true });
    },
    holdKillXp: (on, reason = 'tutorial') => {
      // Pauses are not saved (Progression.ts), so a hold is always re-taken fresh.
      xpRelease?.();
      xpRelease = on ? (svc.get('progression')?.pauseKillXp(reason) ?? null) : null;
    },
    level: () => svc.get('progression')?.level ?? 1,
    grantLevelTwo: () => {
      const p = svc.get('progression');
      if (p && p.level < 2) p.grantXp(p.xpToNext(), 'tutorial.t13');
    },
    grantItems: (sourceId, items) => ctx.events.emit('loot.granted', { sourceId, items }),
    equip: (id) => void svc.get('inventory')?.equip(id),
    resetToStarterKit: () => svc.get('inventory')?.reset(STARTER_KIT),
    hasConsumable: () => {
      const inv = svc.get('inventory');
      return !inv || inv.count('healing-flask') + inv.count('hearth-bread') > 0;
    },
    rekindle: (id) => void svc.get('waystones')?.rekindle(id, 'script'),
    showPrompt: (p) => svc.get('prompts')?.show(p.mechanic as never, p.action as Action, p.textKey),
    promptCount: (m) => svc.get('prompts')?.count(m as never) ?? 0,
    hidePrompts: () => svc.get('prompts')?.hide(),
    showLine: (key) => ui.line(key, 'subtitle'),
    toast: (key) => ui.line(key, 'toast'),
    cutscene: (kind) => {
      const c = ui.cutscene;
      if (kind === null) return c.end();
      if (c.active === `tutorial.${kind}`) return;
      if (c.active) c.end();
      const feet = ctx.player.feet;
      const target = kind === 'knighting' ? anchorPos('chapel.altar') : null;
      const shot = target
        ? shotToward(feet, { x: target.position.x, z: target.position.z }, -0.15, 1.5)
        : { yaw: ctx.cameraRig?.yaw ?? 0, pitch: -0.05, seconds: 1 };
      c.start(`tutorial.${kind}`, shot);
    },
    crackEffects: () => {
      const vfx = svc.get('vfx');
      if (!vfx) return;
      const f = ctx.player.feet;
      vfx.shake(0.6, 1.5);
      vfx.pulseScreen(0.8, 1.2, 0xffc040);
      vfx.spawnEffect('ember-burst', { position: { x: f.x, y: f.y + 1, z: f.z } });
    },
    emitBeat: (beatId, state) => {
      if (state === 'started') beatStart.set(beatId, ctx.clock.seconds);
      else {
        // Timing check for the manual smoke (review recommendation 5): play time against the design's minutes.
        const began = beatStart.get(beatId);
        if (began !== undefined) {
          const minutes = (ctx.clock.seconds - began) / 60;
          console.info(`[tutorial] ${beatId} ${state} after ${minutes.toFixed(1)} min (design ${DESIGN_MINUTES[beatId]} min)`);
        }
      }
      ctx.events.emit('tutorial.beat', { beatId, state });
    },
    recordCompletion: writeCompletion,
  };
  return {
    ports,
    dispose: () => {
      xpRelease?.();
      xpRelease = null;
      locksOff?.();
      locksOff = null;
      svc.get('prompts')?.hide();
    },
  };
}

const tutorial: GamePlugin = {
  id: 'tutorial',
  dependsOn: ['core', 'quests'],
  setup(ctx) {
    ctx.strings.register('en', TUTORIAL_STRINGS_EN);
    for (const a of TUTORIAL_ANCHORS) {
      if (ctx.anchors.find(a.id)) continue;
      ctx.anchors.define({ id: a.id, position: { x: a.x, y: heightAt(a.x, a.z), z: a.z }, yaw: (a.yawDeg * Math.PI) / 180 });
    }
    const quests = ctx.services.get('quests');
    for (const def of TUTORIAL_QUESTS) if (!quests?.get(def.id)) quests?.register(def);

    const d = doc();
    const t = (key: string) => ctx.strings.t(key);
    const cutscene = new CutsceneDirector({
      emit: (name, payload) => ctx.events.emit(name, payload),
      pushContext: () => ctx.input.contexts.push('cutscene', 'tutorial'),
      freeze: () => ctx.player.addMoveModifier('tutorial.cutscene', { freeze: true }),
      hud: {
        mount: (slot, w) => ctx.hud.mount(slot, w),
        setVisible: (v) => ctx.hud.setVisible(v),
        get isVisible() {
          return ctx.hud.isVisible;
        },
      },
      rig: ctx.cameraRig,
      // Headless: a stub element, so the letterbox mounts and unmounts like the real one.
      doc: d ?? ({ createElement: () => ({ style: {}, className: '', appendChild() {}, remove() {} }) } as unknown as Document),
      warn: (m) => console.warn(m),
    });
    let lineSeq = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const line = (key: string, slot: 'subtitle' | 'toast') => {
      if (!d) return;
      const element = d.createElement('div');
      element.textContent = t(key);
      element.style.cssText = 'background:rgba(20,16,12,.8);color:#f3e6c8;padding:6px 12px;border-radius:4px;margin-bottom:6px;font:15px serif';
      const unmount = ctx.hud.mount(slot, { id: `tutorial.line.${++lineSeq}`, element });
      const timer = setTimeout(() => {
        timers.delete(timer);
        unmount();
      }, LINE_MS);
      timers.add(timer);
    };

    const wired = makePorts(ctx, { cutscene, line });
    const director = new TutorialDirector(wired.ports, {
      beats: BEATS,
      orders: { full: FULL_ORDER, veteran: VETERAN_ORDER, kettlewick: KETTLEWICK_ORDER },
      lockable: LOCKABLE_VERBS,
      createGoal,
    });
    routeEvents(ctx, (e) => director.onEvent(e));
    ctx.events.on('save.loaded', () => director.onSaveLoaded());
    ctx.persist.register({
      key: 'tutorial',
      version: 1,
      serialize: () => director.serialize(),
      load: (data) => director.load(data),
    });
    ctx.damage.addLethalHandler('tutorial-restart', (target) => target.id === ctx.player.actor.id && director.onLethal(), 0);

    // M01 carrying locks the Surge: tell the player at T15 how to put the villager down.
    ctx.events.on('carry.picked', () => {
      if (director.beat === 't15') line('tutorial.carry.drop', 'toast');
    });

    // T04 kneel.
    ctx.interaction.register({
      id: 'kneel:chapel',
      kind: 'kneel',
      holdSeconds: 1.5,
      promptKey: 'tutorial.kneel.prompt',
      radius: 2,
      position: (out) => {
        const a = ctx.anchors.find('chapel.kneel');
        return a ? out.set(a.position.x, a.position.y, a.position.z) : out.set(0, -1000, 0);
      },
      enabled: () => director.beat === 't04' && director.currentStep === 1 && !cutscene.active,
      onInteract: () => {},
    });

    // Replay board.
    let replayClose: (() => void) | null = null;
    ctx.interaction.register({
      id: 'use:replay-board',
      kind: 'use',
      promptKey: 'tutorial.board.prompt',
      radius: 2.5,
      position: (out) => {
        const a = ctx.anchors.find('yard.board');
        return a ? out.set(a.position.x, a.position.y, a.position.z) : out.set(0, -1000, 0);
      },
      enabled: () => director.complete,
      onInteract: () => {
        if (director.drillActive !== null) {
          director.cancelDrill();
          return;
        }
        if (!d || replayClose) return;
        const widget = createReplayMenu({
          doc: d,
          t,
          drills: Object.values(DRILLS).map((x) => ({ id: x.id, labelKey: x.labelKey })),
          onPick: (id) => {
            closeReplay();
            director.startDrill(DRILLS[id]);
          },
          onClose: () => closeReplay(),
        });
        replayClose = ctx.hud.openModal(widget);
      },
    });
    const closeReplay = () => {
      const c = replayClose;
      replayClose = null;
      c?.();
    };

    // Start screen (the first-launch extension of thread 6's Continue / New Game modal).
    const query = typeof window !== 'undefined' ? tutorialFromQuery(window.location.search) : null;
    let startClose: (() => void) | null = null;
    const saveReady = () => {
      const save = ctx.services.get('save');
      return !save || !save.loading;
    };
    const openStart = () => {
      if (query) {
        director.begin(query.mode, query.at);
        return;
      }
      if (!d) return;
      const prompts = ctx.services.get('prompts');
      const widget = createStartScreen({
        doc: d,
        t,
        canSkipToKettlewick: readCompletion(),
        hintsAlways: prompts?.showHintsAlways ?? false,
        onChoose: (mode) => {
          const c = startClose;
          startClose = null;
          c?.();
          director.begin(mode);
        },
        onHints: (on) => {
          if (prompts) prompts.showHintsAlways = on;
        },
      });
      startClose = ctx.hud.openModal(widget);
    };

    // Hold-Esc skip.
    const skip = new SkipHold();
    const skipUi = d ? createSkipWidget(d, t) : null;
    if (skipUi) ctx.hud.mount('center', skipUi.widget);
    const onLockChange = () => skip.onPointerLockChange(!!d?.pointerLockElement);
    d?.addEventListener('pointerlockchange', onLockChange);

    const fwd = new THREE.Vector3();
    ctx.systems.add({
      id: 'tutorial-skip',
      fixedPhase: 'input',
      order: 100,
      fixedUpdate: (dt) => {
        const modal = ctx.hud.modalOpen;
        const beatActive = director.beat !== null && !director.restartInFlight;
        const fire = skip.tick({
          menuDown: ctx.input.actions.down('menu'),
          menuPressed: ctx.input.actions.pressed('menu'),
          beatActive,
          modalOpen: modal !== null,
          allowModal: modal === 'dialogue' && director.beat === 't04',
          dt,
        });
        if (fire) director.skipCurrent();
      },
    });
    ctx.systems.add({
      id: 'tutorial-director',
      fixedPhase: 'rules',
      order: 300,
      fixedUpdate: (dt) => {
        if (!director.begun && !startClose && saveReady() && ctx.hud.modalOpen === null) openStart();
        const cam = ctx.camera;
        let camera: TickSample['camera'] = null;
        if (cam) {
          cam.getWorldDirection(fwd);
          camera = { position: { x: cam.position.x, y: cam.position.y, z: cam.position.z }, forward: { x: fwd.x, y: fwd.y, z: fwd.z } };
        }
        const f = ctx.player.feet;
        director.tick({
          dt,
          feet: { x: f.x, y: f.y, z: f.z },
          sprinting: ctx.input.actions.down('sprint') && ctx.player.moving,
          moving: ctx.player.moving,
          camera,
        });
      },
    });
    // Render `world` band 300..399 (tutorial, thread 9): after VFX and damage numbers, before the follow camera update.
    let pulse = 0;
    ctx.systems.add({
      id: 'tutorial-cutscene-camera',
      renderPhase: 'world',
      order: 300,
      render: (_alpha, frameTime) => {
        cutscene.render(frameTime);
        skipUi?.update(skip.progress, skip.hintVisible);
        // Pulse the T02 banner the player should look at.
        pulse += frameTime;
        const target = director.detail();
        for (const id of ['chapel.banner-1', 'chapel.banner-2', 'chapel.banner-3']) {
          const mesh = ctx.scene.getObjectByName(`banner:${id}`);
          if (mesh) mesh.scale.setScalar(id === target ? 1 + 0.15 * Math.sin(pulse * 6) : 1);
        }
      },
    });

    tutorialDispose = () => {
      director.dispose();
      cutscene.dispose();
      wired.dispose();
      d?.removeEventListener('pointerlockchange', onLockChange);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      closeReplay();
      const c = startClose;
      startClose = null;
      c?.();
    };
    (globalThis as { __tutorial?: TutorialDirector }).__tutorial = director;
  },
  dispose() {
    tutorialDispose?.();
    tutorialDispose = null;
    delete (globalThis as { __tutorial?: TutorialDirector }).__tutorial;
  },
};

let tutorialDispose: (() => void) | null = null;

export default tutorial;
