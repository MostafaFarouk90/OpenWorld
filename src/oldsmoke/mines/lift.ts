// The Deepgate lift (plan section 11, ruling 1): a stop menu that rides at black through the interiors service, no Rapier
// platform. Riding is exit then enter, so a save inside a mine loads in that mine (the interior persistable restores it) and
// nothing here persists. Surface interactable at `oldsmoke.shaft.lift.top`, one `.call` interactable per mine landing.
import * as THREE from 'three';
import { InteriorError } from '../../interiors/InteriorController';
import type { InteriorsService } from '../../interiors/service';
import type { ConditionEnv } from '../../quests/ports';
import type { CoreContext } from '../../region/coreTypes';
import { heightAt } from '../../terrain/heightfield';
import { showToast } from '../../waystones/toast';
import type { ModelLibrary } from '../../assets/swap/ModelLibrary';
import { buildLiftCage, upgradeLiftCage } from '../oldsmokeArt';
import { SHAFT } from '../sites';
import { MINE_LANDINGS, type MineId } from './kit';
import { LIFT_ARRIVE_SOUND, LIFT_CALL_SOUND, LIFT_CUE_KEYS, LIFT_REFUSE_SOUND, makeLiftCuePlayer, makeLiftRidePlayer, type LiftAudio } from './liftSound';
import { openLiftMenu, type LiftMenuRow } from './liftMenu';
import { availableStops, LIFT_ARMED_FLAG, LIFT_STOPS, stopOfInterior, type LiftStop } from './liftStops';

export const SURFACE_LIFT_ANCHOR = 'oldsmoke.shaft.lift.top';
const MINES = Object.keys(MINE_LANDINGS) as MineId[];

export { MINE_DOOR_LOCKS } from './kit';

export const LIFT_STRINGS_EN: Record<string, string> = {
  'oldsmoke.lift.use': '{key} Use the lift',
  'oldsmoke.lift.dead': '{key} The lift is dead',
  'oldsmoke.lift.menu.title': 'The Deepgate lift',
  'oldsmoke.lift.menu.hint': 'Up and down to choose, Enter to ride, Esc to close',
  'oldsmoke.lift.stop.surface': 'The surface',
  'oldsmoke.lift.stop.shaft': 'The shaft',
  'oldsmoke.lift.stop.old': 'The Old Galleries',
  'oldsmoke.lift.stop.lower': 'The Lower Galleries',
  'oldsmoke.lift.stop.bellows': 'The Weeping Bellows',
  'oldsmoke.lift.stop.deepdelve': 'The Deepdelve',
  'oldsmoke.lift.locked.surface': 'always open',
  'oldsmoke.lift.locked.shaft': 'the lift is dead',
  'oldsmoke.lift.locked.old': 'the winch must be mended first',
  // Once the winch is mended the lock is about the errand, not the winch.
  'oldsmoke.lift.locked.shaft.mended': 'not yet reached',
  'oldsmoke.lift.locked.old.mended': 'not yet reached',
  'oldsmoke.lift.locked.lower': 'not yet reached',
  'oldsmoke.lift.locked.bellows': 'not yet reached',
  'oldsmoke.lift.locked.deepdelve': 'the way is not open',
  'oldsmoke.lift.shudder': 'The cage shudders',
  'oldsmoke.lift.refused.aggro': 'You cannot ride while enemies are on you',
  'oldsmoke.lift.refused.busy': 'The lift is still moving',
  'oldsmoke.lift.refused.locked': 'The lift will not go there',
  'oldsmoke.lift.refused.other': 'The lift jams',
};

export type LiftCtx = Pick<CoreContext, 'anchors' | 'interaction' | 'events' | 'state' | 'strings' | 'services' | 'scene' | 'hud' | 'systems' | 'input'>;

export interface LiftOptions {
  heightAt?: (x: number, z: number) => number;
  /** Replaces the HUD picker (tests). Return a closer or null. */
  openMenu?: (rows: readonly LiftMenuRow[], choose: (id: string) => void) => (() => void) | null;
  table?: readonly LiftStop[];
  /** Loads the generated `lift-cage` model over the scripted frame (see envModelLibraryFor). Omitted in tests: the frame stays. */
  envLib?: ModelLibrary;
}

const refusedKey = (err: unknown): string => {
  const reason = err instanceof InteriorError ? err.reason : '';
  if (reason === 'aggro') return 'oldsmoke.lift.refused.aggro';
  if (reason === 'busy') return 'oldsmoke.lift.refused.busy';
  if (reason === 'locked') return 'oldsmoke.lift.refused.locked';
  return 'oldsmoke.lift.refused.other';
};

