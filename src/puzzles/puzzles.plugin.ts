import { PLAYER_ID } from '../actors/teams';
import type { GamePlugin } from '../core/plugins';
import '../waystones/service';
import type { PuzzleRegistration } from './service';
import './service';
import { PUZZLE_STRINGS_EN } from './strings.en';

/**
 * The shared puzzle services (A9). Puzzle state is never saved: leaving the room by dying, fast travel or a load
 * stops every pressure clock and tells the puzzle to reset, with no penalty.
 */
const puzzlesPlugin: GamePlugin = {
  id: 'puzzles',
  dependsOn: ['core'],
  setup(ctx) {
    ctx.strings.register('en', PUZZLE_STRINGS_EN);
    const regs = new Map<string, PuzzleRegistration>();
    const abort = (reason: 'death' | 'travel' | 'load') => {
      for (const reg of [...regs.values()]) {
        reg.timer?.reset();
        try {
          reg.onAbort?.(reason);
        } catch (err) {
          console.warn('puzzles: abort hook failed', err);
        }
      }
    };
    ctx.services.provide('puzzles', {
      pressure(id) {
        const t = regs.get(id)?.timer;
        return t?.active ? { remaining: t.remaining(), total: t.total } : null;
      },
      register(id, reg) {
        if (regs.has(id)) throw new Error(`puzzles: "${id}" is already registered`);
        regs.set(id, reg);
        return () => {
          if (regs.get(id) === reg) regs.delete(id);
        };
      },
    });
    ctx.events.on('actor.died', (e) => {
      if (e.actorId === PLAYER_ID) abort('death');
    });
    ctx.events.on('save.loaded', () => abort('load'));
    let travelling = false;
    ctx.systems.add({
      id: 'puzzles.tick',
      fixedPhase: 'rules',
      order: 120,
      fixedUpdate() {
        const now = ctx.services.get('waystones')?.travelling ?? false;
        if (now && !travelling) abort('travel');
        travelling = now;
      },
    });
  },
};

export default puzzlesPlugin;
