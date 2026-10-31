import { buildTree, type BuiltTree } from '../../act2/build';
import { all } from '../../act2/cond';
import { C, at, voice } from './common';

// The net-rigger and the handler at Skyhold (M33, six and four lines), the captive hunter in the keep (D06, six), and the bound Skarl and his two
// escorts (one line each; the staging is the director's).

const tree = (npc: string, rules: Array<[ReturnType<typeof at>, string]>, segments: Parameters<typeof buildTree>[0]['segments']): BuiltTree =>
  buildTree({ id: `npc-${npc}`, start: [...rules.map(([when, seg]) => ({ when, seg })), { when: all(), seg: 'idle' }], segments });

const R = voice('skyhold-rigger');
export const RIGGER = tree('skyhold-rigger', [[at('m33', 'rigger'), 'm33-talk']], {
  'm33-talk': { lines: [
    R('Go easy. I do not carry a weapon, and I have never wanted to. I tie knots. It is a trade.'),
    C('You tied the net.'),
    R('I did. I did not ask what it was for until the first wyrmling came down in it. It cried like a child.'),
    R('The anchors are ropes round iron stakes. Cut them at the stake, not the net, or the whole span will drop on whoever is under it.'),
    R('The hunters on the spur do not like me, and I do not like them. I will not stop you. I will not help you either.'),
    R('Search the camp if you want to know who is paying. The seal is on everything. I am sorry I never looked.'),
  ] },
  idle: { lines: [R('I am not a soldier. I tie knots. Let me do it quietly.')] },
});

const HA = voice('skyhold-handler');
export const HANDLER = tree('skyhold-handler', [[at('m33', 'handler'), 'm33-talk']], {
  'm33-talk': { lines: [
    HA('You cut the last one. I felt the rope go slack, and the net fell. I could not move my arms for the weight of it.'),
    C('Are you hurt?'),
    HA('Bruised. The wyrmlings are not. They are above the spur, huddled. The net is down, so now they can fly.'),
    HA('Cut it, knight. They have been under that rope for a week. They have forgotten what the sky is.'),
  ] },
  idle: { lines: [HA('The little ones will want to fly as soon as the net is down. Let them.')] },
});

const CA = voice('captive-hunter');
export const CAPTIVE = tree('captive-hunter', [[at('d06', 'captive'), 'd06-talk']], {
  'd06-talk': { lines: [
    CA('You came by air. I heard the wind. Nobody comes by air except the dragons, and they do not knock.'),
    C('I am a knight. Thorgar sent me. Who are you?'),
    CA('A hunter of the Aerie. I told the Marshal the drake was starving, and he put me in his cell for a week to think on it.'),
    CA('His orders are on the desk in the study. The buyer\'s ledger is on the map table. Vey\'s letter is behind the study, in the far wall. Read them.'),
    CA('The courtyard has a winch, and a gate behind it. Turn it, and the hunters in the yard will come out with their spears. Mind the walls.'),
    CA('When you meet him, do not take his word for anything. He will say he is the last honest man on the mountain, and he will believe it.'),
  ] },
  idle: { lines: [CA('I will wait here. I have waited longer for less.')] },
});

const SK = voice('skarl-led');
export const SKARL_LED = tree('skarl-led', [], { idle: { lines: [SK('I will walk. I am not carried.')] } });
const ES1 = voice('aerie-escort-1');
export const ESCORT_1 = tree('aerie-escort-1', [], { idle: { lines: [ES1('We take him down by the gate road. It is longer, and it is safer.')] } });
const ES2 = voice('aerie-escort-2');
export const ESCORT_2 = tree('aerie-escort-2', [], { idle: { lines: [ES2('Keep your distance, knight. He is quiet, but he is not harmless.')] } });

export const SUMMIT_MINOR_TREES: BuiltTree[] = [RIGGER, HANDLER, CAPTIVE, SKARL_LED, ESCORT_1, ESCORT_2];
