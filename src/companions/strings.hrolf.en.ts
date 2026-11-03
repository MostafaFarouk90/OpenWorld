import { act3BarkStrings } from './act3/strings.en';
/** Hrolf Ironbrow's companion strings (thread A5; invented lines, logged in design/changes-applied.md). */
export const HROLF_STRINGS_EN: Record<string, string> = {
  // Act 3 (K5): the Greyfen, the Dragonspine, the trial, the reveal and the ferry (src/companions/act3/strings.en.ts).
  ...act3BarkStrings('hrolf'),
  'companion.hrolf.name': 'Hrolf Ironbrow',
  'companion.hrolf.stonehide.name': 'Stonehide',

  // Design 8.1: "tries to bribe monsters with food".
  'companion.hrolf.bark.combatStart.1': 'Wait! I have half a mutton pie. No? Then we do this the hard way.',
  'companion.hrolf.bark.combatStart.2': 'Here, beast, a good black sausage. Take it and go home. ...Fine.',
  'companion.hrolf.bark.combatStart.3': 'I offered them cheese. Remember that, little knight. I always offer cheese first.',
  'companion.hrolf.bark.combatStart.4': 'Stand behind me. I am wider than you.',
  'companion.hrolf.bark.combatEnd.1': 'They did not want the pie. Their loss. More pie for us.',
  'companion.hrolf.bark.combatEnd.2': 'Breathe. Count your fingers. All ten? Good. Onward.',
  'companion.hrolf.bark.combatEnd.3': 'You fought well. I only leaned on them a little.',
  'companion.hrolf.bark.elapsed.1': 'In Stonefold we say a full belly makes a short war. We say it a lot. We are often hungry.',
  'companion.hrolf.bark.elapsed.2': 'My brother could walk three days on one oatcake. I cannot. Do you have an oatcake?',
  'companion.hrolf.bark.elapsed.3': 'The hills are quiet. I do not trust quiet hills. Loud hills, you know where you stand.',
  'companion.hrolf.bark.elapsed.4': 'A Warden keeps the line. Today the line is you. Do not wander off it.',
  'companion.hrolf.bark.elapsed.5': 'I once fed a wolf my own supper so it would let the sheep be. Best trade I ever made.',
  'companion.hrolf.bark.area.harrowmark.1': 'So many walls, and nobody inside them knows a single goat by name.',
  'companion.hrolf.bark.area.tiltedAnvil.1': 'A hearth and a full pot. Leave me here a week and I will be a happy man.',
  'companion.hrolf.bark.area.cinderreach.1': 'Smell that? Ash and heather. That is home, little knight.',
  'companion.hrolf.bark.area.cinderreach.2': 'The seams glow brighter every year. The hills are angry, and so am I.',
  'companion.hrolf.bark.area.oldsmoke.1': 'Grisel digs deep and pays shallow. Every miner here knows it.',
  'companion.hrolf.bark.area.oldsmoke.2': 'Too much rock above my head. Keep talking, little knight, so I forget it.',
  'companion.hrolf.bark.area.dell.1': 'The little fire-foxes. My mother left them crusts. They never ate them. Polite foxes.',
  // R11 at the wyrm den, by how it ended (story.r11.choice).
  'companion.hrolf.bark.area.den.spared.1': 'The wyrm lives, and so does my brother\'s name. He would have liked that better than a trophy.',
  'companion.hrolf.bark.area.den.spared.2': 'I keep listening for wings. Not afraid. Hoping, I think.',
  'companion.hrolf.bark.area.den.slain.1': 'The axe is heavy today. It was never heavy when he carried it.',
  'companion.hrolf.bark.area.den.slain.2': 'Done is done. I will not come back here. Walk on, little knight.',
};
