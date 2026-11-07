// Interactable props of the Rim quests; each is live only while its objective is current. Prompt keys are
// `quest.prompt.a5r.<name>`, so they never share a key with another block's table.
import type { QuestPropSpec } from '../../../props';
import { Q, STAIR } from './ids';
import { M47_BRAZIER, M47_BRAZIER_LIT, M47_LAMP, M47_LAMP_LIT, M47_RIM_GATE_OPEN, M47_WINCH, M47_WINCH_ANCHOR } from './m47.quest';
import { M48_LEVER, M48_LEVER_PULLED, M48_WHEEL, M48_WHEEL_ANCHOR } from './m48.quest';
import {
  M49_BANNER, M49_BANNER_RAISED, M49_HOUSES, M49_POST, M49_POST_SET, M49_POSTS, M49_SIGNAL, M49_TABLE, NO_HOUSE_WON, delegateWon,
} from './m49.quest';
import { R26_AT_HALT, R26_BRAKE, R26_BRAKED, R26_LOAD, R26_LOADED, R26_UNLOAD, R26_UNLOADED } from './r26.quest';
import { R29_HANG, R29_STRIKE } from './r29.quest';
import { M50_CHANNELS, M50_WHEEL, M50_WHEEL_ANCHOR } from './m50.quest';
import { M51_CALL, M51_DRAGONS, M51_REPORT, M51_TALK } from './m51.quest';

/** M49's three posts and the signal are lit once; R29's strike and M50's wheels are pressed many times (no used flag). */
export const M49_SIGNAL_LIT = 'story.m49.signal';
export const R29_HUNG = 'story.r29.hung';

const p = (name: string, interactableId: string, anchorId: string, objective: [string, string], usedFlag?: string, extra: Partial<QuestPropSpec> = {}): QuestPropSpec =>
  ({ interactableId, anchorId, promptKey: `quest.prompt.a5r.${name}`, objective, ...(usedFlag ? { usedFlag } : {}), priority: 1, ...extra });

export const RIM_A5_PROPS: QuestPropSpec[] = [
  // M47: the winch (its used flag is v0.9's gate flag), the stokers' brazier, the gatehouse lamp
  p('winch', M47_WINCH, M47_WINCH_ANCHOR, ['m47', 'winch'], M47_RIM_GATE_OPEN),
  p('brazier', M47_BRAZIER, `${Q}.m47.brazier`, ['m47', 'brazier'], M47_BRAZIER_LIT, { look: 'brazier' }),
  p('lamp', M47_LAMP, `${Q}.m47.lamp`, ['m47', 'lamp'], M47_LAMP_LIT, { look: 'brazier', lookOnlyUsed: true }),
  // M48: the four vent wheels (live on their step; the director offers a real vent's wheel again until its channel is crossed) and the two gantry levers
  ...[1, 2, 3, 4].map((v) => p('wheel', M48_WHEEL(v), M48_WHEEL_ANCHOR(v), ['m48', `vent${v}`], undefined, { look: 'stake' })),
  ...[1, 2].map((l) => p('lever', M48_LEVER(l), `${STAIR}.lever.${l}`, ['m48', `lever${l}`], M48_LEVER_PULLED(l), { look: 'stake' })),
  // M49: the signal fire, the banners (a won House each, the camp's own when none was won), the war table, the three posts
  p('signal', M49_SIGNAL, `${Q}.m49.signal`, ['m49', 'signal'], M49_SIGNAL_LIT, { look: 'brazier', lookOnlyUsed: true }),
  ...M49_HOUSES.map((h) => p('banner', M49_BANNER(h), `${Q}.m49.banner.${h}`, ['m49', 'banners'], M49_BANNER_RAISED(h), { when: delegateWon(h), look: 'stake', lookOnlyUsed: true })),
  p('banner', M49_BANNER('camp'), `${Q}.m49.banner.camp`, ['m49', 'banners'], M49_BANNER_RAISED('camp'), { when: NO_HOUSE_WON, look: 'stake', lookOnlyUsed: true }),
  p('table', M49_TABLE, 'caldera.camp.war-table', ['m49', 'table']),
  ...M49_POSTS.map((x) => p(`post.${x}`, M49_POST(x), `${Q}.m49.post.${x}`, ['m49', `post-${x}`], M49_POST_SET(x), { look: x === 'crates' ? 'box' : 'stake', lookOnlyUsed: true })),
  // R26: the load at Rimfoot, the brake at each long-road halt, the unload at the camp
  p('load', R26_LOAD, `${Q}.r26.load`, ['r26', 'load'], R26_LOADED, { look: 'box', hideWhenUsed: true }),
  ...([1, 2] as const).map((n) => p('brake', R26_BRAKE(n), `${Q}.r26.brake.${n}`, ['r26', `brake${n}`], R26_BRAKED(n), { when: { flag: R26_AT_HALT(n), equals: true } })),
  p('unload', R26_UNLOAD, `${Q}.r26.unload`, ['r26', 'unload'], R26_UNLOADED, { look: 'box', lookOnlyUsed: true }),
  // R29: hang the parts, then strike (every press is a beat)
  p('hang', R29_HANG, 'caldera.stokers.gong', ['r29', 'hang'], R29_HUNG),
  p('strike', R29_STRIKE, 'caldera.stokers.gong', ['r29', 'strike']),
  // M50: three sluice wheels a channel (pressed in the chart's order; wrong presses add heat)
  ...M50_CHANNELS.flatMap((c) => ([1, 2, 3] as const).map((w) => p('sluice', M50_WHEEL(c, w), M50_WHEEL_ANCHOR(c, w), ['m50', `chan${c}`]))),
  // M51: the horn-stone, and a word with each dragon in front of its perch
  p('call', M51_CALL, `${Q}.m51.call`, ['m51', 'call'], undefined, { look: 'stake' }),
  ...M51_DRAGONS.map((d) => p(`talk.${d}`, M51_TALK(d), `${Q}.m51.talk.${d}`, ['m51', d])),
  p('talk.ysmeryth', M51_REPORT, `${Q}.m51.talk.ysmeryth`, ['m51', 'report']),
];

export const RIM_A5_PROMPTS: Record<string, string> = {
  winch: 'Wind the gate winch', brazier: 'Light the stokers\' brazier', lamp: 'Light the gatehouse lamp', wheel: 'Turn the vent wheel',
  lever: 'Pull the gantry lever', signal: 'Light the signal fire', banner: 'Raise the banner', table: 'Study the war table',
  'post.brace': 'Set the brace beams', 'post.crates': 'Stack the flask crates', 'post.wall': 'Mark the archers\' wall',
  load: 'Load the convoy', brake: 'Set the cart\'s brake', unload: 'Unload the convoy', hang: 'Hang the gong\'s parts',
  strike: 'Strike the gong', sluice: 'Turn the sluice wheel', call: 'Sound the keeper\'s horn-stone',
  'talk.ysmeryth': 'Speak to Ysmeryth', 'talk.orsk': 'Speak to Orsk', 'talk.hathren': 'Speak to Hathren',
};
