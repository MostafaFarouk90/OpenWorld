// The director rules of M18 and M19 that cannot live in a quest def or the dialogue (plans/act2-A13.md sections 3.5 and 3.7):
// the Bellows scene, the nursery reveal, Wenna's route guide, the sealed door and the shortcut gate. Two installers for the
// shared Oldsmoke director (`makeKit`), like `installM16` and `installM22`; the integrator calls them from its setup.
import { FIXED_TIMESTEP } from '../../../../../config/constants';
import { showToast } from '../../../../../waystones/toast';
import type { Kit, Off } from '../../director/kit';
import { createWennaFigure, type FigureMode, type GuideFigure } from './m19Figure';
import { WennaGuide, guidePoints, type P3 } from './m19Route';
import { M18_SCENE } from './m18.quest';
import { M19_DOOR_OPEN_FLAG, M19_NURSERY_TRIGGER, M19_SCENE, M19_SECTION } from './m19.quest';

/** A4's interiors, by id (the lift menu rides into them). */
export const M18_INTERIOR = 'mine-weeping-bellows';
export const M19_INTERIOR = 'mine-lower-galleries';
export const M19_ROUTE_PREFIX = 'oldsmoke.m19.route';
export const M19_NURSERY_ANCHOR = 'oldsmoke.m19.nursery';
export const M19_DOOR_BLOCKER = 'oldsmoke.lower.sealed.door';
export const M19_GATE_BLOCKER = 'oldsmoke.lower.shortcut.gate';
/** A9's flag, read only: the Bellows puzzle is solved and the shortcut is open. */
export const SHORTCUT_FLAG = 'world.bellows.shortcutOpen';
export const M19_ARRIVED_FLAG = 'story.m19.guideArrived';
/** The guide's saved node and barks are two number flags (world state is saved with the game; no persistable, so no new save fixture). */
export const M19_GUIDE_NODE_FLAG = 'story.m19.guideNode';
export const M19_GUIDE_BARKS_FLAG = 'story.m19.guideBarks';
export const M19_BARKS = 6;
/** Seconds before a scene the player closed early is offered again. */
const SCENE_COOLDOWN_POLLS = 20;
/** A hiding Wenna looks for a hide spot this close. */
const HIDE_REACH_M = 25;
/** After a load the saved node is kept, not re-seated from the player's position, for this many ticks. */
const LOAD_GRACE_TICKS = 30;

const scenePoll = (k: Kit, ready: () => boolean, start: () => boolean): void => {
  let cool = 0;
  k.every(30, () => {
    if (cool > 0) { cool--; return; }
    if (!ready() || k.ctx.services.get('dialogue')?.active) return;
    if (start()) cool = SCENE_COOLDOWN_POLLS;
  });
};

/**
 * M18: when the shrine is lit and the `breathe` objective opens, Pike's two-line scene plays in the cavern (the bellows
 * breathe). The scene's end credits the objective; it waits for the player to be in the cavern and for any other
 * dialogue, and is offered again, after ten seconds, if the player closed it early.
 */
export function installM18(k: Kit): void {
  const inCavern = (): boolean => {
    const here = k.ctx.services.get('interiors')?.current;
    return here === undefined || here === M18_INTERIOR;
  };
  scenePoll(k, () => k.active('m18') && k.objCurrent('m18', 'breathe') && inCavern(), () => k.ctx.services.get('dialogue')?.start(M18_SCENE, 'scene.m18') === true);
}

export interface M19Ports {
  /** The stand-in figure (default: the placeholder body in the scene). Called once, when she first walks. */
  figure?: () => GuideFigure | null;
  /** A wait bark (default: a HUD toast of the string). */
  toast?: (key: string) => void;
}

interface GuideSave { node: number; barks: number }

const parseSave = (d: unknown): GuideSave | null => {
  const o = d as { node?: unknown; barks?: unknown } | null | undefined;
  if (!o || !Number.isInteger(o.node) || (o.node as number) < 0) return null;
  return { node: o.node as number, barks: Number.isInteger(o.barks) && (o.barks as number) >= 0 ? (o.barks as number) : 0 };
};

/**
 * M19: the nursery reveal, the sealed door and the shortcut gate, and Wenna's route guide.
 *
 * The guide walks `oldsmoke.m19.route.0..n` between the confession and the reveal, only while the player is in the Lower
 * Galleries. The NPC `wenna` is hidden and a stand-in figure walks: she advances while the player is within 8 m, waits (a
 * bark every 20 s) when the player lags, hurries when the player is ahead, is re-seated at the node behind the player after a
 * teleport, a door or a respawn, and stops short of the sealed door until it is open. In combat and in the stealth section
 * she crouches at the nearest hide spot and walks on after. At the end she is placed in the nursery and shown again. The last
 * node reached is a persistable, so a load resumes there. Returns the disposer (the figure, the persistable, the NPC's hide).
 */
