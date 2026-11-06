import { ACT4_INTERIOR_STRINGS_EN } from './harrowmark/act4/strings.en';
import { WASTE_INTERIOR_STRINGS_EN } from '../waste/interiors/strings.en';

export const INTERIOR_STRINGS_EN: Record<string, string> = {
  'interior.enter.vault': '{key} Descend into the vault',
  'interior.exit.vault': '{key} Climb to the chapel',
  'interior.enter.tilted-anvil': '{key} Enter the Tilted Anvil',
  'interior.exit.tilted-anvil': '{key} Step out onto Forge Row',
  'interior.enter.tilted-anvil-back': '{key} Enter the back room',
  'interior.exit.tilted-anvil-back': '{key} Go out to the Bastion yard',
  'interior.enter.keep-hall': '{key} Enter the audience hall',
  'interior.exit.keep-hall': '{key} Leave the Keep',
  'interior.enter.counting-house': '{key} Enter the Counting-House',
  'interior.exit.counting-house': '{key} Leave the Counting-House',
  'interior.enter.archive': '{key} Enter the Archive',
  'interior.exit.archive': '{key} Leave the Archive',
  'interior.enter.underways': '{key} Climb down into the Underways',
  'interior.exit.underways': '{key} Climb up to the street',
  'interior.m09.invoice': '{key} Copy the invoice',
  'interior.j11.grate.open': '{key} Unlock the grate',
  'interior.j11.grate.shut': '{key} Try the grate',
  'interior.j11.grate.refused': 'The grate is shut. It wants a Sewer Master Key.',
  'interior.refused.aggro': 'You cannot go while enemies are on you',
  'interior.refused.locked': 'The way is barred',
  ...ACT4_INTERIOR_STRINGS_EN,
  ...WASTE_INTERIOR_STRINGS_EN,
};
