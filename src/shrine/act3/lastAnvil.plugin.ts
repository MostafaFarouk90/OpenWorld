import * as THREE from 'three';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import '../../codex/service';
import '../../hud/events';
import '../../quests/service';
import '../../waystones/service';
import { showToast } from '../../waystones/toast';
import { ForgeShrineBinding } from '../forgeShrine';
import { LastAnvilSteps, type AnvilStepId } from './lastAnvil';
import { LastAnvilVisuals } from './lastAnvil.visuals';
import './rubbings';
import { LAST_ANVIL_STRINGS_EN } from './strings.en';
import { LAST_ANVIL as A, rubbingFlag } from './tuning';

/**
 * The Last Anvil (K9 PR 1, design 7.5): M30's three steps (sweep, relight, sound), the rekindle through the shared
 * ForgeShrineBinding, the Rim Beacon flag and the six carved stones whose rubbings the `anvilRubbings` service holds.
 * Placed from K4's site anchor and carving anchors, resolved lazily; the stone stays locked until the anvil has sounded
 * (WAYSTONE_LOCKS).
 */
const lastAnvilPlugin: GamePlugin = {
  id: 'last-anvil',
  dependsOn: ['core', 'waystones', 'shrine', 'codex', 'anvil-rubbings'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', LAST_ANVIL_STRINGS_EN);
    const emit = ctx.events.emit.bind(ctx.events) as (type: string, payload: unknown) => void;
    const waystones = () => ctx.services.get('waystones');
    const lit = () => ctx.state.getBool(ForgeShrineBinding.flag(A.id));
    const toast = (key: string, params?: Record<string, string | number>) => showToast(ctx.hud, ctx.strings.t(key, params));
    const steps = new LastAnvilSteps({
      getBool: (k) => ctx.state.getBool(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      questState: (id) => ctx.services.get('quests')?.state(id),
    });

    const binding = new ForgeShrineBinding(A.id, {
      waystoneLit: () => waystones()?.isLit(A.id) ?? false,
      isLit: lit,
      setFlag: (k, v) => {
        ctx.state.setFlag(k, v);
        if (v) ctx.state.setFlag(A.rimBeaconFlag, true); // the restored flag only; the Act 5 link is not in Act 3
      },
      emitRekindled: (shrineId) => emit('shrine.rekindled', { shrineId }),
    });
    // A silent sync lights the shrine with no event: the quests must read their doneWhen again (as the Act 2 shrines do).
    const syncBinding = () => {
      if (binding.sync()) ctx.services.get('quests')?.recheck?.();
    };
    ctx.events.on('waystone.rekindled', (e) => binding.onRekindled(e.waystoneId));
    ctx.events.on('save.loaded', () => {
      syncBinding();
      steps.deriveOpen();
    });
    ctx.events.on('flag.changed', ({ key }) => {
      if (A.steps.some((s) => s.flag === key) || key === ForgeShrineBinding.flag(A.id)) steps.deriveOpen();
    });
    // A shrine flag set by a script or the ?act3= jump lights the stone (script rekindle: no Burn, no second announce).
    const syncStone = () => {
      if (lit() && !(waystones()?.isLit(A.id) ?? true)) waystones()?.rekindle(A.id, 'script');
    };

    // ---- the six rubbings ------------------------------------------------------------------------
    let offRubbings: (() => void) | null = null;
    const registerRubbings = () => {
      if (offRubbings) return;
      const svc = ctx.services.get('anvilRubbings');
      if (svc) offRubbings = svc.register(A.rubbingIds.map((id) => ({ id })));
    };
    const takeRubbing = (id: string) => {
      const svc = ctx.services.get('anvilRubbings');
      if (!svc || !svc.take(id)) return;
      if (svc.readable()) toast('rubbing.taken', { title: ctx.strings.t(`codex.lore.rubbing-${id}.name`) });
      else toast('rubbing.locked');
    };

    // ---- placement, once K4's site anchor exists ---------------------------------------------------
    const visuals = new LastAnvilVisuals();
    ctx.scene.add(visuals.root);
    ctx.scene.add(visuals.carvings);
    const offs: (() => void)[] = [];
    let warned = false;
    const at = (p: { x: number; y: number; z: number }) => (out: THREE.Vector3) => out.set(p.x, p.y, p.z);
    const place = () => {
      if (visuals.hasSite) return;
      const site = ctx.anchors.find(A.siteAnchor);
      if (!site) {
        if (!warned) {
          warned = true;
          console.info(`last-anvil: waiting for anchor "${A.siteAnchor}"`);
        }
        return;
      }
      const s = site.position;
      const off = (o: { x: number; z: number }) => ({ x: s.x + o.x, y: s.y, z: s.z + o.z });
      if (!ctx.anchors.find(A.waystoneAnchor)) {
        offs.push(ctx.anchors.define({ id: A.waystoneAnchor, position: off(A.waystoneOffset), yaw: 0, tags: ['waystone'] }));
      }
      visuals.build(s);
      syncBinding();
      for (const step of A.steps) {
        const pos = off(step.offset);
        offs.push(
          ctx.interaction.register({
            id: `use:last-anvil-${step.id}`,
            kind: 'use',
            position: at(pos),
            radius: A.radius,
            coneDegrees: 360,
            promptKey: `lastAnvil.${step.id}.prompt`,
            enabled: () => steps.canDo(step.id as AnvilStepId),
            onInteract: () => {
              if (steps.doStep(step.id as AnvilStepId)) toast(`lastAnvil.${step.id}.done`);
            },
          }),
        );
      }
    };

    // The carving anchors are K4's and may arrive after the site; each stone is placed as its own anchor appears.
    const placedCarvings = new Set<number>();
    const warnedCarvings = new Set<number>();
    const placeCarvings = () => {
      A.rubbingIds.forEach((id, i) => {
        const n = i + 1;
        if (placedCarvings.has(n)) return;
        const carving = ctx.anchors.find(A.carvingAnchor(n));
        if (!carving) {
          if (!warnedCarvings.has(n)) {
            warnedCarvings.add(n);
            console.info(`last-anvil: waiting for anchor "${A.carvingAnchor(n)}"`);
          }
          return;
        }
        placedCarvings.add(n);
        const p = carving.position;
        visuals.addCarving(n, p);
        offs.push(
          ctx.interaction.register({
            id: `use:anvil-rubbing-${n}`,
            kind: 'use',
            position: at(p),
            radius: A.radius,
            coneDegrees: 360,
            holdSeconds: A.rubbingHoldSeconds,
            promptKey: 'lastAnvil.rubbing.prompt',
            enabled: () => steps.questOpen() && !ctx.state.getBool(rubbingFlag(id)),
            onInteract: () => takeRubbing(id),
          }),
        );
      });
    };

    let first = true;
    ctx.systems.add({
      id: 'last-anvil.tick',
      fixedPhase: 'rules',
      order: 114,
      renderPhase: 'world',
      fixedUpdate() {
        if (first) {
          first = false;
          syncBinding();
        }
        registerRubbings();
        steps.deriveOpen();
        place();
        syncStone();
        placeCarvings();
        if (lit()) ctx.state.setFlag(A.rimBeaconFlag, true); // also for a shrine flag set by a script
        visuals.setLit(lit());
      },
      render(_alpha, frameTime) {
        visuals.update(frameTime);
      },
      dispose() {
        offRubbings?.();
        for (const off of offs.splice(0)) off();
        visuals.dispose();
      },
    });
  },
};

export default lastAnvilPlugin;
