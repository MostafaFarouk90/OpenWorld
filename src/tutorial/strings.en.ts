export const TUTORIAL_STRINGS_EN: Record<string, string> = {
  // start screen and shell
  'tutorial.start.title': 'Knighting Day',
  'tutorial.start.begin': 'Begin',
  'tutorial.start.veteran': 'I know action games',
  'tutorial.start.kettlewick': 'Skip to Kettlewick',
  'tutorial.start.hints': 'Show hints always',
  'tutorial.skip.hint': 'Hold Esc to skip this beat',
  'tutorial.toast.open': 'Brightwater is open',
  'tutorial.toast.skipped': 'Beat skipped',
  'tutorial.toast.restart': 'The Heartshard pulls you back',
  'tutorial.carry.drop': 'Block to set the villager down',
  'tutorial.t13.passive': 'Your new skill wakes in your next fight',
  'tutorial.kneel.prompt': 'Hold {key} to kneel',
  'tutorial.board.prompt': 'Press {key} to train again',
  'cutscene.knighting': 'The knighting',
  'cutscene.crack': 'The Sunforge cracks',

  // replay board
  'tutorial.replay.title': 'Training board',
  'tutorial.replay.attacks': 'Strikes and chains',
  'tutorial.replay.block': 'Blocking',
  'tutorial.replay.dodge': 'Dodging',
  'tutorial.replay.lockon': 'Locking on',
  'tutorial.replay.close': 'Leave the board',
  'tutorial.replay.done': 'Well drilled',

  // prompts
  'tutorial.prompt.move': 'Press {key} to walk',
  'tutorial.prompt.look': 'Move the mouse to look about',
  'tutorial.prompt.attack1': 'Press {key} to strike the scarecrow',
  'tutorial.prompt.attack1.wraith': 'Press {key} to strike the wraiths',
  'tutorial.prompt.interact': 'Press {key} to speak or use',
  'tutorial.prompt.sprint': 'Hold {key} to run',
  'tutorial.prompt.jump': 'Press {key} to leap',
  'tutorial.prompt.attack2': 'Press {key} for the diagonal slice',
  'tutorial.prompt.attack3': 'Press {key} for the heavy chop',
  'tutorial.prompt.attack4': 'Press {key} for the stab',
  'tutorial.prompt.block': 'Hold {key} to block',
  'tutorial.prompt.dodge': 'Press {key} to dodge',
  'tutorial.prompt.lockOn': 'Press {key} to lock on',
  'tutorial.prompt.inventory': 'Press {key} to open your pack',
  'tutorial.prompt.journal': 'Press {key} to open your journal',
  'tutorial.prompt.skills': 'Press {key} to open your skills',
  'tutorial.prompt.ability': 'Press {key} to use your skill',
  'tutorial.prompt.map': 'Press {key} to open the map',
  'tutorial.prompt.fastTravel': 'Choose a lit waystone on the map to travel',
  'tutorial.prompt.surge': 'Press {key} to loose the Heartshard',
  'tutorial.prompt.rest': 'Press {key} at a waystone to rest',

  // subtitle lines
  'tutorial.line.t01.1': 'Sir Gaut: Up, lad! The scarecrow will not topple itself.',
  'tutorial.line.t02.1': 'Sir Gaut: Mark the chapel banners, one by one. A knight keeps his eyes open.',
  'tutorial.line.t05.1': 'Aelfreda: The shard has woken! Hold them off, squire.',
  'tutorial.line.t06.1': 'Sir Gaut: Run!',
  'tutorial.line.t08.1': 'Sir Gaut: The slice is fastest, the chop slower, the stab slowest. Mix them.',
  'tutorial.line.t15.1': 'Aelfreda: The shard leaves its mark on all it touches. Use it sparingly.',
};

const beatText: Record<string, [string, string, string]> = {
  t01: ['The Scarecrow', 'Gaut sets you to the practice yard.', 'Topple the scarecrow and reach the gate'],
  t02: ['Eyes Up', 'A knight learns to look.', 'Look at each chapel banner in turn'],
  t04: ['The Vow', 'Kneel in the chapel and take your vow.', 'Kneel at the chapel altar'],
  t05: ['The Heartshard', 'The Sunforge cracks and ash wraiths come.', 'Defeat the ash wraiths'],
  t06: ['Run', 'The chapel roof is falling.', 'Sprint down the lane'],
  t07: ['Over the Wall', 'The lane is blocked.', 'Jump the cart and the fence'],
  t08: ['Three Strikes', 'Gaut teaches the slice, chop and stab.', 'Land each strike, then chain four blows'],
  t09: ['The Shield', 'A blighted soldier swings his blade.', 'Block three swings'],
  t10: ['The Roll', 'The wraith sweeps low and cannot be blocked.', 'Dodge three sweeps'],
  t11: ['Lock On', 'Wraiths close on the square.', 'Lock on, swap targets, and fell two wraiths'],
  t13: ['A Knight\'s Skill', 'Your new level brings a new skill.', 'Learn a skill and put it to use'],
  t14: ['The Waystone', 'Light the chapel waystone and travel.', 'Rekindle the waystone, then fast travel'],
  t15: ['The Gate', 'The last wave stands at the gate.', 'Loose the Heartshard, clear the wave and rest'],
  skirmish: ['The Skirmish', 'A veteran proves their skill in the square.', 'Clear the square of foes'],
};
for (const [id, [title, summary, o1]] of Object.entries(beatText)) {
  TUTORIAL_STRINGS_EN[`tutorial.${id}.title`] = title;
  TUTORIAL_STRINGS_EN[`tutorial.${id}.summary`] = summary;
  TUTORIAL_STRINGS_EN[`tutorial.${id}.o1`] = o1;
}
