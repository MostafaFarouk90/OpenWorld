import * as THREE from 'three';
import type { GameEvents, ItemStack } from '../core/events';
import type { WorldState } from '../state/WorldState';
import type { InteractionSystem } from './InteractionSystem';
import { flagKeyFor, parseInteractableId } from './ids';

export interface ChestContext {
  interaction: InteractionSystem;
  state: WorldState;
  events: GameEvents;
}

export interface ChestOptions {
  id: string;
  object: THREE.Object3D;
  loot: ItemStack[];
  radius?: number;
  name?: string;
  /**
   * v0.5 veto (locked chests): checked on each interact; false keeps the chest shut, prompt and all, and calls
   * `onRefused` (a toast, a lockpick prompt). A throwing veto counts as false.
   */
  canOpen?: () => boolean;
  onRefused?: () => void;
}

/** Opens once, grants its loot and persists in `chest.<name>.opened`. */
export class Chest {
  opened = false;
  private readonly flag: string;
  private readonly loot: ItemStack[];
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly ctx: ChestContext,
    private readonly opts: ChestOptions,
  ) {
    if (parseInteractableId(opts.id).kind !== 'chest') throw new Error(`Chest: id "${opts.id}" must be chest:<name>`);
    for (const l of opts.loot) {
      if (!l || typeof l.itemId !== 'string' || l.itemId === '' || !Number.isInteger(l.count) || l.count <= 0) {
        throw new Error(`Chest "${opts.id}": invalid loot entry ${JSON.stringify(l)}`);
      }
    }
    this.loot = opts.loot.map((l) => ({ itemId: l.itemId, count: l.count }));
    this.flag = flagKeyFor(opts.id, 'opened');
    this.opened = ctx.state.getBool(this.flag);
    this.offs.push(
      ctx.interaction.register({
        id: opts.id,
        kind: 'chest',
        position: (out) => opts.object.getWorldPosition(out),
        radius: opts.radius,
        name: opts.name,
        enabled: () => !this.opened,
        onInteract: () => this.open(),
      }),
      ctx.events.on('save.loaded', () => {
        this.opened = ctx.state.getBool(this.flag);
      }),
    );
  }

  dispose(): void {
    for (const off of this.offs.splice(0).reverse()) off();
  }

  private vetoPasses(): boolean {
    try {
      return this.opts.canOpen?.() === true;
    } catch (err) {
      console.warn(`Chest "${this.opts.id}": canOpen failed; staying shut`, err);
      return false;
    }
  }

  private open(): void {
    if (this.opened) return;
    if (this.opts.canOpen && !this.vetoPasses()) {
      try {
        this.opts.onRefused?.();
      } catch (err) {
        console.warn(`Chest "${this.opts.id}": onRefused failed`, err);
      }
      return;
    }
    this.opened = true;
    this.ctx.state.setFlag(this.flag, true);
    this.ctx.events.emit('loot.granted', { sourceId: this.opts.id, items: this.loot.map((l) => ({ ...l })) });
  }
}
