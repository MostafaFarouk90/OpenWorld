# shrine

Slice 2 thread 7 (plans/slice-2-shrine-warmth.md): the Quenchstone Shrine, the Warmth Tier and the M05 wardstone rhythm.

- `warmth.ts`: W is the count of the eight `shrine.<id>.lit` flags. `warmth` service, `warmth.changed`, and the only caller of `enemies.setWarmthTier` (on every change and every `save.loaded`).
- `cooled.ts`: the "Cooled" buff (+10% max health, 20 min sim time) as a progression modifier; `buff.applied` and `buff.removed` for the HUD; persisted as `shrine.cooled`.
- `shrine.ts`: rekindle bookkeeping (no Burn is charged here: spells charges it), Cooled on `rest`, the basin soak.
- `respec.ts`: holds `progression.allowRespec('shrine')` and opens thread 8's `respecDialog`; without it a press-F-again toast. Pricing, gold and the free flag are progression's.
- `beat.ts`, `wardstones.ts`: five stones west to east, three strikes on three consecutive beats each, +-120 ms. Music clock when `music.beat()` exists, else a 92 BPM metronome; a source switch resets quietly and sits out one beat. Flags `world.deadroad.wardstone.<n>` and `world.deadroad.wardstones.done`; the rhythm is gated on `story.m05.tobbJoined`.
- `shrine.visuals.ts`: procedural pillar, basin, steam, rim light, wardstones and the beat pip.

Anchors read from thread 4: `shrine.quenchstone.basin`, `waystone.quenchstone`, `wardstone.1..5`, trigger `trg.shrine.basin`. Input timestamps: `pressedAtMs('attack1')` when core provides it, else the sampling time (up to one fixed step late).
