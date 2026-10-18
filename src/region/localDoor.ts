// Local stand-ins for the core Door and Chest. When the real ones land they replace this file; the
// option shapes below match the contract text exactly.
import * as THREE from 'three';
import type { ActorLike, CoreContext } from './coreTypes';

export interface DoorOptions {
  id: string;
  pivot: THREE.Object3D;
  openAngle: number;
  seconds: number;
  collider?: { setEnabled?(on: boolean): void; desc?: unknown } | object;
  locked?: () => boolean;
}

export interface ChestOptions {
  id: string;
  object: THREE.Object3D;
  loot: Array<{ itemId: string; count: number }>;
}

export interface Disposable {
  dispose(): void;
}

type DoorCtx = Pick<CoreContext, 'physics' | 'interaction' | 'state' | 'events' | 'systems'>;
type ChestCtx = Pick<CoreContext, 'interaction' | 'state' | 'events'>;

const nameOf = (id: string): string => id.replace(/^[a-z]+:/, '');

export function createLocalDoor(ctx: DoorCtx, opts: DoorOptions): Disposable {
  const flag = `door.${nameOf(opts.id)}.open`;
  const maxAngle = opts.openAngle;
  const speed = maxAngle / Math.max(opts.seconds, 1e-6);
  let open = ctx.state.getBool(flag);
  let angle = open ? maxAngle : 0;
  let collider = opts.collider as any;
  const original = collider;
  let solid = !!collider;
  let disposed = false;

  const setSolid = (on: boolean): void => {
    if (!collider || on === solid) return;
    solid = on;
    if (typeof collider.setEnabled === 'function') collider.setEnabled(on);
    else if (!on) ctx.physics.removeCollider(collider);
    else if (collider.desc) collider = ctx.physics.addStaticCollider(collider.desc);
  };
  const apply = (): void => {
    opts.pivot.rotation.y = angle;
  };
  // Initial state: an open door has no collider.
  if (open && collider) {
    if (typeof collider.setEnabled === 'function') collider.setEnabled(false);
    else ctx.physics.removeCollider(collider);
    solid = false;
  }
  apply();

  const locked = (): boolean => !!opts.locked?.();
  const unregister = ctx.interaction.register({
    id: opts.id,
    kind: 'door',
    position: (out) => opts.pivot.getWorldPosition(out),
    radius: 3,
    get promptKey() {
      return locked() ? 'interact.locked' : 'interact.door';
    },
    onInteract(_actor: ActorLike) {
      if (disposed || locked()) return;
      open = !open;
      ctx.state.setFlag(flag, open);
      if (open) setSolid(false);
    },
  });

  const removeSystem = ctx.systems.add({
    id: `door-anim:${opts.id}`,
    fixedPhase: 'rules',
    fixedUpdate(dt) {
      const target = open ? maxAngle : 0;
      if (angle === target) return;
      const step = speed * dt;
      angle = angle < target ? Math.min(target, angle + step) : Math.max(target, angle - step);
      apply();
      if (angle === 0 && !open) setSolid(true);
    },
  });

  const offLoaded = ctx.events.on('save.loaded', () => {
    open = ctx.state.getBool(flag);
    angle = open ? maxAngle : 0;
    apply();
    setSolid(!open);
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      removeSystem();
      offLoaded();
      // A collider the door re-created itself is the door's to remove; the original belongs to the builder.
      if (collider && collider !== original && solid) ctx.physics.removeCollider(collider);
    },
  };
}

export function createLocalChest(ctx: ChestCtx, opts: ChestOptions): Disposable {
  const flag = `chest.${nameOf(opts.id)}.opened`;
  let opened = ctx.state.getBool(flag);
  let disposed = false;
  const showState = (): void => {
    opts.object.userData.opened = opened;
    const lid = opts.object.getObjectByName('lid');
    if (lid) lid.rotation.x = opened ? -1.1 : 0;
  };
  showState();
  const unregister = ctx.interaction.register({
    id: opts.id,
    kind: 'chest',
    position: (out) => opts.object.getWorldPosition(out),
    radius: 2.5,
    promptKey: 'interact.chest',
    enabled: () => !opened && !disposed,
    onInteract() {
      if (opened || disposed) return;
      opened = true;
      ctx.state.setFlag(flag, true);
      showState();
      ctx.events.emit('loot.granted', {
        sourceId: opts.id,
        items: opts.loot.map((i) => ({ itemId: i.itemId, count: i.count })),
      });
    },
  });
  const offLoaded = ctx.events.on('save.loaded', () => {
    opened = ctx.state.getBool(flag);
    showState();
  });
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      offLoaded();
    },
  };
}
