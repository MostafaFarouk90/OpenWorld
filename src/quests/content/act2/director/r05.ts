// R05 Ketta's Lost Flock: the fox's shortcut (four stops, then a flock of six) or the safe road (a flock of eight).
import { PASTURE_REDUCED_FLAG } from '../../../../cinderreach/flags';
import type { Kit, Off } from './kit';

const FOX_SPAWNER = 'cinderreach.fox.r05';
const FLOCK = (n: number): string[] => Array.from({ length: n }, (_, i) => `cinderreach.pasture.flock.${i + 1}`);
const HOLLOWS = [1, 2, 3].map((n) => `cinderreach.pasture.hollow.${n}`);
const FOX_STOPS = [1, 2, 3, 4].map((n) => `cinderreach.r05.fox.${n}`);
const HOME = 'cinderreach.r05.home';
const HOME_RADIUS = 14;
/** Sheep that must be at the fold: 4 of 6 by the fox's road, 6 of 8 by the safe one (a lost sheep cannot soft-lock the quest). */
export const R05_NEEDED = { fox: { flock: 6, home: 4 }, safe: { flock: 8, home: 6 } } as const;
/** The grazing flock left at the pasture once R05 is done: the herd service's id, and its size by A3's derived flag. */
export const PASTURE_HERD = 'cinderreach.pasture';
export const PASTURE_FLOCK = { full: 8, reduced: 6 } as const;

export function installR05(k: Kit): Off[] {
  const { ctx } = k;
  let foxBase = 0;

  const choice = (): 'fox' | 'safe' | null => {
    const c = k.str('story.r05.choice');
    return c === 'fox' || c === 'safe' ? c : null;
  };
  const startHerd = (c: 'fox' | 'safe'): void => {
    const herd = ctx.services.get('herd');
    if (!herd) return;
    herd.start('r05', FLOCK(R05_NEEDED[c].flock), { fogAnchors: HOLLOWS });
    herd.follow('r05', true);
    k.set('story.r05.herdOn');
  };
  const guideFox = (): void => {
    const next = Math.min(k.num('story.r05.foxNext'), FOX_STOPS.length - 1);
    foxBase = next;
    const en = ctx.services.get('enemies');
    if (!en || en.alive(FOX_SPAWNER).length === 0) en?.spawnGroup(FOX_SPAWNER);
    if (!ctx.services.get('foxes')?.guide(FOX_SPAWNER, FOX_STOPS.slice(next))) k.warn('R05: the fox could not be sent down the road');
  };
  const begin = (): void => {
    const c = choice();
    if (!c || !k.active('r05')) return;
    if (c === 'safe') startHerd('safe');
    else if (k.num('story.r05.foxNext') >= FOX_STOPS.length) startHerd('fox');
    else guideFox();
  };

  k.onNamed('story.r05.branched', () => k.later(begin));
  // The guide and the herd are not saved: rebuild them from the flags.
  k.on('save.loaded', () => {
    if (!k.active('r05') || !choice() || k.flag('story.r05.herdHome') || !k.objDone('r05', 'choice')) return;
    k.later(() => {
      ctx.services.get('herd')?.stop('r05');
      begin();
    });
  });

  k.on('fox.arrived', (e) => {
    if (!k.active('r05') || choice() !== 'fox') return;
    const reached = foxBase + e.stop + 1;
    if (reached <= k.num('story.r05.foxNext')) return;
    k.set('story.r05.foxNext', reached);
    if (reached >= FOX_STOPS.length) {
      k.emit('story.r05.foxStops');
      k.later(() => startHerd('fox'));
    }
  });

  // The fold: credit the herd home once enough sheep stand at the home anchor.
  k.every(30, () => {
    const c = choice();
    if (!c || !k.active('r05') || !k.flag('story.r05.herdOn') || k.flag('story.r05.herdHome')) return;
    const herd = ctx.services.get('herd');
    if (!herd || herd.count('r05', HOME, HOME_RADIUS) < R05_NEEDED[c].home) return;
    k.set('story.r05.herdHome');
    herd.follow('r05', false);
    k.emit('story.r05.herdHome');
  });

  // After R05 the pasture keeps a grazing flock (never following): eight, or six when the fox's road cost two
  // (`world.cinderreach.pasture.reduced`, A3's flag derived from the choice). The herd service saves nothing and a load
  // clears every herd before `save.loaded`, so it is rebuilt there (review-a #5).
  const pastureFlock = (): void => {
    const herd = ctx.services.get('herd');
    if (!herd || k.qstate('r05') !== 'completed') return;
    const reduced = k.flag(PASTURE_REDUCED_FLAG) || k.str('story.r05.choice') === 'fox';
    if (!herd.start(PASTURE_HERD, FLOCK(reduced ? PASTURE_FLOCK.reduced : PASTURE_FLOCK.full))) k.warn('R05: the pasture flock could not be placed');
  };
  k.on('quest.completed', (e) => {
    if (e.questId !== 'r05') return;
    ctx.services.get('herd')?.stop('r05');
    ctx.services.get('enemies')?.despawnGroup(FOX_SPAWNER);
    k.later(pastureFlock);
  });
  k.on('save.loaded', () => {
    if (k.qstate('r05') === 'completed') k.later(pastureFlock);
  });
  return [];
}
