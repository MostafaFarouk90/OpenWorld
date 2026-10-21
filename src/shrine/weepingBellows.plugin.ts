import * as THREE from 'three';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import '../puzzles/service';
import { PuzzleController, type PuzzlePhase } from '../puzzles/PuzzleController';
import { valveInteractable } from '../puzzles/ValveWheel';
import '../waystones/service';
import { showToast } from '../waystones/toast';
import { BellowsBlessing } from './bellowsBlessing';
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
      // The stone is A4's; if its anchor is not there yet the shrine still lights.
      if (!waystones()?.rekindle(B.waystoneId, 'script').ok) binding.lightNow();
      blessing.apply();
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
      binding.sync();
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
    const visuals = new BellowsVisuals();
    ctx.scene.add(visuals.root);
    const offs: (() => void)[] = [];
    let placed = false;
    const place = () => {
      if (placed) return;
      const c = ctx.anchors.find(B.centerAnchor);
      if (!c) return;
      placed = true;
      const layout = bellowsLayout(c.position);
      brazierPos = layout.braziers;
      visuals.build(c.position, layout);
      controller.wheels.forEach((w, i) => {
        const p = layout.valves[i];
        offs.push(
          ctx.interaction.register(
            valveInteractable(w, (out: THREE.Vector3) => out.set(p.x, p.y + 1, p.z), { radius: B.interactRadius, enabled: () => !solved() }),
          ),
        );
      });
      const pl = layout.plaque;
      offs.push(
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
          },
        }),
      );
      rederive();
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
          binding.sync();
        }
        place();
        controller.update(dt);
        blessing.update(dt);
        const remaining = controller.timer.remaining();
        visuals.set(controller.routing(), controller.braziers.litIndices(), controller.timer.active ? remaining / controller.timer.total : 0);
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {
        for (const off of offs.splice(0)) off();
        offPuzzle();
        offModifier();
        visuals.dispose();
      },
    });
  },
};

export default weepingBellowsPlugin;
