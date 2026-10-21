import type { Act2Note } from '../notes';

const n = (id: string, anchorId: string, speaker: 'note' | 'cael', lines: string[], look: Act2Note['look'] = 'page', codexId?: string): Act2Note =>
  ({ id, anchorId, speaker, lines, look, ...(codexId ? { codexId } : {}) });

/** Readable notes of the Oldsmoke quests built so far (anchors are A4's). */
export const OLDSMOKE_NOTE_LIST: Act2Note[] = [
  // M16: the pass
  n('note-m16-ledger', 'oldsmoke.pass.search.1', 'note', [
    'A toll ledger, rain-swollen, nailed to a tollhouse door. The stewards\' column lists forty carts a month. A second, smaller hand has added a column of its own: "by night, no tally".',
    'The second column adds up to more than the first.',
  ], 'page', 'lore.deepgate-toll'),
  n('note-m16-cart', 'oldsmoke.pass.search.2', 'cael', [
    'A burned cart off the road, ore still in its bed. The axle did not break: it was cut through, cleanly, before the fire.',
    'Whoever wanted the pass dark did not mind the fire reaching their own wagons.',
  ], 'box'),
  n('note-m16-shrine', 'oldsmoke.pass.search.3', 'cael', [
    'A miners\' shrine: a lamp-niche in the rock, a heap of pit-candles burned to stubs. Someone has pushed fresh coal into the lamp bowl this week.',
    'The miners still pray here. Whatever Grisel has promised them, they have not stopped asking.',
  ], 'grave'),
  // R09: the paymaster's office and two market stalls that saw the chests go down
  n('note-r09-ledger', 'oldsmoke.market.office.1', 'note', [
    'The payroll ledger. Four weeks of wages are booked "pending", and then, in a different ink, "diverted to cellar for safekeeping".',
    'The cellars were never safe. Everyone in Deepgate knew it but the man who wrote the line.',
  ]),
  n('note-r09-safe', 'oldsmoke.market.office.2', 'cael', [
    'The paymaster\'s safe stands open and empty. Scratch marks on its floor show where the chests were dragged, not lifted.',
    'He was in a hurry, or he was told to be.',
  ], 'box'),
  n('note-r09-seal', 'oldsmoke.market.office.3', 'note', [
    'A letter under a green wax seal: "Hold the coin where the foreman cannot find it until the strike breaks. A hungry man works." The signature has been scraped away.',
  ]),
  n('note-r09-stall', 'oldsmoke.market.stall.1', 'cael', [
    'A baker\'s stall with a chalk board: "Credit to miners ended Midsummer. By order." Under it, in smaller chalk, someone has written the miners\' names, and beside each one a number.',
  ]),
  n('note-r09-board', 'oldsmoke.market.stall.2', 'note', [
    'A notice pinned to a stall post: "Wages will be paid when the cellars are cleared. Do not enter the cellars. By order of the steward."',
    'Below it, a miner\'s hand: "Then why have they been going down at night?"',
  ]),
  // R10: what each hall has kept
  n('note-r10-ledgers', 'oldsmoke.market.stall.3', 'note', [
    'Pay ledgers, two sets. The miners\' copy lists hours worked; the stewards\' copy lists hours paid. The difference is a sixth of every shift.',
  ]),
  n('note-r10-injuries', 'oldsmoke.market.stall.4', 'note', [
    'The injury roll from the Old Galleries: thirty-one names in a year, nineteen struck through "recovered", twelve with no entry at all. The stewards\' office has never once paid a widow.',
  ]),
  n('note-r10-orders', 'oldsmoke.market.stall.5', 'note', [
    'Steward orders, copied out: "Hold the line on pay. Allow no gathering of more than six. If the foreman speaks, a steward is to stand behind him and write down what he says."',
    'It is not a threat. It is a clerk\'s instruction, which is worse.',
  ]),
  n('note-r10-notice', 'oldsmoke.market.stall.6', 'note', [
    'The strike notice, in Slagg\'s blocky hand: "We dig, we are paid. We are not paid, we do not dig. We are not unreasonable. We are owed."',
  ]),
  n('note-r10-shift', 'oldsmoke.r10.hall.miners', 'cael', [
    'Chalked on the miners\' hall wall: a tally of days since the strike began, and beside it the shifts of the men who would not strike and went down anyway. They are not named. They are not blamed. They are counted.',
  ], 'grave'),
  n('note-r10-petition', 'oldsmoke.r10.hall.stewards', 'note', [
    'A steward\'s petition to Lord Aldous, unsent: "The men are not the enemy, my lord. The pay is. I ask leave to pay them what they are owed and answer for it myself."',
    'It is signed Halse. It has not been delivered. It is dated three weeks ago.',
  ]),
  // M22: Harrowmark as it stands before the world changes
  n('note-m22-fountain', 'harrowmark.square.fountain', 'cael', [
    'The Silver Fountain is dry. Its basin holds a hand\'s depth of ash and last year\'s leaves, and someone has laid a ring of pennies round the rim, as if it might drink them.',
    'The pledge will have to be made before the water runs again.',
  ]),
  n('note-m22-stalls', 'harrowmark.square.market', 'cael', [
    'Half the market stalls are shuttered, their awnings furled, their prices chalked and rubbed out. A carter tells {name} that not one has opened since the Ember went quiet.',
    'Merchants are waiting to see which House stands before they open a door.',
  ]),
];
