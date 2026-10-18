/** Chase tuning (design 15.7 item 76; plans/slice-2-stealth-chase.md sections 7 and 12). */
export const CHASE = {
  /** Courier speeds (m/s): running, slowed when far ahead, and the short burst when the player is close. */
  courierRun: 7.0,
  courierFloor: 5.0,
  courierBurst: 7.8,
  /** Rubber band: slow beyond this gap, burst under the near gap for at most burstSeconds (then a full recharge at half rate before the next). */
  slowGap: 25,
  nearGap: 6,
  burstSeconds: 2,
  /** Seconds the courier spends on a vault node, and on a drop node. */
  courierVaultSeconds: 0.8,
  courierDropSeconds: 0.4,
  /** The courier starts this far along his route when the chase starts. */
  courierHeadStart: 12,
  /** Caught within this distance (m). */
  catchRadius: 2,
  /** Lost when the gap stays above loseGap for loseSeconds. */
  loseGap: 45,
  loseSeconds: 3,
  /** The timer is the par time times this, rounded up to a whole second. */
  timerOverPar: 1.2,
  /** The "Again" card shows this long before the restart. */
  againSeconds: 2,
  /** Seconds a player loses vaulting a chase-vault wall (a jump over 0.9 m). */
  playerVaultSeconds: 0.15,
} as const;
