const C = 'dialogue.scene-act1-camp.';
const G = 'dialogue.npc-gaut.';
const S = 'dialogue.npc-stane.';
const PE = 'dialogue.npc-pennard.';
const A = 'dialogue.npc-ashdown.';

export const dialogueStringsHmC: Record<string, string> = {
  // ---- camp scene ----
  [C + 'c1']: 'There. The hounds are quiet, the fire is warm, and nobody has asked me for a song in an hour. Sit, sit. I will fix that last part in a moment.',
  [C + 'c2']: 'It is the first night in weeks I have not heard a hound howl. I could sleep where I sit.',
  [C + 'gate-stealth']: 'Still cannot believe you slipped past the South Gate without one guard turning his head. I have watched thieves for years and I would hire you.',
  [C + 'gate-bribe']: 'You paid the gate and walked in through the front. Not my road, but a purse has opened more doors than a blade ever did.',
  [C + 'gate-persuasion']: 'You talked the South Gate open with nothing but your tongue. I had my doubts about that. I have fewer now.',
  [C + 'prior-released']: 'And the Prior! Released, not broken. I am writing a verse about a man who knelt in his own vault for a hundred years and got to stand up at last.',
  [C + 'prior-defeated']: 'The Prior is down and the vault is still. He gave you no choice, and the town sleeps easier for it.',
  [C + 'prior-rumour']: 'They talk in the taverns of an ashen man who prays under the chapel. Talk is all it is, for now. Leave the vault shut until you are ready.',
  [C + 'grim-released']: 'Old Grimtooth walked back into the dark on his own feet. I did not think a stone could be shown that kind of mercy.',
  [C + 'grim-defeated']: 'Gaffer Grimtooth, finished in the Underways. I will not sing that one at supper. Some songs are for the morning after.',
  [C + 'steward-expose']: 'The Oswin steward stands in the open now, with his own ledgers read aloud. A true thing, spoken plainly. That is justice enough for me.',
  [C + 'steward-shield']: 'You kept that steward out of the light. I cannot say I like it, but I know you weighed it, and that counts for something.',
  [C + 'debt-forgiven']: 'Aldith struck the debt from her book. A whole inn forgave a stranger for a roof. I will drink to that, twice.',
  [C + 'debt-collected']: 'Aldith took what she was owed, to the last coin. Fair is fair, and she never pretended otherwise.',
  [C + 'notes']: 'Here is a tune my mother hummed. It is not much, and it only has the one sad note, but the fire seems to like it. Hush now, and listen.',
  [C + 'oath']: 'Whatever the city makes of us, the oath still holds. I swore it to the road, and the road brought me here, to this fire.',
  [C + 'respect']: 'I came to test a stranger with a cursed light in his chest. I stay to follow a friend who proved me wrong. That is all I will say about it.',
  [C + 'smoke']: 'Quiet, all of you. Look south. That is a column of smoke, standing straight up over Harrowmark.',
  [C + 'bells']: 'And the king\'s bells. They ring the hour, but out of order, as if frightened hands are pulling the ropes.',
  [C + 'end']: 'Then the quiet night is over. Whatever burns in Harrowmark, we go and meet it together.',

  // ---- Sir Gaut ----
  [G + 'm06-gate-wait']: 'This is Rook\'s gate to open, not mine. Bribe it or sneak past it, I will not break the Regent\'s peace. I will be here when you are through.',
  [G + 'trainer-closed']: 'I train knights in the Bastion yard, but Aldith\'s back room must open first. Settle her errand, then come and find me.',
  [G + 'trainer-open']: 'The Knight keeps his shield high and his word higher. Guard first, strike second, and never leave the one behind you to the wolves.',
  [G + 'trainer-open-2']: 'The oath is steady, so the stance is steady. Speak to me when you wish to take it up.',

  // ---- Marshal Stane ----
  [S + 'trainer-closed']: 'The Warden\'s drill is not for just anyone. Aldith\'s back room opens the yard to you. Come back when it does.',
  [S + 'trainer-open']: 'A Warden holds a line. Parry the blow, break the guard in front of you, and let nothing past you but the wind.',
  [S + 'trainer-open-2']: 'Patience wins here. Choose the Warden\'s way and I will teach you to stand like a wall.',

  // ---- Magister Pennard ----
  [PE + 'trainer-closed']: 'Ah, a would-be emberwright! Please do not touch the rack. The yard is closed to the unlettered until Mistress Aldith opens her back room, so come back after that.',
  [PE + 'trainer-open']: 'Ember craft is not mere fire, you understand. It is fire with manners. A Burn is controlled, measured, and never, ever on the furniture.',
  [PE + 'trainer-open-2']: 'If you wish to study the spells properly, say so. I have a very good chalk and very little patience.',
  [PE + 'idle']: 'Magister Pennard, Emberwright. Do mind the sleeves. They are singed enough already.',

  // ---- Archer-Sergeant Ashdown ----
  [A + 'trainer-closed']: 'Yard is closed to you. Aldith\'s back room first. Then come back.',
  [A + 'trainer-open']: 'Pathfinder. Crossbow, traps, distance. Hit them before they reach you.',
  [A + 'trainer-open-2']: 'A good trap is worth three bolts. Say the word and I will show you.',
  [A + 'idle']: 'Ashdown. Archer-Sergeant. State your business.',
  [A + 'idle-2']: 'Bolts are for sale if you need them. Fair price.',
  'dialogue.npc-gaut.trainer-open-2.train': "Train with me.",
  'dialogue.npc-gaut.trainer-open-2.leave': "Not now.",
  'dialogue.npc-stane.trainer-open-2.train': "Train with me.",
  'dialogue.npc-stane.trainer-open-2.leave': "Not now.",
  'dialogue.npc-pennard.trainer-open-2.train': "Train with me.",
  'dialogue.npc-pennard.trainer-open-2.leave': "Not now.",
  'dialogue.npc-ashdown.trainer-open-2.train': "Train with me.",
  'dialogue.npc-ashdown.trainer-open-2.leave': "Not now.",
};
