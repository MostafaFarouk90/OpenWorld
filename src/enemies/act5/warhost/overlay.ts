import * as THREE from 'three';
import type { BehaviourContext, BehaviourOverlay } from '../../behaviours';
import type { ActorId } from '../../ports';
import type { MoveDef, WarhostRole } from '../../types';
import { WARHOST_ROLES } from '../../types';
import { spawnDataOf } from '../../spawnData';
import { WARHOST_ROLE_MOVES } from './def';
import { joinLine, leaveLine, lineNow, lineStaggered } from './lines';

const VIEWS = new Map<ActorId, { role: WarhostRole; lineId: string }>();
/** What tests read of one warhost. */
export function warhostView(actorId: ActorId): { role: WarhostRole; lineId: string } | null {
  return VIEWS.get(actorId) ?? null;
}

export function roleOf(raw: unknown): WarhostRole {
  return (WARHOST_ROLES as readonly unknown[]).includes(raw) ? (raw as WarhostRole) : 'shield';
}

/** A look prop for the role (a pike or a torch), built from primitives: the Barbarian pike replaces it once a glb exists. */
function buildProp(role: WarhostRole): THREE.Object3D | null {
  if (role === 'shield') return null;
  const g = new THREE.Group();
  g.name = `warhost-${role}`;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, role === 'pike' ? 2.4 : 0.7, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }));
  const head = role === 'pike'
    ? new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0xc8a040 }))
    : new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a30 }));
  head.position.y = role === 'pike' ? 1.35 : 0.4;
  shaft.position.y = role === 'pike' ? 0.5 : 0.15;
  g.add(shaft, head);
  return g;
}

/**
 * The `warhost` overlay (plans/act5-N5.md sections 2 and 3): the role's moves, the role's look, and the shield line. A
 * stagger reports to the line (keyed by the spawner tag); a break kneels every staggered member, then emits the event.
 */
export function makeWarhostOverlay(ctx: BehaviourContext): BehaviourOverlay {
  const actor = ctx.host.actors.get(ctx.actorId);
  const role = roleOf(spawnDataOf(actor?.data)?.role);
  const sd = spawnDataOf(actor?.data);
  const lineId = sd?.line ?? actor?.spawnTag ?? ctx.spawnerId ?? ctx.actorId;
  const moves = WARHOST_ROLE_MOVES[role];
  // A status stun enters `stagger` but opens no mercy window: `stunned` runs just before the brain's stagger, so it flags the entry.
  let stunEntering = false;

  const prop = buildProp(role);
  if (prop) {
    const hand = ctx.body.root.getObjectByName('handslotr') ?? ctx.body.root.getObjectByName('handslot.r') ?? ctx.body.root;
    hand.add(prop);
    // A pike or a torch replaces the shield on the left arm (look only).
    ctx.body.root.getObjectByName('Rectangle_Shield')?.traverse((o) => void ((o as THREE.Mesh).isMesh && (o.visible = false)));
  }
  VIEWS.set(ctx.actorId, { role, lineId });
  joinLine(lineId, ctx.actorId, { role, kneel: () => ctx.brain.offerYield() });

  return {
    allowMove(move: MoveDef) {
      return moves.has(move.id);
    },
    stunned() {
      stunEntering = true;
      return false;
    },
    animate() {
      stunEntering = false;
    },
    stateChanged(_from, to) {
      if (to !== 'stagger' || stunEntering) return;
      const r = lineStaggered(lineId, ctx.actorId, lineNow());
      if (r.brokeNow) ctx.host.events.emit('enemies.shieldLine.broken' as never, { lineId, members: r.kneel } as never);
    },
    leave() {
      leaveLine(lineId, ctx.actorId);
      return false;
    },
    dispose() {
      VIEWS.delete(ctx.actorId);
      leaveLine(lineId, ctx.actorId);
      prop?.removeFromParent();
    },
  };
}
