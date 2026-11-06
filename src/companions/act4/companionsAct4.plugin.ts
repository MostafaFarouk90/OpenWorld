// Act 4 thread L4 (plans/act4-L4.md section 1.6): the companions in Act 4. The Waste barks and the mourning lines sit
// with the companion defs and their string tables (as Act 3's do); this plugin says the event barks (the walkers met, Ebba), and the one-off lines
// (the M37 bond line, the mourning for Sir Gaut). Inert before Act 4's flags.
import type { GamePlugin } from '../../core/plugins';
import { companionControllers } from '../companions.plugin';
import { BENCHED_IDS, defineBenchPosts } from './benchPosts';
import { OneShotLines } from './oneShots';
import '../../weather/types';

/** In a storm (L3's `storm` movement mode) companions walk the rope-line right behind Cael, not on the dunes beside it. */
export const STORM_ROPE_SLOT = { back: 1.5, side: 0 } as const;

/** Flags whose rise says an event bark (each once per rise; the director's repeat window paces the rest). */
export const ACT4_FLAG_BARKS: Readonly<Record<string, string>> = {
  'story.m42.complete': 'a4.walkers',
  'story.m44.started': 'a4.ebba',
};

let teardown: (() => void) | null = null;

export default {
  id: 'companions-act4',
  dependsOn: ['core', 'companions'],
  setup(ctx) {
    const offs: (() => void)[] = [];
    teardown = () => {
      for (const off of offs.splice(0).reverse()) {
        try {
          off();
        } catch (err) {
          console.warn('companions-act4: dispose failed', err);
        }
      }
    };
    const sayAll = (place: string) => {
      for (const c of companionControllers()) c.sayAt(place);
    };
    offs.push(
      ctx.events.on('flag.changed', ({ key, value, previous }) => {
        const place = ACT4_FLAG_BARKS[key];
        if (place && value === true && previous !== true) sayAll(place);
      }),
    );
    const lines = new OneShotLines({
      flag: (k) => ctx.state.getFlag(k),
      setFlag: (k, v) => ctx.state.setFlag(k, v),
      speakers: () => companionControllers(),
    });
    offs.push(ctx.events.on('rest', () => lines.rested()));
    // A storm starting says the storm line (the director paces repeats).
    offs.push(
      ctx.events.on('weather.changed', ({ kind, from }) => {
        if (kind === 'storm' && from !== 'storm') sayAll('a4.storm');
      }),
    );
    let posts = defineBenchPosts(ctx.anchors);
    let postsIn = 1;
    let roped = false;
    const ropeSlot = () => {
      // the storm mode, or a storm while a higher mode (an escort) holds the mode
      const storm = ctx.services.get('movementMode')?.current === 'storm' || ctx.services.get('weather')?.state().kind === 'storm';
      if (storm === roped) return;
      roped = storm;
      for (const c of companionControllers()) c.setSlotOverride(storm ? STORM_ROPE_SLOT : null);
    };
    offs.push(
      ctx.systems.add({
        id: 'companions-act4',
        fixedPhase: 'rules',
        order: 60,
        fixedUpdate: (dt) => {
          ropeSlot();
          lines.tick(dt);
          // the bench posts, once their base anchors (L1's refuge, L2's camp) are placed; checked once a second
          if (posts < BENCHED_IDS.length * 2 && (postsIn -= dt) <= 0) {
            postsIn = 1;
            posts = defineBenchPosts(ctx.anchors);
          }
        },
      }),
    );
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
} satisfies GamePlugin;
