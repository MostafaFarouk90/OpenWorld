// v0.7 item 17: the `quenched` aura (Q13). While it holds, Burn gains are multiplied by `burnGainScale`. The hook is
// `Burn.setGainScale` (src/spells/Burn.ts); K6a / K13 grant the aura and register `() => QUENCHED_AURA.burnGainScale`
// while it is active (and undo the registration when it ends). Nothing here grants it.
export const QUENCHED_AURA = { id: 'quenched', burnGainScale: 0.75 } as const;
