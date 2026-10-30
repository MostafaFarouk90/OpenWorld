import { act3BarkStrings } from './act3/strings.en';
/** Sister Aelfreda's companion strings (thread A5; invented lines, logged in design/changes-applied.md). */
export const AELFREDA_STRINGS_EN: Record<string, string> = {
  // Act 3 (K5): the Greyfen, the Dragonspine, the trial, the reveal and the ferry (src/companions/act3/strings.en.ts).
  ...act3BarkStrings('aelfreda'),
  'companion.aelfreda.name': 'Sister Aelfreda',
  'companion.aelfreda.calming-flame.name': 'Calming flame',

  // Design 8.1: "deadpan and wise, relentlessly practical about stew".
  'companion.aelfreda.bark.combatStart.1': 'Try not to bleed on the onions.',
  'companion.aelfreda.bark.combatStart.2': 'I will pray for them. Afterwards. Go on.',
  'companion.aelfreda.bark.combatStart.3': 'Mind your footing. I am not carrying you and the pot.',
  'companion.aelfreda.bark.combatEnd.1': 'Sit. Let me look at you. Hm. You will live, which is more than the stew will.',
  'companion.aelfreda.bark.combatEnd.2': 'The Hearth keeps us both. Mostly it keeps you. Hold still.',
  'companion.aelfreda.bark.combatEnd.3': 'That was loud. Stew is quiet. I prefer stew.',
  'companion.aelfreda.bark.elapsed.1': 'A good stew wants three things: patience, salt and nobody asking when it will be ready.',
  'companion.aelfreda.bark.elapsed.2': 'The shard in your chest burns like a banked hearth. Do not stir it more than you must.',
  'companion.aelfreda.bark.elapsed.3': 'If we find wild garlic, we stop. That is not a request.',
  'companion.aelfreda.bark.elapsed.4': 'Scars are the shard\'s receipts. Spend wisely and you keep more of yourself.',
  'companion.aelfreda.bark.elapsed.5': 'I have buried braver men than you. Be less brave and more careful.',
  'companion.aelfreda.bark.area.harrowmark.1': 'So many chimneys and not one of them smells of a decent broth.',
  'companion.aelfreda.bark.area.tiltedAnvil.1': 'Aldith salts with a heavy hand. I have told her. She has told me where to go.',
  'companion.aelfreda.bark.area.cinderreach.1': 'Ash in the wind, ash in the bread. These people need a priest and a better oven.',
  'companion.aelfreda.bark.area.cinderreach.2': 'The blight takes the herbs first. Then the goats. Then the hope. We start with the herbs.',
  'companion.aelfreda.bark.area.oldsmoke.1': 'No hearth burns clean this far down. Breathe through your sleeve.',
  'companion.aelfreda.bark.area.oldsmoke.2': 'Miners eat standing up. It is the saddest thing I know.',
  'companion.aelfreda.bark.area.dell.1': 'The Forge\'s smallest keepers. Kneel. Slowly. They are older than the chapel.',

  // The Hearth Rite (design 8.2): once per act, removes one Scar.
  'companion.aelfreda.rite.done': 'The Hearth Rite: one Scar removed.',
};