/**
 * One ride from `from` to `to` through the interiors service. Resolves true when the player arrived. A refusal (aggro, busy,
 * locked, a mid-way failure) is reported through `onRefused` and leaves the player where the service left them: a refusal of the
 * exit leaves them in the mine, a refused enter after the exit leaves them on the surface at the shaft door.
 */
export async function rideTo(
  interiors: Pick<InteriorsService, 'enter' | 'exit' | 'current' | 'transitioning'> & Partial<Pick<InteriorsService, 'hostileAggro' | 'transfer'>>,
  to: LiftStop,
  onRefused: (err: unknown) => void,
): Promise<boolean> {
  if (interiors.transitioning) {
    onRefused(new InteriorError('busy'));
    return false;
  }
  const from = stopOfInterior(interiors.current);
  if (from.id === to.id) return false;
  // An exit never checks aggro but an enter does: refuse up front so the player is not left on the surface with enemies on them.
  if (to.interiorId !== null && interiors.hostileAggro?.()) {
    onRefused(new InteriorError('aggro'));
    return false;
  }
  try {
    if (interiors.current !== null && to.interiorId !== null && to.doorId !== null && interiors.transfer) {
      // Mine to mine in one fade: the surface is never shown (an exit then an enter would fade twice and fire the shaft head's triggers).
      await interiors.transfer(to.interiorId, to.doorId);
      return true;
    }
    if (interiors.current !== null) await interiors.exit(from.doorId ?? undefined);
    if (to.interiorId !== null && to.doorId !== null) await interiors.enter(to.interiorId, to.doorId);
    return true;
  } catch (err) {
    onRefused(err);
    return false;
  }
}

