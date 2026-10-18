// English dialogue strings. Keys: dialogue.<dialogueId>.<nodeId> and
// dialogue.<dialogueId>.<nodeId>.<choiceId>. The player's name is always {name}.
export const dialogueStrings: Record<string, string> = {
  // ---- Marshal Stane ----
  'dialogue.npc-stane.wave': 'Ho there, {name}! Good to see you walking Kettlewick lane with your head up.',
  'dialogue.npc-stane.wave2': 'Come by the Practice Yard when you have a moment. I am putting up a drill board, and every move you learn can be tried out on it.',
  'dialogue.npc-stane.wave3': 'I will be there, Marshal. Save me a dummy.',
  'dialogue.npc-stane.idle': 'Keep your guard up and your feet light, {name}. The Yard is open to anyone who wants to work.',

  // ---- Sister Aelfreda ----
  'dialogue.npc-aelfreda.shard': 'The Heartshard leaves marks on the air around you, {name}, like heat shimmering over a summer road.',
  'dialogue.npc-aelfreda.shard2': 'The ash wraiths can feel it. Steady hands and slow breaths, and come back to the chapel if you need rest.',
  'dialogue.npc-aelfreda.idle': 'The brazier is lit and the stew is on, {name}. Come in out of the wind whenever you like.',

  // ---- Sir Gaut ----
  'dialogue.npc-gaut.brief-cold': '{name}. I vouched for you before the whole Halvard household, so give them no reason to doubt me.',
  'dialogue.npc-gaut.brief-warm': '{name}, well met. I hoped you would come to me first, and I am glad of it.',
  'dialogue.npc-gaut.brief-1': 'Ash wraiths are drifting up the lanes of Kettlewick, born of the Sunforge crack. Cut down five of them.',
  'dialogue.npc-gaut.brief-2': 'Some villagers are frozen with fright. Lift them with F and carry three to the chapel door, where Sister Aelfreda keeps the hearth.',
  'dialogue.npc-gaut.brief-2.ready': 'Five wraiths, three villagers. I will not fail you.',
  'dialogue.npc-gaut.brief-2.where': 'Where will I find the villagers?',
  'dialogue.npc-gaut.brief-where': 'Listen for their calls in the lanes. A frightened soul rarely hides well, and the wraiths gather where the fear is.',
  'dialogue.npc-gaut.brief-end': 'Then go. Keep your shield high and your heart higher.',
  'dialogue.npc-gaut.remind': 'Five wraiths, three villagers carried to the chapel door, and then come and tell me. Shield up, {name}.',
  'dialogue.npc-gaut.report': 'Five wraiths down and three souls safe at the chapel door. That is a fine morning\'s work.',
  'dialogue.npc-gaut.report-2': 'Taking you on again cost me something in this realm, {name}. After today, I would pay it twice.',
  'dialogue.npc-gaut.report-3': 'Take my spare blade. It has served me well, and I think it will serve you better.',
  'dialogue.npc-gaut.idle-cold': 'Hold your head up, {name}. Trust comes back one honest deed at a time.',
  'dialogue.npc-gaut.idle-warm': 'Well met, {name}. The Halvard name sits easier on you every day.',
  'dialogue.npc-gaut.idle': 'The chapel door is open, {name}. Stay sharp and stay kind.',

  // ---- Edda ----
  'dialogue.npc-edda.gift': '{name}! Come here and let me look at you. You are thinner than you were at harvest.',
  'dialogue.npc-edda.gift-2': 'Here is a loaf of Hearth Bread, still warm from the oven, and my old luck token. Put them in your pack.',
  'dialogue.npc-edda.gift-3': 'I touched the family hearth-stone for you this morning. It stays on the bakery hearth where it belongs, and its blessing goes with you.',
  'dialogue.npc-edda.gift-4': 'Thank you, Mother. I will bring the bread home in one piece, or at least in a few good pieces.',

  'dialogue.npc-edda.bakery': 'Sir Gaut left a spare Halvard tabard and the Squire\'s Arming Sword for you. Open your pack with I and put them on.',
  'dialogue.npc-edda.bakery-2': 'There is a healing flask by the barrel too. Drink it. A flask taken before trouble does more good than one saved for after.',
  'dialogue.npc-edda.bakery-3': 'Then open your quest log. Ash wraiths have been seen in the lanes, and Sir Gaut will want your help.',
  'dialogue.npc-edda.bakery-4': 'Yes, Mother. I will go out dressed like a proper Halvard squire.',

  'dialogue.npc-edda.offer': 'The wraiths have left the lane, {name}, but the bakery is still smoking.',
  'dialogue.npc-edda.offer-2': 'The Brannoc hearth-stone is still on the hearth, and the heat is too fierce for my old hands. Will you fetch it for me?',
  'dialogue.npc-edda.offer-2.accept': 'Leave it to me, Mother.',
  'dialogue.npc-edda.offer-2.later': 'Not yet. Let me see the lane safe first.',
  'dialogue.npc-edda.offer-yes': 'Mind the embers. That stone has warmed four generations of Brannocs, and I would like it to warm a fifth.',
  'dialogue.npc-edda.offer-later': 'Then go gently, and come back to me when you are ready.',
  'dialogue.npc-edda.fetch-reminder': 'The stone is waiting on the bakery hearth, {name}. Mind the heat, and mind your boots.',

  'dialogue.npc-edda.disgrace': 'You brought it home. Oh, {name}. Sit with me a moment, the bread can wait.',
  'dialogue.npc-edda.disgrace-2': 'Two years ago you stood in front of the Regent\'s men and refused to burn the Kettlewick granary. I have never told you what that looked like from the lane.',
  'dialogue.npc-edda.hub': 'Ask me what you like. I would rather you heard it from me.',
  'dialogue.npc-edda.hub.why': 'Why did you stand them down?',
  'dialogue.npc-edda.hub.regent': 'Did the Regent punish you?',
  'dialogue.npc-edda.hub.gaut': 'Why did Sir Gaut take me back?',
  'dialogue.npc-edda.hub.leave': 'That is enough for today, Mother.',

  'dialogue.npc-edda.why-1': 'When you were stripped of your rank, half the village wanted to storm the reeve\'s hall. I climbed on a flour cart and told them to put down their forks.',
  'dialogue.npc-edda.why-2': 'You had refused to burn our winter grain. I was not going to let anyone burn something worse because of it.',
  'dialogue.npc-edda.why-cael-earnest': 'You did more for Kettlewick that day than any sword of mine could have. I will carry that.',
  'dialogue.npc-edda.why-cael-wry': 'So the baker held the line while the squire got sent home. I should have taken lessons from you sooner.',
  'dialogue.npc-edda.why-cael-humble': 'I did not know. Thank you for holding them back, Mother. I only did what I could not live with undoing.',

  'dialogue.npc-edda.regent-1': 'He doubled the bakery\'s tax and sent a clerk to count every sack in the cellar. It was a hard winter.',
  'dialogue.npc-edda.regent-2': 'But the neighbours left loaves on our step before dawn, and nobody ever said who. We ate well enough.',
  'dialogue.npc-edda.regent-cael-earnest': 'Then it was worth it. Kettlewick kept its grain, and I will keep that promise.',
  'dialogue.npc-edda.regent-cael-wry': 'A double tax, and still the best-fed family in the lane. The Regent should hire you as his quartermaster.',
  'dialogue.npc-edda.regent-cael-humble': 'I am sorry it fell on you. I will make it right, whatever it takes.',

  'dialogue.npc-edda.gaut-1': 'Sir Gaut came to this very door the week after. He stood in the flour dust in his good boots and asked if you could ride with him.',
  'dialogue.npc-edda.gaut-2': 'The other Halvards muttered about it. He said an oath is only worth keeping if it costs something.',
  'dialogue.npc-edda.gaut-cael-earnest': 'Then I owe him everything, and I mean to repay it with my deeds.',
  'dialogue.npc-edda.gaut-cael-wry': 'I knew he was stubborn. I did not know he was also reckless enough to bet on me.',
  'dialogue.npc-edda.gaut-cael-humble': 'I do not feel I deserve that much faith, but I will try to.',

  'dialogue.npc-edda.farewell': 'Go on, then. The stone sits warm at last, and so do I. Come back for supper.',
  'dialogue.npc-edda.idle': 'The oven is warm and the door is open, {name}. Come home when you can.',

  // ---- T04 vow ----
  'dialogue.t04-vow.entry': 'Kneel, {name}. The Kindling Ember waits in the brazier, carried from the Sunforge for every knighting in Valdren.',
  'dialogue.t04-vow.gaut-rite': 'Three vows, as the old rite asks. Speak them in your own words, and speak them true.',
  'dialogue.t04-vow.vow1': 'The first is the vow of the oath. What do you swear?',
  'dialogue.t04-vow.vow1.earnest': 'I swear to guard the weak with everything I have.',
  'dialogue.t04-vow.vow1.wry': 'I swear to guard the weak, and to try not to set anything important on fire.',
  'dialogue.t04-vow.vow1.humble': 'I swear to try, and to keep trying on the days I fail.',
  'dialogue.t04-vow.vow2': 'The second is the vow of duty. What do you owe?',
  'dialogue.t04-vow.vow2.earnest': 'I owe Valdren my sword and my honest word.',
  'dialogue.t04-vow.vow2.wry': 'I owe Valdren a good day\'s work, and Sir Gaut a very long apology.',
  'dialogue.t04-vow.vow2.humble': 'I owe more than I can pay, but I will start today.',
  'dialogue.t04-vow.vow3': 'The third is the promise you carry past this chapel. What do you promise?',
  'dialogue.t04-vow.vow3.earnest': 'I promise to come back for anyone I have to leave behind.',
  'dialogue.t04-vow.vow3.wry': 'I promise to keep my promises, even the awkward ones.',
  'dialogue.t04-vow.vow3.humble': 'I promise to listen before I act.',
  'dialogue.t04-vow.tone-earnest': 'A bright and steady vow. May the Hearth keep your word as firmly as you keep it.',
  'dialogue.t04-vow.tone-wry': 'A vow with a smile in it, and the Hearth likes a smile. May you keep your humour on the long road.',
  'dialogue.t04-vow.tone-humble': 'A quiet vow, and the quiet ones tend to hold. May the Hearth lend you strength on the days you lack it.',
  'dialogue.t04-vow.lit': 'Rise, {name}. The Kindling Ember is lit, and the Hearth keeps you.',

  // ---- villager barks (used when a villager is picked up) ----
  'dialogue.bark.villager1': 'Oh, thank the Hearth! Please, the chapel is just up the hill.',
  'dialogue.bark.villager2': 'I can feel my legs again, but do not set me down until we are safe!',
  'dialogue.bark.villager3': 'You are a Halvard squire, aren\'t you? Bless you, then, whatever the gossips say.',
};

/** Fallback speaker names for tests; the real names live in thread 4's `npc.<id>.name`. */
export const npcNameFallbackStrings: Record<string, string> = {
  'npc.gaut.name': 'Sir Gaut',
  'npc.edda.name': 'Edda Brannoc',
  'npc.stane.name': 'Marshal Stane',
  'npc.aelfreda.name': 'Sister Aelfreda',
  'npc.cael.name': '{name}',
};
