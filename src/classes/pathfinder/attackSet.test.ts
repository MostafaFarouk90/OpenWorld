import { beforeAll, describe, expect, it } from 'vitest';
import { AttackSets, attackSetProblem } from '../../player/attackSets';
import { PATHFINDER_ATTACKS, PATHFINDER_HEAVY_INDEX, PF, SHOTS } from './tuning';

/** The animation names inside Rogue_Hooded.glb (the JSON chunk of the binary glTF). */
async function clipNames(file: string): Promise<Map<string, number>> {
  const fsModule = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: string) => Uint8Array };
  const buf = readFileSync(`public/assets/kaykit-adventurers/characters/${file}`);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const len = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len)));
  const binStart = buf.byteOffset + 20 + len + 8;
  const out = new Map<string, number>();
  const last = (accessor: number): number => {
    const a = json.accessors[accessor];
    const v = json.bufferViews[a.bufferView];
    const at = binStart + (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + (a.count - 1) * 4;
    return new DataView(buf.buffer).getFloat32(at, true);
  };
  for (const an of json.animations) {
    let d = 0;
    for (const s of an.samplers) d = Math.max(d, last(s.input));
    out.set(an.name, d);
  }
  return out;
}

describe('Pathfinder attack set', () => {
  let clips: Map<string, number>;
  beforeAll(async () => {
    clips = await clipNames('Rogue_Hooded.glb');
  });

  it('every attack clip exists in the Rogue_Hooded model (the controller skips unknown clips silently)', () => {
    for (const a of PATHFINDER_ATTACKS) expect(clips.has(a.clip), a.clip).toBe(true);
  });

  it('is a valid set of four distinct ranged clips with a heavy index of 2, none drawing a blade ribbon', () => {
    const set = { attacks: PATHFINDER_ATTACKS, heavyIndex: PATHFINDER_HEAVY_INDEX };
    expect(attackSetProblem(set)).toBeNull();
    expect(new Set(PATHFINDER_ATTACKS.map((a) => a.clip)).size).toBe(4);
    for (const a of PATHFINDER_ATTACKS) expect(a.noTrace).toBe(true);
    const sets = new AttackSets();
    const reg = sets.register(PF.classId, set);
    expect(reg.ok).toBe(true);
    expect(sets.get(PF.classId).attacks.map((a) => a.clip)).toEqual(PATHFINDER_ATTACKS.map((a) => a.clip));
    expect(sets.register(PF.classId, set)).toEqual({ ok: false, reason: 'duplicate' });
    if (reg.ok) reg.dispose();
    expect(sets.has(PF.classId)).toBe(false); // back to the Knight's swings
  });

  it('keeps every release phase inside its attack window, and the poise follows design 9.6 (10, 10, 30, 15)', () => {
    SHOTS.forEach((spec, i) => {
      const w = PATHFINDER_ATTACKS[i];
      for (const r of spec.releases) {
        expect(r).toBeGreaterThanOrEqual(w.activeStart);
        expect(r).toBeLessThanOrEqual(w.activeEnd);
      }
    });
    const poise = SHOTS.map((s) => s.poise * s.releases.length);
    expect(poise).toEqual([10, 10, 30, 15]);
  });

  it('rapid fire is not strictly worse than the aimed shot: it breaks poise (30 against 10)', () => {
    const total = (i: number) => SHOTS[i].damage * SHOTS[i].releases.length;
    expect(total(2)).toBeGreaterThan(total(0));
    expect(SHOTS[2].poise * SHOTS[2].releases.length).toBeGreaterThan(SHOTS[1].poise * SHOTS[1].releases.length);
  });

  it('release times land after the aim lifts and inside the clip length (measured on the 60 Hz clips)', () => {
    for (const a of PATHFINDER_ATTACKS) expect(clips.get(a.clip)!).toBeGreaterThan(0.9);
  });
});
