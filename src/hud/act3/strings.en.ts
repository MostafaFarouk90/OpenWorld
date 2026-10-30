// K15 PR 1 strings: the breath meter, the ferry stop menu and the socket screen. The ferry refusal lines and the socket
// results are K7's and K10's own (`ferry.refused.*`, `gear.sockets.*`); only the keys they never had are here.
export const ACT3_HUD_STRINGS_EN: Record<string, string> = {
  'act3.hud.breath': 'Breath',
  'act3.ferry.menu.title': 'Ferry from {stop}',
  'act3.ferry.menu.go': 'Ride to {dest}',
  'act3.ferry.menu.cancel': 'Stay ashore',
  // `busy` is silent in the toasts (the player may not see why); the menu says it. The generic line covers any new reason.
  'act3.ferry.refused.busy': 'Not just now.',
  'act3.ferry.refused.generic': 'The ferry cannot take you now.',
  // The costs come from SOCKET_TUNING, so a retune never leaves a stale price in a label (K10's own labels hard-code them).
  'act3.sockets.screen.pieces': 'Gear',
  'act3.sockets.screen.gems': 'Loose shard-gems',
  'act3.sockets.screen.pickSlot': 'Choose an empty socket first, then the shard-gem to fit.',
  'act3.sockets.screen.pickGem': 'Fit which shard-gem into socket {n} of {piece}?',
  'act3.sockets.screen.worn': '(worn)',
  'act3.sockets.screen.choose': 'Choose',
  'act3.sockets.screen.chosen': 'Chosen',
  'act3.sockets.screen.fit': 'Fit ({gold} gold)',
  'act3.sockets.screen.remove': 'Take out ({gold} gold)',
  'act3.sockets.screen.recut': 'Recut to {name} ({gold} gold)',
  'act3.sockets.screen.noGems': 'You carry no shard-gems.',
  'act3.sockets.screen.hint': 'Arrows or Tab move, Enter selects, Esc closes.',
};
