import { buildTree, type Line } from './build';
import { all, flagIs, objDone, objOpen, qActive, qDone, qIdle, step } from './cond';

const O = (t: string, fx?: Line['fx']): Line => (fx ? { s: 'osgar', t, fx } : { s: 'osgar', t });
const C2 = (t: string): Line => ({ s: 'cael', t });

const d03Report = (outcome: string) =>
  all(qActive('d03'), objDone('d03', 'testimony'), objOpen('d03', 'report'), flagIs('story.d03.outcome', outcome));

/** Reeve Osgar Thane of Cinderford. */
export const OSGAR = buildTree({
  id: 'npc-osgar',
  start: [
    { when: d03Report('spared'), seg: 'd03-report-spared' },
    { when: d03Report('defeated'), seg: 'd03-report-defeated' },
    { when: qActive('d03'), seg: 'd03-wait' },
    { when: all(qDone('m15'), qIdle('d03')), seg: 'd03-brief' },
    { when: step('m15', 'flight', 'report'), seg: 'm15-report' },
    { when: qActive('m15'), seg: 'm15-wait' },
    { when: all(qDone('m14'), qIdle('m15')), seg: 'm15-brief' },
    { when: all(qActive('m12'), objDone('m12', 'read'), objDone('m12', 'tend'), objDone('m12', 'carry'), objOpen('m12', 'report')), seg: 'm12-report' },
    { when: all(qActive('m12'), objDone('m12', 'raid'), objOpen('m12', 'report')), seg: 'm12-wounded' },
    { when: all(qActive('m12'), objDone('m12', 'prep'), objOpen('m12', 'raid')), seg: 'm12-ready' },
    { when: all(qActive('m12'), objOpen('m12', 'prep')), seg: 'm12-wait' },
    { when: all(qDone('m11'), qIdle('m12')), seg: 'm12-brief' },
    // Act 2 Phase D (A13, additive): the invitation from Deepgate arrives after Scorchhold falls
    { when: qActive('m16'), seg: 'm16-wait' },
    { when: all(qDone('d03'), qIdle('m16')), seg: 'm16-offer' },
    { when: all(), seg: 'idle' },
  ],
  segments: {
    'm16-offer': {
      lines: [
        O('A rider came through at dawn with a sealed letter, and it is for you. The green wax is House Grisel, the hand is Lord Aldous\'s own.'),
        O('He writes that he has heard of Scorchhold, and that Deepgate would see the Knight who brought a hunt-captain down. He offers an alliance, if the shard is more than a rumour.'),
        C2('An alliance with the House that holds the pass.'),
        O('With the House that holds the pass, and the mines, and the one forge in the north that has never gone cold. A man who says no to that had better have a very good reason.'),
        O('The pass is open now, since the fort fell. Ride it to Deepgate, and ask for the lord. The stewards at the gate will be nervous; they are always nervous.', [{ startQuest: 'm16' }]),
      ],
    },
    'm16-wait': { lines: [O('Deepgate, {name}. The pass road, the gate, the lord\'s forecourt. Go before the weather turns.')] },
    'd03-report-spared': {
      lines: [
        O('I heard it all, {name}. Redmane stood in my own hall and said it plainly, and he did not flinch. You were right to spare him, though I did not like it.'),
        O('A hired knife who talks is worth ten who die quiet. He named the buyer, the escrow and the factor. I wrote it down, and so did two witnesses.'),
        O('The Council\'s hand is in this. Not a rumour now, not a farmer\'s grumble. A black anvil on red wax, and a man called Aldous Grisel who signs for the cages.'),
        O('That seal means a good deal to a good many people, and none of it is good. It was on every bill of sale the hunters carried.'),
        O('I am a reeve, not a judge. But I know a buyer who hides behind a seal when I see one.'),
        O('I will keep Redmane under guard and send his word south with a rider I trust. That much I can do from here.'),
        O('Now the matter of you. The prisoners are out, the camp is broken, and the road is safer than it was. That is on you.'),
        O('Cinderford is not much, but it is mine, and you have kept it. I do not forget a debt like that.'),
        O('Take what the town purse can spare. It is not a fortune, but it is honest coin.'),
        O('Go and rest. When you are ready, there is more to do, and I will not insult you by pretending otherwise.'),
      ],
    },
    'd03-report-defeated': {
      lines: [
        O('Redmane is dead, then. I will not weep for a man who sold wyrmlings by the cage, but I would have liked to hear him say who paid.'),
        O('The papers speak instead. We found his strongbox in the keep. Orders, receipts, a ledger in a clerk\'s neat hand.'),
        O('The seal is the same on every page: a black anvil on red wax. And the name beneath it is Aldous Grisel.'),
        O('That is the Council\'s hand, {name}. Not a hand I can reach from Cinderford, but I can read what it wrote, and so can a lot of other people if I send copies.'),
        O('A dead hunter cannot be questioned, but a ledger does not lie once it has been copied three times and sealed in three places.'),
        O('I will see that happens. You did the hard part, and I only have to keep it dry.'),
        O('The prisoners are free, the camp is broken, and the road is safer than it was. That is on you.'),
        O('Cinderford is not much, but it is mine, and you have kept it. I do not forget a debt like that.'),
        O('Take what the town purse can spare. It is not a fortune, but it is honest coin.'),
        O('Go and rest. When you are ready, there is more to do, and I will not insult you by pretending otherwise.'),
      ],
    },
    'd03-wait': { lines: [O('The hunters are still holed up in Scorchhold, {name}. Go carefully and bring back whoever you can.')] },
    'd03-brief': {
      lines: [
        O('The hunters have fallen back to Scorchhold, the old keep on the burnt hill. They have cages there, and men, and a captain called Redmane.'),
        O('They know we are coming. A siege is a poor word for what we have, but it is the only word I can think of.'),
        O('I cannot take the walls with farmers. But I do not need to. A keep like that has a court and a yard, a perch for archers, and a gate that wants breaking.'),
        O('You take the court first. Harpooners stand in the yard behind it, and more perch above. Kill them in that order and the gate falls without a ram.'),
        O('There are prisoners inside. Cinderford folk, and others besides. Bring them out before anything else is burned.'),
        O('Redmane is the one I want, if he can be taken. Alive is better. I want the name of whoever pays him.'),
        O('But I will not tell you to spare a man who is swinging at you. Use your judgment, {name}. You have earned it.'),
        O('I will hold the camp and keep the lamps lit. Come back and tell me how it ends.', [{ startQuest: 'd03' }]),
      ],
    },
    'm15-report': {
      lines: [
        O('I saw it from the ridge. The wyrmling went up out of that cage like a spark from a forge, and then it was gone over the hills.'),
        O('I have spent my life reading weather and soil. I did not think to see a thing like that fly free. It is only a small wyrm, but it was the first I have seen up close.'),
        O('My hands shook. A fool thing for a reeve to say, but there it is.'),
        O('I thought the hunters were a nuisance, a few bad men with spears. I did not know they were taking creatures that think, and that look back.'),
        O('When I was a boy, my grandmother said the wyrms were a story told to keep children out of the high pastures. She was wrong, and so was I.'),
        O('So. Enough standing about. The carter is home, the cage is open, and a deserter has told us what he saw.'),
        O('That is more than the Council has done in a year. I mean to make sure it is written somewhere that cannot be burned.'),
        O('Thank you, {name}. Go and rest. You look worse than the wyrmling did.'),
        O('One more thing. The hunters will want revenge, and they will want it from Cinderford. I shall not let them have it.'),
        O('I am a farmer, and I do not like war. But I like my fields and my neighbours, and I will defend them to the last of my pitchforks.'),
        O('Take your reward. The purse is lighter than it was, but it is honest.'),
        O('Come back when you are ready. There will be more.'),
      ],
    },
    'm15-wait': { lines: [O('The pens above the town, {name}. Free the cage and the carter, and bring me word. I will be here.')] },
    'm15-brief': {
      lines: [
        O('My scouts have come down from the heights, and the news is bad. There is a hunters\' camp above Cinderford, with pens.'),
        O('They have cages of iron strap and green oak, big enough for something the size of a calf. I do not like to guess what is in them.'),
        O('A carter of ours is missing. Wulfric, a steady man. He drove feed up to the high pasture three weeks ago and never came back.'),
        O('I think the hunters took him. I do not think they know what to do with him, so he is probably alive.'),
        O('What I need is simple. Break the first pack that guards the pens. Take the keys. Free the carter, and open the cage.'),
        O('There is a hunter in there who may be a doubter. A man called Corwin. If he lives, I would hear what he has to say.'),
        O('This is not a thing for farmers. It wants someone who can fight and who can think while fighting.'),
        O('Will you do it, {name}? I will keep the barricade and pray that nothing falls on us while you are gone.', [{ startQuest: 'm15' }]),
      ],
    },
    'm12-report': {
      lines: [
        O('Thirty-one farmers stood on a roll this morning, and thirty-one answered it this evening. I did not think I would live to say that.'),
        O('The raid is broken. The wyrm is gone back up the hill, the carts are empty, and Brand is hoarse. We are not beaten.'),
        O('Mother Maud tells me the wounded will mend, and the sleepers are quiet. That is more than I hoped.'),
        O('Here, from the town purse: two hundred gold. It is nearly all we have. I would give you the rest if there were any.'),
      ],
    },
    'm12-wounded': { lines: [O('See to the wounded first, {name}. Mother Maud has her hands full. Come back to me when they are tended.')] },
    'm12-ready': {
      lines: [
        O('The wyrm is on the hill, and it is watching. It is waiting for dark, I think, or for us to lose our nerve.'),
        O('Hold the line. We hold, we do not run, and we do not break for the carts. Whatever comes down, it meets spears first.'),
      ],
    },
    'm12-wait': { lines: [O('Three jobs on the barricade, {name}: the stakes, the pitch and the carts. Do them in any order, but do them before dark.')] },
    'm12-brief': {
      lines: [
        O('So you got here. Good. Cinderford is not much, but it is mine, and tonight it needs more than I can give it.'),
        O('A raid is coming down the hill. I have seen the smoke and counted the tracks. Wyrm, hunters, or both. I do not care which, it is the same to a thatched roof.'),
        O('I have thirty-one farmers on a roll. Brand drills them in the evenings, and they are better than they were. They are not soldiers.'),
        O('The barricade is half built, the bridge is narrow, and the mill is stone. Those are the places a raid will push.'),
        O('We have brazier carts, pitch and coals for them, and a few good bows. That is all.'),
        O('You do not need to be told that this is dangerous. I only ask that you do it where it counts.'),
        O('Three posts need a steady hand: the barricade, the bridge and the mill. Brand needs one more man at one of them.'),
        {
          s: 'osgar',
          t: 'Where will you stand, {name}?',
          choices: [
            { id: 'barricade', t: 'The barricade. I will meet them head on.', go: 'm12-brief-end', fx: [{ setFlag: 'story.m12.station', value: 'barricade' }] },
            { id: 'bridge', t: 'The bridge. A narrow place is easy to hold.', go: 'm12-brief-end', fx: [{ setFlag: 'story.m12.station', value: 'bridge' }] },
            { id: 'mill', t: 'The mill. Stone walls will last longest.', go: 'm12-brief-end', fx: [{ setFlag: 'story.m12.station', value: 'mill' }] },
          ],
        },
      ],
    },
    'm12-brief-end': {
      lines: [
        O('Aye, that will serve. Wherever you stand, you will be needed. I have never known a post that did not need one more pair of hands.'),
        O('Read the roll, tend the wounded, carry what Brand tells you. Then the raid. I will see you when it is done.', [{ startQuest: 'm12' }]),
      ],
    },
    idle: {
      lines: [
        O('Reeve duties do not stop for a war. Somebody must count the grain, and somebody must tell the widow where the cart went.'),
        O('If you need me, I am here. If I am not here, I am in the field, and the field is where most of my thinking gets done.'),
      ],
    },
  },
});
