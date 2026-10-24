// `?act3=<quest>&new&order=greyfen|spine`: dev and smoke jumps into Act 3 on flag injection (ids, order semantics and rules in
// act3Jump.ts); Act 1 and Act 2 are replayed with both endings silenced. Optional `&class=<id>` picks the M07 class.
// Compiled out of production builds (import.meta.env.DEV). K16's deterministic fixtures build on this plumbing.
import type { GamePlugin } from '../core/plugins';
import { createEffectRunner } from './effects';
import { Act3Jump, parseAct3 } from './act3Jump';
import type { BusPort } from './ports';
import type { TutorialDirector } from '../tutorial/TutorialDirector';
import '../region/containment';
import { heightAt } from '../terrain/heightfield';

const TELEPORT_TRIES = 30;

const plugin: GamePlugin = {
  id: 'act3-jump',
  dependsOn: ['core', 'quests', 'save', 'waystones'],
  setup(ctx) {
    if (!import.meta.env.DEV) return;
    const search = typeof location !== 'undefined' ? location.search : '';
    const parsed = parseAct3(search);
    if (!parsed) return;
    if ('error' in parsed) {
      console.warn(`[act3] jump refused: ${parsed.error}`);
      return;
    }
    const svc = (n: string) => (ctx.services as unknown as { get(n: string): any }).get(n);
    const save = ctx.services.get('save');
    // Held for the session: a jumped game is never saved over the player's real save.
    // Never released: releasing would run the save deferred under the hold. The save plugin's dispose clears its
    // holds without saving.
    save?.suspend('act3-jump');
    const quests = ctx.services.require('quests');
    const runner = createEffectRunner({
      state: ctx.state, quests: quests as never, bus: ctx.events as unknown as BusPort, sourceId: 'act3-jump',
      progression: () => svc('progression'), inventory: () => svc('inventory'), npcs: () => svc('npcs'), enemies: () => svc('enemies'),
      warn: (m) => console.warn(`[act3] ${m}`),
    });
    let teleport: 'idle' | 'pending' | 'ok' = 'idle';
    let teleportTries = 0;
    // One safe teleport in flight at a time; a refused one (busy, terrain loading) is retried on a later tick, and
    // after TELEPORT_TRIES refusals the player is placed directly, as the tutorial's restart does.
    const place = (pos: { x: number; y: number; z: number }, yaw: number): boolean => {
      if (teleport === 'ok') return true;
      if (teleport === 'pending') return false;
      const ws = ctx.services.get('waystones');
      if (!ws || ++teleportTries > TELEPORT_TRIES) {
        // safeTeleport contains its target itself (v0.6); the direct placement goes through the same clamp.
        const at = ctx.services.get('containment')?.clamp(pos) ?? pos;
        ctx.player.teleport(at === pos ? pos : { ...at, y: heightAt(at.x, at.z) + 0.05 }, yaw);
        if (ctx.cameraRig) ctx.cameraRig.yaw = yaw;
        return true;
      }
      teleport = 'pending';
      void ws.safeTeleport(pos, yaw).then(
        (o) => { teleport = o.ok ? 'ok' : 'idle'; },
        () => { teleport = 'idle'; },
      );
      return false;
    };
    const enemies = () => svc('enemies') as { blockPreview?(b: string): number | undefined; lockBlockLevel?(b: string, l: number): number | undefined } | undefined;
    const jump = new Act3Jump(parsed.id, parsed.order, {
      tutorial: () => (globalThis as { __tutorial?: TutorialDirector }).__tutorial,
      quests,
      runEffects: (effects) => {
        for (const r of runner.run(effects)) if (!r.ok) console.warn(`[act3] effect failed: ${r.error ?? ''}`);
      },
      setFlag: (flag, value) => ctx.state.setFlag(flag, value),
      rekindle: (id) => void svc('waystones')?.rekindle(id, 'script'),
      giveGold: (amount) => {
        for (const r of runner.run([{ giveGold: amount }])) if (!r.ok) console.warn(`[act3] gold grant failed: ${r.error ?? ''}`);
      },
      chooseClass: (id) => {
        const classes = svc('classes');
        if (!classes) return false;
        const r = classes.choose(id);
        if (!r.ok) return false;
        classes.skipDrill?.();
        return true;
      },
      teleportTo: (anchorId) => {
        const a = ctx.anchors.find(anchorId);
        if (!a) {
          console.warn(`[act3] anchor ${anchorId} missing; staying put`);
          return true;
        }
        return place(a.position, a.yaw);
      },
      // Act 1 and Act 2 givers are never stood by in an Act 3 jump; the replay only completes their quests.
      standBy: () => true,
      placeAt: ({ x, z }) => place({ x, y: heightAt(x, z) + 0.05, z }, 0),
      lockBlock: (block) => {
        const e = enemies();
        const level = e?.blockPreview?.(block);
        if (level === undefined) {
          console.warn(`[act3] block ${block} not locked: no preview yet`);
          return;
        }
        e?.lockBlockLevel?.(block, level);
      },
      topUpXp: (total) => {
        const prog = ctx.services.get('progression');
        if (prog && prog.xp < total) prog.grantXp(total - prog.xp, 'act3-jump');
      },
      hasQuest: (id) => quests.objectives(id).length > 0,
      closeDialogue: () => {
        const d = ctx.services.get('dialogue');
        if (!d?.active) return false;
        d.close();
        return true;
      },
      ready: () => !save || !save.loading,
      warn: (m) => console.warn(`[act3] ${m}`),
    }, parsed.classId);
    (globalThis as { __act3?: Act3Jump }).__act3 = jump;
    ctx.systems.add({
      id: 'act3-jump',
      fixedPhase: 'rules',
      order: 900,
      fixedUpdate: () => jump.tick(),
    });
  },
  dispose() {
    delete (globalThis as { __act3?: unknown }).__act3;
  },
};

export default plugin;
