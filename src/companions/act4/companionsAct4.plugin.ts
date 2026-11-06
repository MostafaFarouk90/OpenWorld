// Act 4 thread L4 (plans/act4-L4.md section 1.6): the companions in Act 4. The Waste barks and the mourning lines sit
// with the companion defs and their string tables (as Act 3's do); this plugin says the event barks (the walkers met, Ebba), and the one-off lines
// (the M37 bond line, the mourning for Sir Gaut). Inert before Act 4's flags.
import type { GamePlugin } from '../../core/plugins';
import { companionControllers } from '../companions.plugin';
import { OneShotLines } from './oneShots';

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
    offs.push(ctx.systems.add({ id: 'companions-act4', fixedPhase: 'rules', order: 60, fixedUpdate: (dt) => lines.tick(dt) }));
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
} satisfies GamePlugin;
