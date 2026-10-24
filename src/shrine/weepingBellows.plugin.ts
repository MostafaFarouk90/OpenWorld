import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import '../puzzles/service';
import { PuzzleController, type PuzzlePhase } from '../puzzles/PuzzleController';
import { valveInteractable } from '../puzzles/ValveWheel';
import '../waystones/service';
import { showToast } from '../waystones/toast';
import { BellowsBlessing } from './bellowsBlessing';
import { devBellowsCenter, devBellowsRequested, parseBellows } from './bellowsDevHook';
import { ForgeShrineBinding } from './forgeShrine';
import { BELLOWS as B, BLESSING, initialRouting } from './weepingBellows.tuning';
import { BELLOWS_STRINGS_EN } from './weepingBellows.strings.en';
import { BellowsVisuals, bellowsLayout } from './weepingBellows.visuals';

/**
 * The Weeping Bellows (design 7.2, Act 2 A9): six valves routed to match the plaque against a 45 s clock, then the
 * Surge lights six braziers in order. The cavern is A4's; every part is placed from its centre anchor, resolved lazily.
 * Solving opens the Lower Galleries shortcut flag, lights the shrine (W 3) and grants the Bellows Blessing.
 */
const weepingBellowsPlugin: GamePlugin = {
  id: 'weeping-bellows',
  dependsOn: ['core', 'waystones', 'shrine', 'puzzles'],
  setup(ctx) {
    ctx.strings.register('en', BELLOWS_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const toast = (key: string, params?: Record<string, string | number>) => showToast(ctx.hud, ctx.strings.t(key, params));
    const solved = () => ctx.state.getBool(B.solvedFlag);
    const waystones = () => ctx.services.get('waystones');

    // ---- the shrine flag and the Blessing -------------------------------------------------------
    const binding = new ForgeShrineBinding(B.shrineId, {
      waystoneLit: () => waystones()?.isLit(B.waystoneId) ?? false,
      isLit: () => ctx.state.getBool(ForgeShrineBinding.flag(B.shrineId)),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      emitRekindled: (shrineId) => emit('shrine.rekindled', { shrineId }),
      canLight: solved,
    });
    ctx.events.on('waystone.rekindled', (e) => binding.onRekindled(e.waystoneId));

    const blessing = new BellowsBlessing({
      emitApplied: (seconds) => emit('buff.applied', { id: BLESSING.buffId, nameKey: BLESSING.nameKey, seconds }),
      emitRemoved: () => emit('buff.removed', { id: BLESSING.buffId }),
    });
    ctx.persist.register({
      key: BellowsBlessing.key,
      version: BellowsBlessing.version,
      serialize: () => blessing.serialize(),
      load: (data) => {
        blessingLoaded = true;
        blessing.load(data);
      },
    });
    let blessingLoaded = false;
    const offModifier = ctx.damage.addModifier(
      'shrine.bellows-blessing',
      (req, target) => {
        if (target.id === ctx.player.actor.id) blessing.modify(req);
      },
      BLESSING.modifierOrder,
    );
    ctx.services.provide('bellowsBlessing', { active: () => blessing.active(), secondsLeft: () => blessing.secondsLeft() });

    // ---- the puzzle -----------------------------------------------------------------------------
    const controller = new PuzzleController(
      { id: B.puzzleId, plaque: B.plaque, positions: B.positions, initial: initialRouting(), order: B.order, valvePrefix: B.valvePrefix },
      {
        emitState: (id, phase) => {
          emit('puzzle.state', { id, phase });
          announce(phase);
        },
        emitFailed: (id) => emit('puzzle.failed', { id }),
        emitSolved: (id) => {
          emit('puzzle.solved', { id });
          onSolved();
        },
      },
    );
    const announce = (phase: PuzzlePhase) => {
      if (phase === 'pressure') toast('bellows.pressure');
      else if (phase === 'lighting') toast('bellows.routed');
      else if (phase === 'failed') toast('bellows.failed');
    };
    const offPuzzle = ctx.services.require('puzzles').register(B.puzzleId, { timer: controller.timer, onAbort: () => controller.abort() });
    const onSolved = () => {
      ctx.state.setFlag(B.solvedFlag, true);
      ctx.state.setFlag(B.shortcutFlag, true);
      // Everything the solve sets is written before the rekindle: it requests a save, and that file must carry the Blessing and
      // the shrine flag (a one-time grant lost to a closed tab; review R2-1). The rekindle's event then finds the shrine lit.
      blessing.apply();
      binding.lightNow();
      // The stone is A4's; if its anchor is not there yet the shrine is lit all the same.
      waystones()?.rekindle(B.waystoneId, 'script');
      toast('bellows.solved');
    };
    const rederive = () => {
      if (solved()) controller.restoreSolved();
      else controller.clearSolved();
    };
    ctx.events.on('save.loaded', () => {
      if (!blessingLoaded) blessing.load(null);
      blessingLoaded = false;
      rederive();
      // The quests' own save.loaded recheck ran before this handler, and the flag is set without an event: read the
      // `doneWhen` again (M18's rekindle) or the objective stays open for good (review R2-2).
      if (binding.sync()) ctx.services.get('quests')?.recheck?.();
      blessing.announce();
    });

    // ---- the Surge lights braziers --------------------------------------------------------------
    let brazierPos: { x: number; y: number; z: number }[] = [];
    ctx.events.on('spell.released', (e) => {
      if (e.spellId !== B.surgeSpellId || e.casterId !== ctx.player.actor.id || !brazierPos.length) return;
      if (controller.phase() !== 'lighting') return;
      const f = ctx.player.feet;
      let best = -1;
      let bestD: number = B.surgeRange;
      brazierPos.forEach((p, i) => {
        const d = Math.hypot(p.x - f.x, p.z - f.z);
        if (d <= bestD) {
          bestD = d;
          best = i;
        }
      });
      if (best < 0) return;
      const r = controller.light(best);
      if (r === 'wrong') toast('bellows.wrong');
      else if (r === 'ok') toast('bellows.lit');
    });

    // ---- placement from A4's centre anchor -------------------------------------------------------
    let visuals = new BellowsVisuals();
    ctx.scene.add(visuals.root);
    /** What the current site registered (valves, plaque, the stand-in anchor): dropped when the site moves. */
    const siteOffs: (() => void)[] = [];
    let site: 'none' | 'dev' | 'real' = 'none';
    const search = (globalThis as { location?: { search?: string } }).location?.search;
    // `?bellows=1&new`, dev builds only (review-b M1). The fresh game's saves are held for the session, as `?act1=` does.
    // The hold is taken on the first tick: the save plugin is not a dependency (it may set up after this one), and saves stay
    // locked until its boot decision, which comes after a tick.
    const devHook = devBellowsRequested(search);
    let saveHeld = !devHook;
    if (!devHook && import.meta.env.DEV) {
      const parsed = parseBellows(search);
      if (parsed && 'error' in parsed) console.warn(`[bellows] dev hook refused: ${parsed.error}`);
    }
    const holdSaves = () => {
      if (saveHeld) return;
      saveHeld = true;
      // Never released, as `?act1=` does: the save plugin's dispose clears its holds without saving.
      ctx.services.get('save')?.suspend('bellows-dev');
    };
    const build = (center: { x: number; y: number; z: number }) => {
      const layout = bellowsLayout(center);
      brazierPos = layout.braziers;
      visuals.build(center, layout);
      controller.wheels.forEach((w, i) => {
        const p = layout.valves[i];
        siteOffs.push(
          ctx.interaction.register(
            valveInteractable(w, (out: THREE.Vector3) => out.set(p.x, p.y + 1, p.z), { radius: B.interactRadius, enabled: () => !solved() }),
          ),
        );
      });
      const pl = layout.plaque;
      siteOffs.push(
        ctx.interaction.register({
          id: 'use:bellows-plaque',
          kind: 'use',
          position: (out: THREE.Vector3) => out.set(pl.x, pl.y + 1, pl.z),
          radius: B.interactRadius + 1,
          coneDegrees: 360,
          promptKey: 'bellows.plaque.prompt',
          onInteract: () => {
            ctx.state.setFlag(B.plaqueFlag, true);
            toast('bellows.plaque.read', { marks: B.plaque.map((p) => p + 1).join(' '), order: B.order.map((i) => i + 1).join(' ') });
            toast('bellows.pike.hint');
          },
        }),
      );
      rederive();
    };
    /** Takes the stand-in site down (A4's real anchor appeared): a run in progress there is aborted. */
    const unplace = () => {
      for (const off of siteOffs.splice(0)) off();
      controller.abort();
      visuals.dispose();
      visuals = new BellowsVisuals();
      ctx.scene.add(visuals.root);
      brazierPos = [];
      site = 'none';
    };
    const place = () => {
      if (site === 'real') return;
      const real = ctx.anchors.find(B.centerAnchor);
      if (real) {
        // A4's own cavern anchor always wins, also over a stand-in placed before it existed (review-b L3).
        if (site === 'dev') unplace();
        build(real.position);
        site = 'real';
        return;
      }
      if (site === 'dev' || !devHook) return;
      // The stand-in centre, under its own id so A4's real anchor can still be defined later without a duplicate throw.
      const stone = ctx.anchors.find(`waystone.${B.waystoneId}`)?.position;
      siteOffs.push(ctx.anchors.define({ id: B.devCenterAnchor, position: devBellowsCenter(stone, ctx.player.feet), yaw: 0 }));
      const c = ctx.anchors.find(B.devCenterAnchor);
      if (!c) return;
      build(c.position);
      site = 'dev';
    };

    let first = true;
    ctx.systems.add({
      id: 'weeping-bellows.tick',
      fixedPhase: 'rules',
      order: 113,
      renderPhase: 'world',
      fixedUpdate(dt) {
        if (first) {
          first = false;
          if (binding.sync()) ctx.services.get('quests')?.recheck?.();
          holdSaves();
        }
        place();
        // A4's real cavern floats 150 m above the ground: its puzzle must not show in the sky from outdoors or other mines. The
        // ?bellows=1 stand-in sits on the surface, so it stays visible.
        visuals.root.visible = site !== 'real' || ctx.services.get('interiors')?.current === 'mine-weeping-bellows';
        controller.update(dt);
        blessing.update(dt);
        const remaining = controller.timer.remaining();
        visuals.set(controller.routing(), controller.braziers.litIndices(), controller.timer.active ? remaining / controller.timer.total : 0);
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {
        for (const off of siteOffs.splice(0)) off();
        offPuzzle();
        offModifier();
        visuals.dispose();
      },
    });
  },
};

export default weepingBellowsPlugin;