export function registerLift(ctx: LiftCtx, opts: LiftOptions = {}): () => void {
  const table = opts.table ?? LIFT_STOPS;
  const ground = opts.heightAt ?? heightAt;
  const cleanups: Array<() => void> = [];
  let closeMenu: (() => void) | null = null;
  let riding = false;
  const t = (k: string): string => ctx.strings.t(k);
  const armed = (): boolean => ctx.state.getBool(LIFT_ARMED_FLAG);
  const interiors = (): InteriorsService | undefined => ctx.services.get('interiors');
  const toast = (key: string): void => showToast(ctx.hud, t(key));
  const playRide = makeLiftRidePlayer(ctx.services.get('audio') as LiftAudio | undefined);
  const playCue = makeLiftCuePlayer(ctx.services.get('audio') as LiftAudio | undefined);
  // Warm-up: render the ride and the three cues one per idle slice after registration, so the first use (a keypress, then the
  // arrival after the fade-in) does not synthesize on a visible frame. A cue needed sooner renders on its first play as before.
  {
    const steps: Array<() => void> = [() => playRide.prime(), ...LIFT_CUE_KEYS.map((k) => () => playCue.prime(k))];
    type G = { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const g = globalThis as unknown as G;
    let cancel: (() => void) | null = null;
    const later = (cb: () => void): void => {
      if (typeof g.requestIdleCallback === 'function') {
        const id = g.requestIdleCallback(cb, { timeout: 2000 });
        cancel = () => g.cancelIdleCallback?.(id);
      } else {
        const id = setTimeout(cb, 0);
        cancel = () => clearTimeout(id);
      }
    };
    const slice = (): void => {
      cancel = null;
      steps.shift()?.();
      if (steps.length) later(slice);
    };
    if (ctx.services.get('audio')) later(slice);
    cleanups.push(() => {
      cancel?.();
      cancel = null;
      steps.length = 0;
      playRide.dispose();
      playCue.dispose();
    });
  }

  // Quest reads go through the quests service; without it every quest condition is "inactive" (locked), never a throw.
  const env = (): ConditionEnv => {
    const quests = ctx.services.get('quests');
    return {
      state: ctx.state as unknown as ConditionEnv['state'],
      quests: { state: (id) => quests?.state(id) ?? 'inactive', objectiveDone: (q, o) => quests?.objectiveDone(q, o) ?? false },
    };
  };

  /** Why a stop is locked: the winch text only while the winch is still broken. */
  const lockedReasonKey = (s: LiftStop): string => (armed() && (s.id === 'shaft' || s.id === 'old') ? `${s.lockedKey}.mended` : s.lockedKey);

  const rows = (): { rows: LiftMenuRow[]; byId: Map<string, LiftStop & { unlocked: boolean }> } => {
    const here = stopOfInterior(interiors()?.current ?? null, table);
    const byId = new Map<string, LiftStop & { unlocked: boolean }>();
    const out: LiftMenuRow[] = [];
    for (const s of availableStops(env(), table)) {
      if (s.stop.id === here.id) continue;
      byId.set(s.stop.id, { ...s.stop, unlocked: s.unlocked });
      out.push({ id: s.stop.id, label: t(s.stop.labelKey), locked: !s.unlocked, reason: s.unlocked ? undefined : t(lockedReasonKey(s.stop)) });
    }
    return { rows: out, byId };
  };

  const ride = async (stop: LiftStop & { unlocked: boolean }): Promise<void> => {
    const svc = interiors();
    if (!svc || riding) return;
    if (!stop.unlocked) {
      playCue(LIFT_REFUSE_SOUND);
      return toast('oldsmoke.lift.refused.locked');
    }
    riding = true;
    try {
      // The cage shudders and rumbles over the fade to black, so the exit-then-enter hold reads as a ride, not a load. Only when the
      // ride can go (a refusal below says why instead).
      if (!svc.transitioning && !svc.hostileAggro?.()) {
        toast('oldsmoke.lift.shudder');
        playRide();
        (ctx.services.get('vfx') as { shake?: (a: number, s: number) => void } | undefined)?.shake?.(0.12, 1.2);
      }
      // Arrival only when the ride went; a refusal plays the denied clack instead, never both.
      const arrived = await rideTo(svc, stop, (err) => {
        playCue(LIFT_REFUSE_SOUND);
        toast(refusedKey(err));
      });
      if (arrived) playCue(LIFT_ARRIVE_SOUND);
    } finally {
      riding = false;
    }
  };

  const openPicker = (): void => {
    if (riding || !interiors()) return;
    const { rows: list, byId } = rows();
    playCue(LIFT_CALL_SOUND);
    const choose = (id: string): void => {
      closeMenu = null;
      const stop = byId.get(id);
      if (stop) void ride(stop);
    };
    const open = opts.openMenu ?? ((r, c) => openLiftMenu(ctx, r, c));
    const close = open(list, choose);
    // A second open while the menu is up returns null; keep the closer of the one that is showing.
    if (close) closeMenu = close;
  };
  cleanups.push(ctx.events.on('ui.modal', (e) => {
    if (e.id === 'oldsmoke.lift.menu' && !e.open) closeMenu = null;
  }));

  // Interactables, registered lazily: the mines' `.call` anchors are defined by the interiors plugin at runtime.
  const live = new Map<string, () => void>();
  const sync = (): void => {
    const add = (name: string, anchorId: string, surface: boolean): void => {
      if (live.has(name)) return;
      const anchor = ctx.anchors.find(anchorId);
      if (!anchor) return;
      live.set(
        name,
        ctx.interaction.register({
          id: `use:${name}`,
          kind: 'use',
          position: (out: THREE.Vector3) => out.set(anchor.position.x, anchor.position.y + 1, anchor.position.z),
          radius: 2,
          coneDegrees: 360,
          get promptKey() {
            return surface && !armed() ? 'oldsmoke.lift.dead' : 'oldsmoke.lift.use';
          },
          enabled: () => !riding && !(interiors()?.transitioning ?? false),
          onInteract: () => {
            if (surface && !armed()) return playCue(LIFT_REFUSE_SOUND);
            openPicker();
          },
        }),
      );
    };
    add('lift', SURFACE_LIFT_ANCHOR, true);
    for (const m of MINES) add(`lift-${m}`, `${MINE_LANDINGS[m]}.call`, false);
  };
  sync();
  cleanups.push(ctx.systems.add({ id: 'oldsmoke.lift.sync', fixedPhase: 'rules', order: 0, fixedUpdate: sync }));
  cleanups.push(() => {
    for (const off of live.values()) off();
    live.clear();
    closeMenu?.();
  });

  // The shaft head shows the open cage while the lift is armed (the collar's closed hatch plate is fixed layout data).
  const cage = buildLiftCage();
  cage.position.set(SHAFT.x, ground(SHAFT.x, SHAFT.z), SHAFT.z);
  cage.visible = armed();
  ctx.scene.add(cage);
  // The generated cage model replaces the scripted frame when it loads (the scripted one stays otherwise).
  if (opts.envLib) void upgradeLiftCage(cage, opts.envLib).catch(() => undefined);
  const syncCage = (): void => {
    cage.visible = armed();
  };
  cleanups.push(ctx.events.on('flag.changed', ({ key }) => key === LIFT_ARMED_FLAG && syncCage()));
  cleanups.push(ctx.events.on('save.loaded', syncCage));
  cleanups.push(() => {
    cage.userData.disposed = true;
    ctx.scene.remove(cage);
    cage.traverse((o) => !o.userData.sharedGeometry && (o as THREE.Mesh).geometry?.dispose());
  });

  return () => {
    for (const c of cleanups.splice(0).reverse()) {
      try {
        c();
      } catch (err) {
        console.warn('lift: teardown step failed', err);
      }
    }
  };
}
