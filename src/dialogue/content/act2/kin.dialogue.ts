import { buildTree } from './build';
import { all, step } from './cond';

const E = (t: string) => ({ s: 'ealdred', t });
const C = (t: string) => ({ s: 'cael', t });

/** Hrolf's cousin, in the brothers' hall at Stonefold. */
export const EALDRED = buildTree({
  id: 'npc-ealdred',
  start: [
    { when: step('m13', 'brief', 'kin'), seg: 'm13-kin' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm13-kin': {
      lines: [
        E('So Hrolf has set you the trials. Come in, sit, take the end of the bench nearest the fire. The far end belongs to the dead.'),
        C('The dead?'),
        E('Hrolf\'s father sat there, and after him Hjalti. Both wardens, both gone, both sorely missed. We leave the place for them out of habit, and out of something deeper than habit.'),
        E('The hold has lost a good many, {name}. Wardens, hunters, a smith or two. We are fewer each winter, and the ones who remain are stubborn out of necessity.'),
        C('And Hrolf?'),
        E('Hrolf is the last of his house who still wears the oath. He does not hand it lightly to anyone, so he asks for strength. It is the only thing a warden can be sure of.'),
        E('The trials are not cruelty. They are a way of saying, I will trust you with my back, but I need to see your shoulders first.'),
        E('Carry well, push well, and do not let him see you wince. He will notice, and then he will pretend he did not, which is his kind of mercy.'),
      ],
    },
    idle: { lines: [E('The bench is warm and the stew is thin. Between us, Hrolf cooks worse than he fights, and he knows it.')] },
  },
});

/** Widow of Hrolf's brother, at the camp below the den. */
export const WYNNE = buildTree({
  id: 'npc-wynne',
  start: [
    { when: step('r11', 'brief', 'widow'), seg: 'r11-widow' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'r11-widow': {
      lines: [
        { s: 'wynne', t: 'You are the one Hrolf trusts. I can tell by the way you stand, as if the ground might need holding down.' },
        { s: 'wynne', t: 'Hjalti went up in the spring and did not come down. I kept the fire lit for him a full season. Then I let it go out, and I have not forgiven myself for that either.' },
        { s: 'wynne', t: 'If you find the axe, bring it to Hrolf. If you find anything of Hjalti, tell me only what is true. I can bear true, and I cannot bear kind.' },
        { s: 'wynne', t: 'Mind the hounds on the ledges. They were the wyrm\'s before they were anyone\'s, and they have not forgotten how to guard.' },
      ],
    },
    idle: { lines: [{ s: 'wynne', t: 'The camp is quiet. That is the best I can say for it, and I say it often.' }] },
  },
});
