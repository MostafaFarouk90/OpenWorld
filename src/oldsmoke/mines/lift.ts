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
import { buildLiftCage } from '../oldsmokeArt';
import { SHAFT } from '../sites';
import { MINE_DOOR_IDS, MINE_LANDINGS, type MineId } from './kit';
import { openLiftMenu, type LiftMenuRow } from './liftMenu';
import { availableStops, LIFT_ARMED_FLAG, LIFT_STOPS, stopOfInterior, type LiftStop } from './liftStops';

export const SURFACE_LIFT_ANCHOR = 'oldsmoke.shaft.lift.top';
const MINES = Object.keys(MINE_LANDINGS) as MineId[];

/** Every mine door opens only while the lift is mended; the integration step merges this into the interiors door locks. */
export const MINE_DOOR_LOCKS: Readonly<Record<string, string>> = Object.fromEntries(MINES.map((m) => [MINE_DOOR_IDS[m], LIFT_ARMED_FLAG]));

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
  'oldsmoke.lift.locked.lower': 'not yet reached',
  'oldsmoke.lift.locked.bellows': 'not yet reached',
  'oldsmoke.lift.locked.deepdelve': 'the way is not open',
  'oldsmoke.lift.ride.down': 'The lift groans down',
  'oldsmoke.lift.ride.up': 'The lift groans up',
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
  interiors: Pick<InteriorsService, 'enter' | 'exit' | 'current' | 'transitioning'>,
  to: LiftStop,
  onRefused: (err: unknown) => void,
): Promise<boolean> {
  if (interiors.transitioning) {
    onRefused(new InteriorError('busy'));
    return false;
  }
  const from = stopOfInterior(interiors.current);
  if (from.id === to.id) return false;
  try {
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

  // Quest reads go through the quests service; without it every quest condition is "inactive" (locked), never a throw.
  const env = (): ConditionEnv => {
    const quests = ctx.services.get('quests');
    return {
      state: ctx.state as unknown as ConditionEnv['state'],
      quests: { state: (id) => quests?.state(id) ?? 'inactive', objectiveDone: (q, o) => quests?.objectiveDone(q, o) ?? false },
    };
  };

  const rows = (): { rows: LiftMenuRow[]; byId: Map<string, LiftStop & { unlocked: boolean }> } => {
    const here = stopOfInterior(interiors()?.current ?? null, table);
    const byId = new Map<string, LiftStop & { unlocked: boolean }>();
    const out: LiftMenuRow[] = [];
    for (const s of availableStops(env(), table)) {
      if (s.stop.id === here.id) continue;
      byId.set(s.stop.id, { ...s.stop, unlocked: s.unlocked });
      out.push({ id: s.stop.id, label: t(s.stop.labelKey), locked: !s.unlocked, reason: s.unlocked ? undefined : t(s.stop.lockedKey) });
    }
    return { rows: out, byId };
  };

  const ride = async (stop: LiftStop & { unlocked: boolean }): Promise<void> => {
    const svc = interiors();
    if (!svc || riding) return;
    if (!stop.unlocked) return toast(stop.lockedKey);
    riding = true;
    try {
      const down = stop.id !== 'surface';
      toast(down ? 'oldsmoke.lift.ride.down' : 'oldsmoke.lift.ride.up');
      // A small rumble if the vfx service is there; the ride works without it.
      (ctx.services.get('vfx') as { shake?: (a: number, s: number) => void } | undefined)?.shake?.(0.12, 1.2);
      await rideTo(svc, stop, (err) => toast(refusedKey(err)));
    } finally {
      riding = false;
    }
  };

  const openPicker = (): void => {
    if (riding || !interiors()) return;
    const { rows: list, byId } = rows();
    const choose = (id: string): void => {
      closeMenu = null;
      const stop = byId.get(id);
      if (stop) void ride(stop);
    };
    const open = opts.openMenu ?? ((r, c) => openLiftMenu(ctx, r, c));
    const close = open(list, choose);
    closeMenu = close;
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
            if (surface && !armed()) return;
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
  const syncCage = (): void => {
    cage.visible = armed();
  };
  cleanups.push(ctx.events.on('flag.changed', ({ key }) => key === LIFT_ARMED_FLAG && syncCage()));
  cleanups.push(ctx.events.on('save.loaded', syncCage));
  cleanups.push(() => {
    ctx.scene.remove(cage);
    cage.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
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
