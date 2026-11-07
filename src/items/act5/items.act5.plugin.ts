// Act 5 N7: registers the Act 5 item strings, Alric's rim anvil, the worn trinket's heat ward (service `heatWard`), the
// Regent's Gauntlet poise bonus and the Ember Crown's warmth after the ending.
import * as THREE from 'three';
import { PLAYER_ID } from '../../actors/teams';
import type { GameContext } from '../../core/Game';
import type { GamePlugin } from '../../core/plugins';
import { Chest } from '../../interaction/Chest';
import { FOUNDRY_CHEST, FOUNDRY_CHEST_ANCHOR } from '../../gear/tier5/fragments';
import { RIM_ANVIL_ALRIC } from '../../economy/rimCamp.act5';
import { ACT5_TRINKETS } from './catalog';
import { AFTER_ENDING_FLAG, CROWN_WARMTH, crownWarmth } from './crown';
import { heatWard, type HeatWardService } from './heatWard';
import { ITEMS_ACT5_STRINGS_EN } from './strings.en';

interface SoftGear {
  openRimAnvil?(): boolean;
}
interface SoftProgression {
  addMaxHealthModifier?(id: string, fn: () => number): () => void;
  refreshMaxHealth?(): void;
}

export const FORGE_ALRIC_ID = 'use:forge-alric';
export const GAUNTLET = { poiseBonus: 0.1, modifier: { id: 'gear.gauntlet.poise', order: -109 } } as const;

/** The Gauntlet's poise on the player's own hits (not status ticks). */
export function gauntletPoise(req: { attackerId?: string | null; kind?: string; poise: number }, playerId: string, trinket: string | null): number {
  return trinket === ACT5_TRINKETS.regentsGauntlet && req.attackerId === playerId && req.kind !== 'status' ? req.poise * (1 + GAUNTLET.poiseBonus) : req.poise;
}

let offs: (() => void)[] = [];

const itemsAct5Plugin: GamePlugin = {
  id: 'items-act5',
  dependsOn: ['core', 'inventory', 'progression'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', ITEMS_ACT5_STRINGS_EN);
    const inventory = ctx.services.require('inventory');
    const soft = <T>(name: string): T | undefined => (ctx.services as unknown as { get(n: string): unknown }).get(name) as T | undefined;

    const service: HeatWardService = { heatWard: () => heatWard(inventory.equipped('trinket')) };
    ctx.services.provide('heatWard', service);

    offs.push(
      ctx.damage.addModifier(
        GAUNTLET.modifier.id,
        (req) => {
          req.poise = gauntletPoise(req, PLAYER_ID, inventory.equipped('trinket'));
        },
        GAUNTLET.modifier.order,
      ),
    );

    // The Crown's warmth: a max-health multiplier read live; a refresh when the trinket or the world changes.
    const progression = soft<SoftProgression>('progression');
    const afterEnding = (): boolean => ctx.state.getBool(AFTER_ENDING_FLAG);
    if (progression?.addMaxHealthModifier) {
      offs.push(progression.addMaxHealthModifier(CROWN_WARMTH.id, () => crownWarmth(inventory.equipped('trinket'), afterEnding())));
      const refresh = (): void => progression.refreshMaxHealth?.();
      offs.push(
        ctx.events.on('inventory.equipped', (e) => e.slot === 'trinket' && refresh()),
        ctx.events.on('save.loaded', refresh),
        ctx.events.on('flag.changed', (e) => e.key === AFTER_ENDING_FLAG && refresh()),
      );
    }

    // The Foundry's fragment chest (N2 places the anchor and crate; the interior defines its anchors when it sets up, so look
    // each tick until it is there). Opens once, persists in chest.foundry-cache.opened, pays one forge-heart fragment.
    let chest: Chest | null = null;
    const offChest = ctx.systems.add({
      id: 'items-act5.foundry-chest',
      fixedPhase: 'late',
      order: 900,
      fixedUpdate: () => {
        if (chest) return;
        const a = ctx.anchors.find(FOUNDRY_CHEST_ANCHOR);
        if (!a) return;
        const object = new THREE.Group();
        object.position.set(a.position.x, a.position.y, a.position.z);
        chest = new Chest(ctx, { id: FOUNDRY_CHEST.id, object, loot: FOUNDRY_CHEST.loot.map((l) => ({ ...l })) });
      },
    });
    offs.push(offChest, () => {
      chest?.dispose();
      chest = null;
    });

    // Alric's rim anvil (tier 5 forging, tempering). Standing from M47; the screen stays cold until M50 (gear.rim.cold).
    ctx.interaction.register({
      id: FORGE_ALRIC_ID,
      kind: 'use',
      name: 'alric',
      promptKey: 'gear.smith.prompt',
      priority: -0.01,
      position: (out) => {
        const a = ctx.anchors.find(RIM_ANVIL_ALRIC);
        return a ? out.set(a.position.x, a.position.y, a.position.z) : out.set(0, -1e6, 0);
      },
      enabled: () => ctx.state.getBool('story.m47.complete') && !!ctx.anchors.find(RIM_ANVIL_ALRIC),
      onInteract: () => void soft<SoftGear>('gear')?.openRimAnvil?.(),
    });
  },
  dispose() {
    for (const off of offs) off();
    offs = [];
  },
};

export default itemsAct5Plugin;
