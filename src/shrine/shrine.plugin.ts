import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import '../waystones/service';
import { showToast } from '../waystones/toast';
import { AdaptiveBeatClock } from './beat';
import { Cooled } from './cooled';
import { RespecFlow, type RespecDialog, type RespecProgression } from './respec';
import './service';
import { Shrine } from './shrine';
import { ShrineVisuals } from './shrine.visuals';
import { SHRINE_STRINGS_EN } from './strings.en';
import { SHRINE_TUNING } from './tuning';
import { WarmthTracker } from './warmth';
import { Wardstones, type StonePos } from './wardstones';

const T = SHRINE_TUNING;
const STONE_FLAG = (n: number): string => `world.deadroad.wardstone.${n}`;
const ALL_DONE_FLAG = 'world.deadroad.wardstones.done';
const REVEAL_SECONDS = 2.5;

interface MusicLike {
  beat?(): { beatSeconds: number; nextBeatTime: number } | null;
  toAudioTime?(performanceMs: number): number;
}

const shrinePlugin: GamePlugin = {
  id: 'shrine',
  dependsOn: ['core', 'waystones', 'spells', 'progression'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', SHRINE_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const progression = ctx.services.require('progression');
    const spells = () => ctx.services.get('spells');
    const waystones = () => ctx.services.get('waystones');
    const toast = (key: string, params?: Record<string, string | number>) => {
      showToast(ctx.hud, ctx.strings.t(key, params));
    };
    const warnOnce = new Set<string>();
    const warn = (m: string) => {
      if (warnOnce.has(m)) return;
      warnOnce.add(m);
      console.warn(`shrine: ${m}`);
    };

    // ---- Warmth Tier --------------------------------------------------------------------------
    // A counter over `shrine.*` flags, so it listens to `flag.changed` and `save.loaded` itself
    // (what FlagGates does for a boolean test). The enemies service is read on demand.
    const warmth = new WarmthTracker({
      isLit: (k) => ctx.state.getBool(k),
      emitChanged: (tier, previous) => emit('warmth.changed', { tier, previous }),
      setEnemyTier: (t) => (ctx.services.get('enemies') as { setWarmthTier?(w: number): void } | undefined)?.setWarmthTier?.(t),
    });

    // ---- Cooled -------------------------------------------------------------------------------
    const cooled = new Cooled({
      addMaxHealthModifier: (id, fn) => progression.addMaxHealthModifier(id, fn),
      refreshMaxHealth: () => progression.refreshMaxHealth(),
      emitApplied: (seconds) => emit('buff.applied', { id: T.cooled.buffId, nameKey: T.cooled.nameKey, seconds }),
      emitRemoved: () => emit('buff.removed', { id: T.cooled.buffId }),
    });
    let savedHealth: number | null = null;
    ctx.persist.register({
      key: Cooled.key,
      version: Cooled.version,
      serialize: () => cooled.serialize(ctx.actors.player.health),
      load: (data) => {
        savedHealth = cooled.load(data);
      },
    });

    // ---- Shrine rules -------------------------------------------------------------------------
    const shrineLit = () => ctx.state.getBool('shrine.quenchstone.lit');
    let revealLeft = 0;
    let revealRelease: (() => void) | null = null;
    let unfreeze: (() => void) | null = null;
    const endReveal = () => {
      revealLeft = 0;
      revealRelease?.();
      unfreeze?.();
      revealRelease = unfreeze = null;
    };
    const shrine = new Shrine(
      {
        setFlag: (k, v) => ctx.state.setFlag(k, v),
        emitRekindled: (shrineId) => emit('shrine.rekindled', { shrineId }),
        topUpHealth: () => {
          progression.refreshMaxHealth();
          const a = ctx.actors.player;
          ctx.damage.heal(a.id, a.maxHealth);
        },
        heal: (n) => {
          const a = ctx.actors.player;
          if (!a.dead && a.health < a.maxHealth) ctx.damage.heal(a.id, n);
        },
        maxHealth: () => ctx.actors.player.maxHealth,
        burn: () => spells()?.burn ?? 0,
        clearBurn: (r) => spells()?.clearBurn(r),
        reveal: () => {
          const basin = ctx.anchors.find(T.basin.anchorId);
          if (!basin || !ctx.cameraRig || revealRelease) return;
          const c = ctx.cameraRig;
          revealRelease = c.override({
            position: { x: basin.position.x + 7, y: basin.position.y + 4, z: basin.position.z + 7 },
            lookAt: { x: basin.position.x, y: basin.position.y + 2.4, z: basin.position.z },
            blendIn: 0.6,
            blendOut: 0.8,
          }).release;
          unfreeze = ctx.player.addMoveModifier('shrine.reveal', { freeze: true });
          revealLeft = REVEAL_SECONDS;
        },
      },
      cooled,
    );
    ctx.events.on('waystone.rekindled', (e) => {
      if (e.waystoneId !== 'quenchstone') return;
      if (e.cause === 'player') shrine.onRekindled();
      else {
        // A scripted rekindle (the M05 effect) lights the shrine without the reveal.
        ctx.state.setFlag('shrine.quenchstone.lit', true);
        emit('shrine.rekindled', { shrineId: 'quenchstone' });
      }
    });
    ctx.events.on('rest', (e) => {
      if (e.waystoneId === 'quenchstone') shrine.onRest();
    });

    // ---- Respec -------------------------------------------------------------------------------
    let simTime = 0;
    const lecternPos = (): { x: number; y: number; z: number } | null => {
      const a = ctx.anchors.find(T.basin.anchorId);
      return a ? { x: a.position.x + T.respec.offsetX, y: a.position.y, z: a.position.z } : null;
    };
    const respec = new RespecFlow({
      progression: () => progression as unknown as Partial<RespecProgression>,
      dialog: () => ctx.services.get('respecDialog' as never) as RespecDialog | undefined,
      lit: shrineLit,
      inCombat: () => waystones()?.hostileAggro ?? false,
      now: () => simTime,
      distanceToLectern: () => {
        const p = lecternPos();
        return p ? Math.hypot(ctx.player.feet.x - p.x, ctx.player.feet.z - p.z) : Infinity;
      },
      toast,
    });
    let respecOff: (() => void) | null = null;
    const syncLectern = () => {
      if (respecOff) return;
      const p = lecternPos();
      if (!p) return;
      respecOff = ctx.interaction.register({
        id: 'use:quenchstone-respec',
        kind: 'use',
        position: (out: THREE.Vector3) => out.set(p.x, p.y, p.z),
        radius: T.respec.radius,
        coneDegrees: 360,
        promptKey: 'shrine.respec.prompt',
        enabled: shrineLit,
        onInteract: () => void respec.interact(),
      });
    };

    // ---- Wardstones ---------------------------------------------------------------------------
    const music = () => ctx.services.get('music' as never) as MusicLike | undefined;
    const clock = new AdaptiveBeatClock({
      beat: () => music()?.beat?.(),
      toAudioTime: (ms) => music()?.toAudioTime?.(ms),
      nowMs: () => performance.now(),
    });
    const stonePositions = (): StonePos[] => {
      const out: StonePos[] = [];
      for (let n = 1; n <= T.wardstones.count; n++) {
        const a = ctx.anchors.find(`wardstone.${n}`);
        if (a) out.push({ index: n, x: a.position.x, z: a.position.z });
      }
      return out;
    };
    const audio = () => ctx.services.get('audio' as never) as { play(key: string): unknown } | undefined;
    const wardstones = new Wardstones({
      clock,
      stones: stonePositions,
      player: () => ({ x: ctx.player.feet.x, z: ctx.player.feet.z, yaw: ctx.player.facingYaw }),
      isStruck: (n) => ctx.state.getBool(STONE_FLAG(n)),
      setStruck: (n, on) => ctx.state.setFlag(STONE_FLAG(n), on),
      setAllDone: () => ctx.state.setFlag(ALL_DONE_FLAG, true),
      emitStruck: (index, errorMs) => emit('wardstone.struck', { index, errorMs }),
      emitMissed: (index, reason) => emit('wardstone.missed', { index, reason }),
      emitComplete: () => emit('wardstones.complete', {}),
      play: (key) => {
        try {
          audio()?.play(key);
        } catch {
          warn(`sound "${key}" is not registered`);
        }
      },
    });
    // M05 starts the rhythm: before Tobb joins, the stones ignore the player.
    let rhythmOpen = false;
    ctx.gates.watch(
      (s) => s.getBool('story.m05.tobbJoined'),
      (open) => {
        rhythmOpen = open;
        if (!open) wardstones.reset();
      },
      { keys: ['story.m05.tobbJoined'] },
    );

    // ---- Visuals and the tick -----------------------------------------------------------------
    const visuals = new ShrineVisuals();
    ctx.scene.add(visuals.root);
    const syncVisuals = () => {
      const basin = ctx.anchors.find(T.basin.anchorId);
      if (basin && !visuals.hasBasin) visuals.buildBasin(basin.position);
      for (const s of stonePositions()) {
        if (!visuals.hasStone(s.index)) {
          const a = ctx.anchors.find(`wardstone.${s.index}`)!;
          visuals.buildStone(s.index, a.position);
        }
      }
      visuals.setLit(shrineLit());
    };

    ctx.events.on('flag.changed', ({ key }) => {
      if (key.startsWith('shrine.') && key.endsWith('.lit')) warmth.recompute('flag');
    });
    ctx.events.on('save.loaded', () => {
      warmth.recompute('load');
      progression.refreshMaxHealth();
      if (savedHealth !== null) {
        const a = ctx.actors.player;
        // Burn.load can clamp health before Cooled returns; the saved value wins when it is higher.
        if (savedHealth > a.health && !a.dead) ctx.damage.heal(a.id, Math.min(savedHealth, a.maxHealth) - a.health);
        savedHealth = null;
      }
      wardstones.reset();
      respec.close();
      endReveal();
      cooled.announce();
    });
    ctx.events.on('ui.modal', (e) => {
      if (e.open) wardstones.reset();
    });

    ctx.services.provide('warmth', { tier: () => warmth.tier() });
    ctx.services.provide('shrine', {
      cooledSeconds: () => cooled.secondsLeft(),
      nextWardstone: () => wardstones.nextIndex(),
    });

    ctx.systems.add({
      id: 'shrine.tick',
      fixedPhase: 'rules',
      order: 110,
      fixedUpdate(dt) {
        simTime += dt;
        syncVisuals();
        syncLectern();
        cooled.update(dt);
        respec.update();
        if (revealLeft > 0 && (revealLeft -= dt) <= 0) endReveal();

        const alive = !ctx.player.actor.dead;
        const hostile = waystones()?.hostileAggro ?? false;
        shrine.basinTick(dt, alive && shrineLit() && !hostile && ctx.triggers.isInside(T.basin.triggerId));

        const now = performance.now();
        const playing = ctx.input.contexts.top() === 'gameplay' && alive;
        if (rhythmOpen && playing && wardstones.nextIndex() !== null) {
          wardstones.update(now);
          if (ctx.input.actions.pressed('attack1')) {
            const stamped = (ctx.input as unknown as { pressedAtMs?(a: string): number | undefined }).pressedAtMs?.('attack1');
            wardstones.strike(stamped ?? now);
          }
        }
        for (const s of stonePositions()) visuals.setStone(s.index, ctx.state.getBool(STONE_FLAG(s.index)), wardstones.progress(s.index));
        const next = rhythmOpen ? wardstones.nextIndex() : null;
        const at = clock.locate(now);
        visuals.setPip(next, Math.max(0, 1 - Math.abs(at.errorMs) / 160));
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {},
    });
  },
};

export default shrinePlugin;
