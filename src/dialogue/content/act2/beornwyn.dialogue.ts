import { buildTree } from './build';
import { all } from './cond';

export const BEORNWYN = buildTree({
  id: 'npc-beornwyn',
  start: [{ when: all(), seg: 'idle' }],
  segments: {
    idle: {
      lines: [
        { s: 'beornwyn', t: 'The hill was red, the hammers rang, and the gate stood by one hinge. Not yet finished, but I have the tune. Do you like it?' },
        { s: 'beornwyn', t: 'If you have the arm for a rhythm duel, I will take your coin and your pride in equal measure. Not tonight. When the hammers are ready.' },
        { s: 'beornwyn', t: 'Come back later, {name}. The tavern will still be here, and so will the song.' },
      ],
    },
  },
});
