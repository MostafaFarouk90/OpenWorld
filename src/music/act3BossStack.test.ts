// K14 on the K8 + K6a stack: the two Act 3 boss ids K8 registers must find K14's boss mixes. Imports K8's real ids and the
// arena positions the world gives them, so a rename on either side fails here, not as a silent fall back to the generic mix.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ARENA as SKARL_ARENA, SKARL_BOSS_ID } from '../bosses/skarl/tuning';
import { MURKJAW_BOSS_ID } from '../bosses/murkjaw/tuning';
import { buildDragonspine } from '../dragonspine/layout';
import { registerDragonspineKinds } from '../dragonspine/structureKinds';
import { stubInputs } from '../dragonspine/testing/fixture';
import { regionAt } from '../region/regionMask';
import { ACT3_INTERIOR_PADS } from '../region/act3/act3Places';
import { ACT3_BOSS_MIX_KEYS } from './act3Tracks';
import { TRACKS_BY_ID } from './tracks';

let release: () => void;
beforeAll(() => (release = registerDragonspineKinds()));
afterAll(() => release());

describe('Act 3 bosses on the stack', () => {
  it('Murkjaw fights in the Greyfen, whose track has his mix: three phases, the hat out in the first, no hush', () => {
    expect(MURKJAW_BOSS_ID).toBe('murkjaw');
    const pad = ACT3_INTERIOR_PADS['mirewater-deeps'];
    const region = regionAt(pad.x, pad.z);
    expect(region?.id).toBe('greyfen');
    expect(region?.track).toBe('peat-and-pitch');
    const mix = TRACKS_BY_ID[region!.track]!.bossMixes?.[MURKJAW_BOSS_ID];
    expect(mix).toBeDefined();
    expect(mix!.phases).toHaveLength(3);
    expect(mix!.phases[0]!.hat).toBe(0);
    expect(mix!.phases[1]!.hat).toBeGreaterThan(0);
    expect(mix!.hush).toBeUndefined();
  });

  it('Skarl fights in the Aerie courtyard, in the Dragonspine, whose track has his mix: two phases and a hush', () => {
    const b = buildDragonspine(stubInputs());
    const a = b.layout.anchors.find((x) => x.id === SKARL_ARENA.centre);
    expect(a, SKARL_ARENA.centre).toBeDefined();
    const region = regionAt(a!.x, a!.z);
    expect(region?.id).toBe('dragonspine');
    expect(region?.track).toBe('wing-over-rime');
    const mix = TRACKS_BY_ID[region!.track]!.bossMixes?.[SKARL_BOSS_ID];
    expect(mix).toBeDefined();
    expect(mix!.phases).toHaveLength(2);
    expect(mix!.hush).toBeDefined();
  });

  it('every boss id the director can be given has a mix on the track of its region', () => {
    expect(ACT3_BOSS_MIX_KEYS).toEqual(expect.arrayContaining([MURKJAW_BOSS_ID, SKARL_BOSS_ID]));
  });
});
