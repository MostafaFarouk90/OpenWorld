// Act 5 N1 PR 2 (the Caldera's environment pass): every new environment id the Caldera asks Mostafa for. This is the one list
// behind section V of docs/env/environment-needs-prompts.md, src/env/targets.json, the scripted stand-ins
// (tools/env-pass/standins/caldera.ts) and the structure art (calderaArt.ts). Plain data, no THREE.
//
// The glb contract is the same as every env file: Y up, 1 unit = 1 m, pivot at the base centre (lowest point y = 0), front (the
// face the player meets first, the opening of a portal) toward +Z, no baked rotation, authored at the size below. A file
// dropped under public/assets/env/<id>.glb and ingested into the manifest replaces the stand-in with no placement change.

export type CalderaEnvUse =
  /** A dressing row of the `c1` tile (src/caldera/env/calderaEnv.ts), with a scripted stand-in glb until the file arrives. */
  | 'row'
  /** A PR 1 layout structure (caldera.layout.ts) drawn by the file once it is in the manifest; greybox (with its collider) until then. */
  | 'structure'
  /** Placed by code, not by the tile (the Anvil island's set dressed onto N6's D10 arena, the Lava Stair's gantries); a scripted stand-in until the file arrives. */
  | 'piece';

export interface CalderaEnvId {
  id: string;
  use: CalderaEnvUse;
  /** Target size in metres: width (x), depth (z), height (y). */
  w: number;
  d: number;
  h: number;
  prompt: string;
  where: string;
}

