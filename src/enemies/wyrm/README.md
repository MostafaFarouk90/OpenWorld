# Wyrms

Act 2's dragons (plans/act2-A6a.md): a procedural wyrm builder, the Ember Wyrm, the Wyrmling and Orsk's M20 set piece.
Owner: thread A6a.

## Pieces

- `builder/`: the rig. `WyrmRig` builds a wyrm from `WyrmParams` (scale, segments, palette, legs, spikes, crest) as
  one instanced spine, a head with a jaw, two wings (CPU flap, shader billow), legs, breath points, a spit cone decal
  and a chain. `Spine` is the follow-the-leader body; matrices stay local to the root (the far-coordinate rule).
  Palettes: `ember`, `wyrmling`, `orsk`, `cooled-slag`. Three LODs with hysteresis. `stance`, `legScale` and
  `legGirth` (default 1) change the body height and the legs for one build; only Orsk (`ORSK_PARAMS`) uses them.
- `WyrmBody.ts`: the `EnemyBody` (`body: 'wyrm'`). Clips are named poses (`Spit`, `Bite`, `TailWhip`, `Dive`, `Puff`,
  `Rest`, `HeadLower`, the locomotion and hit clips), eight hurtboxes (`head`, `neck`, `torso`, `belly`, `tail`,
  `tailTip`, `wingL`, `wingR`).
- `flight.ts`, `landing.ts`, `flightOverlay.ts`: the Ember Wyrm's `wyrm-flight` overlay. Perched, takeoff, circle,
  strafe, dive, landing, ground, falling. A player or ally hit on a wing breaks its poise (`poiseBreakBones`, the
  `enemies.poiseBreakBones` damage modifier); in the air that is a 0.5 s fall, then a 3 s grounded stagger in which
  Calm (Ember Coal or the Warm Hand) is offered. Indoors it never flies. The dive locks its landing point at the
  telegraph.
- `skittish.ts`, `tethers.ts`: the Wyrmling's `skittish` overlay. Keeps 3 to 5 m away; with bread and no swing for 2 s
  it lets the player within 1.5 m; bites only when struck or cornered. Chains per spawner slot (`wyrms.tether`).
- `orsk.ts`: the set piece (not an enemy). Beats `started` 0, `chainsBroken` 2.2, `roar` 3.2, `roofBurst` 5.4,
  `gone` 6.4 s.
- `spawners.ts`: the nests (A2's `poi.a2.wyrm-nest-N.spawn.1`, on `story.gate.a2`), R11's den group and the resting den
  wyrm (`world.cinderreach.den.spared`, peaceful), plus `emberWyrmSpawner` and `wyrmlingSpawner` for quest groups.
- `wyrm.plugin.ts`: the `wyrms` service, the hub the overlays call, the `wyrms` persistable (freed chains, v1), the
  bestiary entries, placeholder sounds, dive marks and the shader warm-up.

## For quest scripts

```ts
const wyrms = ctx.services.get('wyrms');
// M20 nursery: six wyrmlings, each chained to its post until A13's per-chain flag is set.
wyrms?.tether('m20.nursery', posts.map((anchor, i) => ({ anchor, until: { all: [`story.m20.chain.${i + 1}`] } })), { exitAnchor: 'interior.m20.door' });
wyrms?.unchain(actorId); // a script release without a flag (saved)
wyrms?.flyAway(actorId); // leaves without a mercy: no credit, slot spent
const orsk = wyrms?.playOrsk({ position, yaw, roofHeight }); // await orsk.done; orsk.skip()
ctx.events.on('wyrm.orsk', ({ beat }) => beat === 'roofBurst' && swapRoof());
```

Events: `wyrm.orsk { beat }`, `wyrm.grounded { actorId, by }`, `wyrm.unchained { actorId }`.

Sounds: `sfx.wyrm.screech`, `.inhale`, `.roar`, `.chirp`, `.coo`, `.wingbeat` (synthesized placeholders; register a
recording under the same key to replace one).

R11: the den group (`wyrm.r11.den`) spawns on the quest's start; the quest despawns it once the choice is made
(`enemies.despawnGroup('wyrm.r11.den')`), and the resting group follows `world.cinderreach.den.spared`.

## Dev

- `?wyrms=1` (dev builds): an Ember Wyrm 18 m ahead, two chained wyrmlings 8 m to the right, Orsk once after 8 s.
- `tools/wyrm-showcase/` under `npx vite`: all three side by side on their own renderer (`?far=1`, `?pose=`, `?t=`,
  `?cam=all|ember|wyrmling|orsk|orsk-side`). `node tools/wyrm-showcase/shoot.mjs <outDir> [prefix]` renders every view
  headless (vite on port 5198).

## Act 3 large dragons (K6a PR 1, plans/act3-K6a.md)

- Builder: `form: 'water'` (frill blades instead of spikes; pair with `legs: 'none'` and a short `wingspan`), `breath: 'water'`
  (spray and mist), `collar`, the `hathren` palette, and `lodDistances(scale)` (a 6x dragon keeps full detail to 240 m).
- `large/flightPath.ts` (Catmull-Rom path by arc length, heading, pitch, bank) and `large/surfacing.ts` (head heights for a
  water form: hidden under the bed, swimming, reared) for set pieces.
- `large/flightExtras.ts`, called from the `wyrm-flight` overlay: a chained flier (Skarl's drake) stays inside its chain and
  reports touchdowns; a perched resting slot (the lodge wyrms) is pinned at its perch height until struck; a released flier
  retires and flies off.
- `hathren/`: Hathren's M26 set piece. `HathrenSequence` (pure beats), `HathrenScene` (the 4.5x teal water form, nets,
  splash rings, the scale glint), `HathrenDirector` (presence from quest `m26` and `story.m26.complete`, cut nets from
  `story.m26.net.<n>`, never saved: a load restarts from the nets). Events `wyrm.hathren { beat }`; codex lore `hathren`.
- `drake/`: `skarl-drake` (the Ember Wyrm at 0.8, collar, `dragonkin`, own `drake.*` move ids, no mercy) and the `drakes`
  service (`chain`, `chainLow`, `strike`, `release`; events `wyrm.drake.landed`, `.chainStruck`, `.freed`).
- `large/lodgeWyrms.ts`: `wyrm.lodge.resting`, two peaceful Ember Wyrms on `story.m34.complete`, perched on the two
  south towers of Wyrmwatch Lodge (anchors `dragonspine.lodge.wyrm.rest.1/2`, defined at runtime from K4's
  `lodge.towers`; the hall's castle art is too tall for a roof perch). Struck, one lands in the yard and fights.
- `large/largeDragons.plugin.ts` (`large-dragons`) provides `hathren` and `drakes`, the hub hooks, the lodge anchors, the
  codex entries. Dev: `?hathren=1` (`window.__hathren`; `&calm=<s>` calms her that long after she is in the nets),
  `?drake=1` (a chained drake 20 m ahead).

```ts
const hathren = ctx.services.get('hathren');
hathren?.netCut(2);                 // K12 also writes story.m26.net.2 = true
const play = hathren?.calm();       // after the warmth hold; again after a load with story.m26.riteDone
const drakes = ctx.services.get('drakes');
const off = drakes?.chain('d06.drake', 'aerie.drake.post', { until: { all: ['boss.corvin-skarl.outcome'] } });
ctx.events.on('wyrm.drake.chainStruck', ({ actorId, by }) => skarl.acceptBreak(...));
```
