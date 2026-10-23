// Integration with A4's mines (PR 2): every anchor the mine quests stand on exists in A4's interiors or the surface layouts.
import { describe, expect, it } from 'vitest';
import { MINE_DEFS } from '../../../../../oldsmoke/mines';
import { OLDSMOKE_LAYOUT } from '../../../../../oldsmoke/oldsmoke.layout';
import { GRISEL_HALL_DEF } from '../../../../../oldsmoke/griselHall';
import { HARROWMARK_LAYOUT } from '../../../../../harrowmark/harrowmark.layout';
import { KEEP_HALL_DEF } from '../../../../../interiors/harrowmark/keepHall';
import { SECTIONS } from '../../../../../stealth/sections';
import { OLDSMOKE_CARRY, OLDSMOKE_NOTE_LIST, OLDSMOKE_PROPS, OLDSMOKE_SPAWNERS, OLDSMOKE_TRIGGERS } from '../all';
import { M17R08_NPCS } from './m17r08.npcs';
import { M18M19_NPCS } from './m18m19.npcs';
import { M20D04_NPCS } from './m20d04.npcs';

const mine = new Set(MINE_DEFS.flatMap((d) => d.anchors.map((a) => a.id)));
const all = new Set([...mine, ...OLDSMOKE_LAYOUT.anchors.map((a) => a.id), ...GRISEL_HALL_DEF.anchors.map((a) => a.id), ...HARROWMARK_LAYOUT.anchors.map((a) => a.id), ...KEEP_HALL_DEF.anchors.map((a) => a.id)]);
const patrolOf = (s: { patrol?: unknown }): string[] => (Array.isArray(s.patrol) ? (s.patrol as string[]) : []);

describe('mine quests against A4 anchors', () => {
  it('props, notes, carry homes and triggers stand on anchors that exist', () => {
    for (const p of OLDSMOKE_PROPS) expect(all.has(p.anchorId), `${p.interactableId} -> ${p.anchorId}`).toBe(true);
    for (const n of OLDSMOKE_NOTE_LIST) expect(all.has(n.anchorId), `${n.id} -> ${n.anchorId}`).toBe(true);
    for (const c of OLDSMOKE_CARRY) expect(all.has(c.homeAnchor), c.id).toBe(true);
    for (const t of OLDSMOKE_TRIGGERS) expect(all.has(t.anchorId), t.id).toBe(true);
  });

  it('spawner anchors, members and patrols exist', () => {
    for (const s of OLDSMOKE_SPAWNERS) {
      for (const a of [s.anchor, ...(s.memberAnchors ?? []), ...patrolOf(s)]) expect(all.has(a), `${s.id} -> ${a}`).toBe(true);
    }
  });

  it('NPC posts exist (the mine NPCs on dedicated posts)', () => {
    for (const n of [...M17R08_NPCS, ...M18M19_NPCS, ...M20D04_NPCS]) expect(all.has(n.post), `${n.id} -> ${n.post}`).toBe(true);
    const post = (id: string) => [...M17R08_NPCS].find((n) => n.id === id)!.post;
    expect(post('miner-hale')).toBe('npc-post.miner-hale.shaft');
    expect(post('pickett')).toBe('npc-post.pickett.old');
  });

  it('the M19 stealth section stands on the Lower Galleries anchors', () => {
    const s = SECTIONS.find((x) => x.id === 'm19.lower-galleries')!;
    const lower = new Set(MINE_DEFS.find((d) => d.id === 'mine-lower-galleries')!.anchors.map((a) => a.id));
    expect('interior' in s.bounds && s.bounds.interior).toBe('mine-lower-galleries');
    for (const id of [...s.checkpoints.map((c) => c.anchor), s.exit.anchor, ...s.hideSpots.map((h) => h.anchor)]) expect(lower.has(id), id).toBe(true);
    const g = OLDSMOKE_SPAWNERS.find((x) => x.id.includes('m19') && x.tag === 'stealth.m19.watch') ?? OLDSMOKE_SPAWNERS.find((x) => x.id === s.guardGroups[0]);
    expect(g, 'guard group').toBeDefined();
    for (const a of [g!.anchor, ...(g!.memberAnchors ?? []), ...patrolOf(g!)]) expect(lower.has(a), a).toBe(true);
  });
});
