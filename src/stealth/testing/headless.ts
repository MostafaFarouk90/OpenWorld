/**
 * Test-only helpers for headless runs through the stealth sections and the M10 chase (thread 21's full-act run).
 * Never imported by game code.
 *
 * - `stealthRoute(sectionId, find)`: the waypoints a scripted player walks (sneaking) through a section, start to exit.
 * - `chaseRoute(find)`: the player's line over the rooftops (node 0 is the start box; plank gaps go round by the detour).
 * - `makeUndetectable(ctx)`: registers a perception provider so no guard can notice the player; returns the remover.
 * - `catchCourierForTest()`: catches the courier now through the normal `chase.caught` path (re-exported from the plugin).
 */
import type { GameContext } from '../../core/Game';
import type { Anchor } from '../../layout/AnchorRegistry';
import { playerPath, routeFromAnchors } from '../../chase/route';
import { M10_CHASE } from '../../chase/chases';
import type { P3, PerceptionModifiers } from '../perceptionPort';
import { SECTIONS } from '../sections';

export { catchCourierForTest } from '../../chase/chase.plugin';

type Find = (id: string) => Anchor | undefined;

/** Ordered anchor ids per section: start or entry, checkpoints, the quest beats inside, then the exit. */
export const STEALTH_ROUTE_ANCHORS: Readonly<Record<string, readonly string[]>> = {
  'm06.south-gate': ['stealth.m06.start', 'stealth.m06.cp.inside', 'stealth.m06.end'],
  'm09.counting-house': [
    'stealth.m09.entry',
    'stealth.m09.cp.hall',
    'stealth.m09.cp.office',
    'm09.invoice-1',
    'm09.invoice-2',
    'm09.invoice-3',
    'stealth.m09.cp.office',
    'stealth.m09.cp.hall',
    'stealth.m09.exit',
  ],
};

/** World waypoints for a section; throws naming the first missing anchor (so a layout change fails loudly). */
export function stealthRoute(sectionId: string, find: Find): P3[] {
  if (!SECTIONS.some((s) => s.id === sectionId)) throw new Error(`stealthRoute: unknown section ${sectionId}`);
  const ids = STEALTH_ROUTE_ANCHORS[sectionId];
  if (!ids) throw new Error(`stealthRoute: no route for ${sectionId}`);
  return ids.map((id) => {
    const a = find(id);
    if (!a) throw new Error(`stealthRoute: anchor ${id} is missing`);
    return { ...a.position };
  });
}

/** The M10 rooftop line from `chase.m10.0` to the end, plank gaps taken by their detour (no Leap needed). */
export function chaseRoute(find: Find): P3[] {
  const nodes = routeFromAnchors(find, M10_CHASE.routePrefix);
  if (nodes.length < 2) throw new Error('chaseRoute: the chase.m10.* anchors are missing');
  return playerPath(nodes, false).map((p) => ({ ...p.position }));
}

const UNSEEN: PerceptionModifiers = { sightRangeScale: 0, coneScale: 0, hearingQuietScale: 0, hearingLoudScale: 0, hiddenBelow: 0 };

/** No guard notices the player while registered (hidden at zero range, deaf, blind). Returns the remover; a no-op without enemies. */
export function makeUndetectable(ctx: GameContext): () => void {
  const p = ctx.services.get('enemies')?.perception;
  if (!p) return () => {};
  return p.register({ modifiers: (target) => (target === ctx.player.actor.id ? UNSEEN : null) });
}
