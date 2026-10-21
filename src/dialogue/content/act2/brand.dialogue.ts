import { buildTree } from './build';
import { all, qActive } from './cond';

export const BRAND = buildTree({
  id: 'npc-brand',
  start: [
    { when: qActive('m12'), seg: 'm12-talk' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm12-talk': {
      lines: [
        { s: 'brand', t: 'Brand, sergeant of the Cinderford militia. Four weeks ago I was a carter. Now I have thirty farmers with pitchforks and a roll to read from.' },
        { s: 'brand', t: 'They are good lads, mind, and good lasses. Loud in the tavern, steadier than you would think behind a barricade. Put them where they know the ground.' },
        { s: 'brand', t: 'The carts hold the brazier coals and the pitch. I loaded them myself, so if one tips, it was not my doing, and I will say so loudly.' },
        {
          s: 'brand',
          t: 'Take this. I would sooner you were whole than thanked. It is fair, and it is yours.',
          fx: [
            {
              if: { not: { flag: 'story.m12.brandGift', equals: true } },
              then: [{ give: [{ itemId: 'healing-flask', count: 1 }] }, { setFlag: 'story.m12.brandGift', value: true }],
            },
          ],
        },
      ],
    },
    idle: { lines: [{ s: 'brand', t: 'Anything you need hauled, I will haul. Anyone you need shouted at, I will shout. That is the whole of a sergeant.' }] },
  },
});