export function installM19(k: Kit, ports: M19Ports = {}): Off {
  const { ctx } = k;
  const dialogue = () => ctx.services.get('dialogue');
  const interiors = () => ctx.services.get('interiors');
  const npcs = () => ctx.services.get('npcs');
  const feet = (): P3 => ctx.player.feet;
  const dialogueBusy = (): boolean => dialogue()?.active === true;
  const toast = ports.toast ?? ((key: string): void => showToast(ctx.hud, ctx.strings.t(key)));
  const makeFigure = ports.figure ?? ((): GuideFigure | null => createWennaFigure(ctx, (m) => k.warn(m)));

  // ---- the nursery reveal ---------------------------------------------------------------------
  let inNursery = false;
  k.on('trigger.enter', (e) => { if (e.actorId === 'player' && e.triggerId === M19_NURSERY_TRIGGER) inNursery = true; });
  k.on('trigger.exit', (e) => { if (e.actorId === 'player' && e.triggerId === M19_NURSERY_TRIGGER) inNursery = false; });
  scenePoll(k, () => k.active('m19') && k.objCurrent('m19', 'reveal') && inNursery, () => dialogue()?.start(M19_SCENE, 'scene.m19') === true);

  // ---- the sealed door and the shortcut gate (blockers in A4's Lower Galleries) ---------------------
  const applied = new Map<string, boolean>();
  let blockerWarned = false;
  const syncBlockers = (force: boolean): void => {
    const service = interiors();
    if (!service) return;
    const want: [string, boolean][] = [[M19_DOOR_BLOCKER, !k.flag(M19_DOOR_OPEN_FLAG)], [M19_GATE_BLOCKER, !k.flag(SHORTCUT_FLAG)]];
    for (const [id, closed] of want) {
      if (!force && applied.get(id) === closed) continue;
      if (service.setBlocker(id, closed)) applied.set(id, closed);
      else {
        applied.delete(id);
        if (!blockerWarned) { blockerWarned = true; k.warn(`m19: no blocker ${id} yet`); }
      }
    }
  };
  k.every(30, () => syncBlockers(false));
  k.on('interior.entered', (e) => { if (e.interiorId === M19_INTERIOR) syncBlockers(true); });

  // ---- the guide ------------------------------------------------------------------------------
  let guide: WennaGuide | null = null;
  const readSaved = (): GuideSave | null => (k.flag(M19_ARRIVED_FLAG) || k.num(M19_GUIDE_NODE_FLAG) > 0 || k.num(M19_GUIDE_BARKS_FLAG) > 0 ? parseSave({ node: k.num(M19_GUIDE_NODE_FLAG), barks: k.num(M19_GUIDE_BARKS_FLAG) }) : null);
  let saved: GuideSave | null = readSaved();
  let figure: GuideFigure | null = null;
  let running = false;
  let justLoaded = false;
  let grace = 0;
  let sectionOn = false;
  let nextBark = 0;
  let barkNodes: number[] = [];
  const barkQueue: number[] = [];
  let doorArc: number | null = null;
  let limitSet: number | null | undefined;
  let hideSpots: P3[] = [];
  let hideTarget: P3 | null = null;
  let waitN = 0;
  let reseatPending = false;
  const here: P3 = { x: 0, y: 0, z: 0 };

  const skipBarks = (): void => {
    if (!guide) return;
    const node = guide.nodeIndex();
    let i = 0;
    while (i < barkNodes.length && barkNodes[i] <= node) i++;
    nextBark = Math.max(nextBark, i);
  };

  const build = (): boolean => {
    if (guide) return true;
    const pts = guidePoints((id) => ctx.anchors.find(id), M19_ROUTE_PREFIX);
    if (pts.length < 2) return false;
    guide = new WennaGuide(pts);
    const last = pts.length - 1;
    barkNodes = Array.from({ length: M19_BARKS }, (_, n) => Math.max(1, Math.round(((n + 1) * last) / (M19_BARKS + 1))));
    const doors = [1, 2, 3].map((n) => ctx.anchors.find(`oldsmoke.lower.sealed.${n}`)).filter((a): a is NonNullable<typeof a> => !!a);
    doorArc = doors.length ? Math.min(...doors.map((d) => guide!.line.project(d.position))) : null;
    hideSpots = [1, 2, 3, 4].map((n) => ctx.anchors.find(`oldsmoke.hide.m19.${n}`)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ ...a.position }));
    if (saved) {
      guide.restore({ node: saved.node });
      nextBark = Math.min(saved.barks, M19_BARKS);
    }
    return true;
  };

  const setHidden = (hidden: boolean): void => void npcs()?.setHidden('wenna', hidden);
  const stop = (): void => {
    if (!running) return;
    running = false;
    hideTarget = null;
    figure?.show(false);
    setHidden(false);
  };
  const start = (): void => {
    if (!guide) return;
    running = true;
    guide.settle();
    if (!justLoaded) { guide.reseat(feet()); skipBarks(); }
    justLoaded = false;
    figure ??= makeFigure();
    figure?.show(true);
    setHidden(true);
  };
  const placeAtNursery = (): void => void npcs()?.place('wenna', M19_NURSERY_ANCHOR);
  const finish = (): void => {
    k.set(M19_ARRIVED_FLAG);
    stop();
    placeAtNursery();
  };

  const nearestHide = (from: P3): P3 | null => {
    let best: P3 | null = null;
    let bestD: number = HIDE_REACH_M;
    for (const h of hideSpots) {
      const d = Math.hypot(h.x - from.x, h.z - from.z);
      if (d <= bestD) { best = h; bestD = d; }
    }
    return best;
  };

  k.onNamed('stealth.section', (p) => {
    const e = p as { sectionId?: string; phase?: string };
    if (e.sectionId !== M19_SECTION) return;
    if (e.phase === 'entered') sectionOn = true;
    else {
      sectionOn = false;
      // cleared: she is re-seated behind the player at the section's exit; exited: the player left, so the guide is paused anyway
      reseatPending = true;
    }
  });
  k.on('actor.revived', (e) => { if (e.actorId === 'player') reseatPending = true; });
  k.on('interior.entered', () => {
    reseatPending = true;
    if (k.flag(M19_ARRIVED_FLAG) && k.active('m19')) placeAtNursery();
  });
  k.on('save.loaded', () => {
    stop();
    sectionOn = false;
    waitN = 0;
    barkQueue.length = 0;
    grace = LOAD_GRACE_TICKS;
    // a load into the galleries resumes at the saved node; a load elsewhere re-seats her when the player walks back in
    justLoaded = interiors()?.current === M19_INTERIOR;
    saved = readSaved();
    if (guide && saved) { guide.restore({ node: saved.node }); nextBark = Math.min(saved.barks, M19_BARKS); }
    syncBlockers(true);
    if (k.flag(M19_ARRIVED_FLAG) && k.active('m19')) placeAtNursery();
  });

  const holdReason = (): 'dialogue' | 'combat' | 'section' | null => {
    if (sectionOn) return 'section';
    if (ctx.services.get('waystones')?.hostileAggro === true) return 'combat';
    if (dialogueBusy()) return 'dialogue';
    return null;
  };

  let blockersSet = false;
  const tick = (): void => {
    // the door and the gate are world state, not quest state: they are right from the first tick
    if (!blockersSet) { blockersSet = true; syncBlockers(true); }
    if (grace > 0) grace--;
    if (!k.active('m19')) { stop(); return; }
    if (k.flag(M19_ARRIVED_FLAG)) return;
    // the reveal can come before she has walked the whole route (the player ran ahead): she is simply in the nursery
    if (k.objDone('m19', 'reveal')) { finish(); return; }
    if (!k.objDone('m19', 'confession')) { stop(); return; }
    if (!build()) { stop(); return; }
    if (!guide) return;
    if (interiors()?.current !== M19_INTERIOR) { stop(); return; }
    if (!running) start();
    if (reseatPending && grace === 0) { reseatPending = false; guide.reseat(feet()); skipBarks(); }
    else if (reseatPending) reseatPending = false;
    const wantLimit = k.flag(M19_DOOR_OPEN_FLAG) ? null : doorArc;
    if (wantLimit !== limitSet) { limitSet = wantLimit; guide.setLimit(wantLimit); }

    const reason = holdReason();
    const events = guide.update(FIXED_TIMESTEP, feet(), reason !== null);
    for (const e of events) {
      if (e.type === 'node') {
        k.set(M19_GUIDE_NODE_FLAG, e.index);
        while (nextBark < barkNodes.length && barkNodes[nextBark] <= e.index) barkQueue.push(++nextBark);
        k.set(M19_GUIDE_BARKS_FLAG, nextBark);
      } else if (e.type === 'waitBark') {
        toast(e.reason === 'limit' ? `quest.m19.guide.limit.${(waitN++ % 2) + 1}` : `quest.m19.guide.wait.${(waitN++ % 3) + 1}`);
      } else if (e.type === 'arrived') finish();
    }
    if (!running) return;

    const at = guide.position(here);
    const crouch = reason === 'combat' || reason === 'section';
    if (crouch) hideTarget ??= nearestHide(at) ?? { ...at };
    else hideTarget = null;
    const mode: FigureMode = crouch ? 'crouch' : guide.state === 'walk' || guide.state === 'hurry' ? 'walk' : 'stand';
    figure?.place(hideTarget ?? at, guide.yaw, mode);
    figure?.update(FIXED_TIMESTEP);

    if (barkQueue.length && reason === null && !dialogueBusy()) {
      if (dialogue()?.start(`scene-m19-bark-${barkQueue[0]}`, 'scene.m19.bark')) barkQueue.shift();
    }
  };
  k.every(1, tick);

  return () => {
    if (running) stop();
    figure?.dispose();
    figure = null;
  };
}
