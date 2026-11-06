/**
 * Every service reachable after M41 (L13 PR 1, review line; coordinator ruling D, 2026-11-06). With Harrowmark held from M38,
 * each service a player used inside the walls must stand outside them once the allies reach the Ashgate refuge: every
 * Harrowmark vendor that is still open (Aldous closes at the betrayal), every class trainer's desk, the companions' bench
 * posts and waystone travel to and from the refuge stone. `servicesAfterM41` lists each with where it stands now; a row is
 * reachable when its anchor exists and stands outside the ring wall (and, for travel, the stone is lit and not dark). The
 * chain (round 2) then walks to the refuge and opens each one through its real interactable.
 */
import { DEFAULT_KITS, trainerPlacement, TRAINER_POSTS, type TrainerPostRow } from '../classes/kits';
import type { ClassId } from '../actors/classes';
import { COMPANION_IDS } from '../companions/ids';
import { partyPost } from '../companions/CompanionController';
import type { FlagReader } from '../core/flagCondition';
import { VENDOR_IDS, VENDOR_POSTS, vendorAnchor, type VendorId, type VendorPostRow } from '../economy/stock';
import { insideRingWall } from '../harrowmark/noStrand';

/** The refuge's waystone (L1's `waystone.ashgate`). */
export const REFUGE_STONE = 'ashgate';

export type ServiceKind = 'vendor' | 'trainer' | 'companion' | 'travel';

export interface ServiceRow {
  kind: ServiceKind;
  id: string;
  /** where it stands now (anchor id) */
  anchor: string;
  /** null when the anchor is not placed */
  at: { x: number; z: number } | null;
  inside: boolean;
  reachable: boolean;
  why?: string;
}

export interface ServicePorts {
  flags: FlagReader;
  anchor(id: string): { x: number; z: number } | undefined;
  /** the economy's open rule (shipped switch AND the v0.8 table) */
  vendorOpen(v: VendorId): boolean;
  stoneLit(id: string): boolean;
  stoneDark(id: string): boolean;
  vendorPosts?: readonly VendorPostRow[];
  trainerPosts?: readonly TrainerPostRow[];
}

/** The vendors whose shipped shop stands inside the ring wall (the ones the held city takes away). */
export function harrowmarkVendors(anchor: ServicePorts['anchor']): VendorId[] {
  return VENDOR_IDS.filter((v) => {
    const a = anchor(`shop.${v}`);
    return !!a && insideRingWall(a.x, a.z);
  });
}

function row(kind: ServiceKind, id: string, anchorId: string, p: ServicePorts, extra?: (r: ServiceRow) => string | null): ServiceRow {
  const a = p.anchor(anchorId) ?? null;
  const inside = !!a && insideRingWall(a.x, a.z);
  const r: ServiceRow = { kind, id, anchor: anchorId, at: a ? { x: a.x, z: a.z } : null, inside, reachable: false };
  const why = !a ? `anchor ${anchorId} is not placed` : inside ? `${anchorId} stands inside the held walls` : extra?.(r) ?? null;
  r.reachable = why === null;
  if (why) r.why = why;
  return r;
}

export function servicesAfterM41(p: ServicePorts): ServiceRow[] {
  const out: ServiceRow[] = [];
  for (const v of harrowmarkVendors(p.anchor)) {
    if (!p.vendorOpen(v)) continue; // closed by design (Aldous from M38): not a service any more
    out.push(row('vendor', v, vendorAnchor(v, p.flags, p.vendorPosts ?? VENDOR_POSTS), p));
  }
  for (const c of Object.keys(DEFAULT_KITS) as ClassId[]) {
    const t = trainerPlacement(DEFAULT_KITS[c], p.flags, p.trainerPosts ?? TRAINER_POSTS);
    out.push(row('trainer', c, t.deskAnchor, p));
  }
  for (const c of COMPANION_IDS) out.push(row('companion', c, partyPost(c, p.flags), p));
  out.push(
    row('travel', REFUGE_STONE, `waystone.${REFUGE_STONE}`, p, () =>
      !p.stoneLit(REFUGE_STONE) ? 'the refuge stone is not lit' : p.stoneDark(REFUGE_STONE) ? 'the refuge stone is dark' : null,
    ),
  );
  return out;
}

export const unreachable = (rows: readonly ServiceRow[]): string[] =>
  rows.filter((r) => !r.reachable).map((r) => `${r.kind} ${r.id}: ${r.why}`);