export const CALDERA_ENV_IDS: readonly CalderaEnvId[] = [
  // ---- dressing rows (scripted stand-ins now)
  {
    id: 'caldera-lantern-post-a',
    use: 'row',
    w: 0.6,
    d: 0.6,
    h: 2.6,
    prompt: 'a black iron lantern post hammered into basalt, a short arm at the top holding a caged lantern with a glowing ember-orange coal inside (the coal a separate emissive material named Fire), soot on the cage',
    where: 'every 45 m along the rim stairs and every 60 m down the Lava Stair, on the uphill side (29)',
  },
  {
    id: 'basalt-boulder-a',
    use: 'row',
    w: 3.2,
    d: 2.6,
    h: 2.0,
    prompt: 'a heavy boulder of black-brown basalt, blocky with faceted cooled-lava faces, a few rusty-orange mineral streaks, flat enough at the base to sit on a slope',
    where: 'the rim stairs\' banks and the bowl floor (50, random yaw and scale)',
  },
  {
    id: 'lava-glass-shard-a',
    use: 'row',
    w: 1.2,
    d: 1.0,
    h: 1.1,
    prompt: 'a small cluster of three jagged black volcanic-glass shards leaning out of the ground, glossy faces, thin ember-orange glowing cracks at the roots (the cracks an emissive material named Glow)',
    where: 'the lava lake\'s outer shore, 7 to 35 m past the lava (about 40)',
  },
  {
    id: 'rim-wall-a',
    use: 'row',
    w: 6,
    d: 1.6,
    h: 4,
    prompt: 'a straight 6 m module of fortress wall built from big squared basalt blocks, a crenellated top with three merlons, soot streaks, a narrow walkway ledge on the back (-Z); ends cut square so modules join',
    where: 'either side of the Rim Gate on the rim\'s top past the cut\'s banks, four a side (8 modules)',
  },
  {
    id: 'foundry-wall-a',
    use: 'row',
    w: 6,
    d: 2,
    h: 5,
    prompt: 'a straight 6 m module of foundry wall: dark basalt blocks bound by three riveted bronze bands, a row of small ember-lit vents along the foot (emissive material named Glow), ends cut square so modules join',
    where: 'either side of the Inner Gate along the floor wall\'s lip, 16 to 40 m out (8 modules)',
  },
  {
    id: 'rim-banner-a',
    use: 'row',
    w: 1.2,
    d: 0.2,
    h: 6,
    prompt: 'a tall war banner on a plain iron pole with a crossbar: ember-orange cloth with a black anvil-and-flame device, ragged hem, the cloth a separate mesh so it can sway',
    where: 'the Rim Camp\'s way in, the Lava Stair\'s head and the Inner Gate\'s head (6)',
  },
  {
    id: 'warhost-banner-a',
    use: 'row',
    w: 1.2,
    d: 0.2,
    h: 6,
    prompt: 'a tall war banner on a black iron pole with a crossbar: soot-black cloth with a bronze crowned ash-tree device and a bronze fringe, the cloth a separate mesh so it can sway',
    where: 'Vey\'s warhost camp below the rim (4)',
  },
  {
    id: 'weapon-rack-a',
    use: 'row',
    w: 2.2,
    d: 0.7,
    h: 1.9,
    prompt: 'a timber weapon rack on two A-frame legs, four spears and two round shields leaning on it, a coil of rope hanging from one end',
    where: 'the Rim Camp\'s trainers\' row (4) and the warhost camp (2)',
  },
  {
    id: 'forge-gong-frame-a',
    use: 'row',
    w: 4.2,
    d: 1.2,
    h: 4.6,
    prompt: 'the stokers\' forge-gong: a great dented bronze gong hung by chains in a frame of black iron beams on two splayed feet, a soot-black hammer resting against one foot',
    where: 'the stokers\' post on its ledge east of the Rim Camp (1, R29)',
  },
  {
    id: 'cooling-hall-portal-a',
    use: 'row',
    w: 8,
    d: 2.5,
    h: 6.5,
    prompt: 'a massive doorway cut into basalt: a square frame of dressed black stone with a bronze lintel plate, two open bronze door leaves folded back, a clear opening at least 3 m wide and 3.5 m high, steam stains above it',
    where: 'the Cooling Hall\'s door at the Lava Stair\'s foot (1; the door anchor stands 1.5 m in front)',
  },
  {
    id: 'tunnel-portal-a',
    use: 'row',
    w: 6,
    d: 2,
    h: 4.5,
    prompt: 'a mine portal into a rock face: two heavy timber posts and a lintel braced with iron, a clear opening about 2.6 m wide and 3 m high, a lantern hook and a chalked stokers\' mark on the lintel',
    where: 'the stokers\' tunnel mouth (1; R27)',
  },
  {
    id: 'foundry-stairhead-a',
    use: 'row',
    w: 7,
    d: 7,
    h: 4.5,
    prompt: 'a squat stone stair-head over a stair going down into the ground: three dark basalt walls and a flat roof with bronze corner caps, the open front (+Z) a clear archway at least 3 m wide and 3 m high, heat shimmer stains round the arch',
    where: 'the Foundry\'s door on the bowl floor (1; D09)',
  },
  {
    id: 'wyrm-rib-a',
    use: 'row',
    w: 1.4,
    d: 1.4,
    h: 5.5,
    prompt: 'one giant curved dragon rib, bleached and scorched black at the tip, standing out of the ground like a tusk, cracked along its length',
    where: 'the Wyrm Terraces\' ledges and paths (12)',
  },
  {
    id: 'wyrm-skull-a',
    use: 'row',
    w: 4,
    d: 5.5,
    h: 2.6,
    prompt: 'a huge dragon skull half sunk in ash and basalt grit, long jaw, swept-back horns, empty eye sockets, scorch marks, front (+Z) the snout',
    where: 'the Wyrm Terraces\' middle ledge (1)',
  },
  {
    id: 'scorched-nest-a',
    use: 'row',
    w: 6,
    d: 6,
    h: 1.2,
    prompt: 'a wyrm nest: a low ring of fused, glassy black rocks round a hollow of grey ash, a few big cracked eggshell shards in it',
    where: 'the Wyrm Terraces\' three ledges (3)',
  },
  {
    id: 'warhost-tent-a',
    use: 'row',
    w: 5,
    d: 6,
    h: 3.2,
    prompt: 'a soldier\'s ridge tent of soot-black canvas with a bronze-coloured stripe along the ridge, staked with iron pins, the door flap on the front (+Z) tied open',
    where: 'Vey\'s warhost camp below the rim (8)',
  },

  // ---- PR 1 structures (greybox with colliders until the file arrives; the art layer draws the file by this id)
  {
    id: 'rim-gate-tower-a',
    use: 'structure',
    w: 5,
    d: 5,
    h: 12,
    prompt: 'a square gate tower of big basalt blocks, a crenellated top with an ember brazier, arrow slits, a bronze-studded postern on the court side (+Z); the +X face plain where the gate leaf hangs (the west tower as drawn; the east tower is the same file mirrored)',
    where: 'the Rim Gate, either side of the leaf (2; structures caldera.rim-gate.tower.w/e)',
  },
  {
    id: 'gate-winch-a',
    use: 'structure',
    w: 1.2,
    d: 1.2,
    h: 1,
    prompt: 'a heavy iron winch drum on a timber frame with a spoked turning wheel and a chain wound round it',
    where: 'inside the Rim Gate (1; M47\'s winch; structure caldera.rim-gate.winch.drum)',
  },
  {
    id: 'rim-camp-tent-a',
    use: 'structure',
    w: 6,
    d: 5,
    h: 3,
    prompt: 'a large field tent of patched ember-orange and grey canvas on a timber frame, a front awning on two poles over the door (+Z), guy ropes weighted with basalt stones',
    where: 'the Rim Camp (6; structures caldera.camp.tent.1 to 6)',
  },
  {
    id: 'war-table-a',
    use: 'structure',
    w: 3,
    d: 1.6,
    h: 1,
    prompt: 'a campaign table of rough planks on trestles, a map of the Caldera pinned with daggers, carved wooden markers and a guttered candle',
    where: 'the Rim Camp (1; M49 and M52\'s briefings; structure caldera.camp.war-table.top)',
  },
  {
    id: 'rim-stall-a',
    use: 'structure',
    w: 2.6,
    d: 1.4,
    h: 1.1,
    prompt: 'a narrow trader\'s counter of planks on two barrels with a short canvas awning, a few goods on top; the counter front (where the buyer stands) faces +Z',
    where: 'the Rim Camp\'s shop row (9; structures caldera.camp.shop.<vendor>.stall)',
  },
  {
    id: 'stokers-hut-a',
    use: 'structure',
    w: 5,
    d: 4,
    h: 2.6,
    prompt: 'a squat stokers\' hut of basalt rubble with a sod-and-slate roof, a soot-black chimney pipe, a low plank door on the front (+Z), coal shovels by the door',
    where: 'the stokers\' post (1; structure caldera.stokers.hut)',
  },
  {
    id: 'inner-gate-pillar-a',
    use: 'structure',
    w: 2,
    d: 2,
    h: 9,
    prompt: 'a tall gate pillar of black basalt drums bound with bronze, a groove down the inner face for a portcullis, an ember-lit bronze cap',
    where: 'the Inner Gate (2; structures caldera.inner-gate.pillar.1/2)',
  },

  // ---- the code-placed pieces (PR 3: env/anvilArenaArt.ts on N6's arena, env/lavaStair.ts on the Lava Stair)
  {
    id: 'anvil-of-ages-a',
    use: 'piece',
    w: 3,
    d: 6,
    h: 2.6,
    prompt: 'the Anvil of Ages: an enormous ancient anvil of dark bronze-black metal on a stepped basalt plinth, the face cracked with glowing ember veins (emissive material named Glow), old runes worn round the base',
    where: 'the island, north-east of the centre at 40 m, facing it (1; a landmark with a collider, outside N6\'s fight pieces)',
  },
  {
    id: 'arena-platform-a',
    use: 'piece',
    w: 6,
    d: 8,
    h: 0.35,
    prompt: 'a turning platform slab of riveted iron plates over basalt, ember light leaking from the seams (emissive material named Glow), worn smooth in the middle',
    where: 'the island (4; N6\'s turning platforms, src/bosses/act5/ulthred/anvilArena.ts)',
  },
  {
    id: 'crack-anvil-a',
    use: 'piece',
    w: 1.2,
    d: 2,
    h: 1,
    prompt: 'a small anvil block of black iron on a stone stump, a deep crack across its face, the crack a separate emissive material named Glow (the game lights it when the anvil cracks)',
    where: 'the island (3; N6\'s crack-anvils)',
  },
  {
    id: 'spirit-flame-post-a',
    use: 'piece',
    w: 0.6,
    d: 0.6,
    h: 2.2,
    prompt: 'a slim bronze post with a shallow dish on top for a pale spirit flame, verdigris at the foot',
    where: 'the island (10; N6\'s spirit-flame posts)',
  },
  {
    id: 'lava-gantry-a',
    use: 'piece',
    w: 2.4,
    d: 6.6,
    h: 1.2,
    prompt: 'a heavy drawbridge gantry: a plank deck on two riveted iron girders with low chain rails, a hinge bar across the near end (-Z), the landing end toward +Z; built to lie flat over a lava channel',
    where: 'the Lava Stair\'s second and fifth channels (2; lowered by M48\'s gantry levers)',
  },
];

export const CALDERA_ROW_IDS = CALDERA_ENV_IDS.filter((e) => e.use === 'row').map((e) => e.id);
/** Every id with a scripted stand-in (the tile's rows and the code-placed pieces). */
export const CALDERA_STANDIN_ENV_IDS = CALDERA_ENV_IDS.filter((e) => e.use !== 'structure').map((e) => e.id);
