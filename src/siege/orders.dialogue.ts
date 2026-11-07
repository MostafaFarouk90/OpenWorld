// The war post's orders between siege waves (plans/act5-N4.md section 6, review open point 4): a short talk whose
// choices emit `siege.order.<id>`. The runner writes `siege.offer.<id>` before each break, so only what the roster
// allows is offered. At most four choices a line: the plain orders first, the rest behind "Something else".
import { buildTree, type ChoiceSpec, type BuiltTree } from '../dialogue/content/act2/build';
import type { SiegeOrderId } from '../caldera/siege';

/** The orders the war post can give (N0's `sally` and `fall-back` stay reserved). */
export const OFFERED_ORDERS = ['hold', 'brace', 'loose', 'flasks', 'gong'] as const satisfies readonly SiegeOrderId[];
export type OfferedOrder = (typeof OFFERED_ORDERS)[number];

export const offerFlag = (id: OfferedOrder): string => `siege.offer.${id}`;
export const orderEvent = (id: OfferedOrder): `siege.order.${OfferedOrder}` => `siege.order.${id}`;
export const ORDERS_TREE = { m52: 'siege-orders-m52', r27: 'siege-orders-r27' } as const;
export const ORDERS_SPEAKER = { m52: 'wystan', r27: 'wenna' } as const;

const LINES: Record<OfferedOrder, string> = {
  hold: 'Hold the line as it stands.',
  brace: 'Brace the gate. Every shoulder on the beams.',
  loose: 'Archers, loose on the stair as they climb.',
  flasks: "Break open Oswin's second crate.",
  gong: 'Strike the gong. Get the fallen on their feet.',
};

const choice = (id: OfferedOrder): ChoiceSpec => ({
  id,
  t: LINES[id],
  go: null,
  ...(id === 'hold' ? {} : { when: { flag: offerFlag(id), equals: true } }),
  fx: [{ event: orderEvent(id) }],
});

function tree(siege: 'm52' | 'r27'): BuiltTree {
  const s = ORDERS_SPEAKER[siege];
  const ask = siege === 'm52' ? 'They will come again before the ash settles. What do we do?' : 'They are regrouping in the dark. Tell me what you want.';
  return buildTree({
    id: ORDERS_TREE[siege],
    start: [{ when: { all: [] }, seg: 'ask' }],
    segments: {
      ask: {
        lines: [
          {
            s,
            t: ask,
            choices: [
              choice('hold'),
              choice('brace'),
              choice('loose'),
              { id: 'more', t: 'Something else.', go: 'more', when: { any: [{ flag: offerFlag('flasks'), equals: true }, { flag: offerFlag('gong'), equals: true }] } },
            ],
          },
        ],
      },
      more: { lines: [{ s, t: 'Say it quickly.', choices: [choice('flasks'), choice('gong'), { id: 'back', t: 'No. Hold the line.', go: null, fx: [{ event: orderEvent('hold') }] }] }] },
    },
  });
}

export const SIEGE_ORDER_TREES: readonly BuiltTree[] = [tree('m52'), tree('r27')];
export const SIEGE_ORDER_STRINGS: Record<string, string> = Object.assign({}, ...SIEGE_ORDER_TREES.map((t) => t.strings));
