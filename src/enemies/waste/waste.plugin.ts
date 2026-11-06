import type { GamePlugin } from '../../core/plugins';
import { resolveLayout } from '../../region/resolveLayout';
import { heightAt } from '../../terrain/heightfield';
import { registerWasteRules } from './rules';
import { NAVE_HUSKS_FLAG } from './spawners';
import { WASTE_KILL_XP_FACTOR } from './tuning';
import { WASTE_FAUNA_LAYOUT } from './wasteFauna.layout';
import './spawners';

/** Eormen's boss id (L6) and the outcome that brings the nave's night husks (L6: 'released' or 'defeated'). */
export const EORMEN_BOSS_ID = 'eormen';
export const EORMEN_OUTCOME_FLAG = `boss.${EORMEN_BOSS_ID}.outcome`;

type StateLike = { getFlag(key: string): unknown; getBool(key: string, fallback: boolean): boolean; setFlag(key: string, v: boolean): void };

/** The nave's night husks rise only once Eormen has been defeated (not released). */
export function naveHusksDue(state: Pick<StateLike, 'getFlag'>): boolean {
  return state.getFlag(EORMEN_OUTCOME_FLAG) === 'defeated';
}

/**
 * Act 4 L5, the Waste creatures (plans/act4-L5.md): the `waste.fauna.*` anchors, the Ashen Waste's kill XP region factor,
 * the creatures' damage rules (the strider's leg trip, the Husk Knight's ember and rise, the gnats' scatter), and the derived
 * `world.waste.naveHusks` flag the D08 night group's gate reads. The bestiary rows are L9's to register (`WASTE_CODEX_ROWS`).
 */
const plugin: GamePlugin = {
  id: 'waste-creatures',
  dependsOn: ['core', 'enemies'],
  setup(ctx) {
    const offs: Array<() => void> = [];

    for (const a of resolveLayout(WASTE_FAUNA_LAYOUT, heightAt).anchors) {
      offs.push(ctx.anchors.define({ id: a.id, position: a.position, yaw: a.yaw, tags: a.tags }));
    }

    const factor = ctx.services.get('killXpRegionFactor');
    if (factor) offs.push(factor.set('ashen-waste', WASTE_KILL_XP_FACTOR));
    else console.warn('[waste-creatures] the killXpRegionFactor service is missing; Waste kills pay x 1');

    let clock = 0;
    offs.push(registerWasteRules({ addModifier: (id, m, order) => ctx.damage.addModifier(id, m, order), now: () => clock }));

    const state = ctx.state as unknown as StateLike;
    const syncNave = (): void => {
      const due = naveHusksDue(state);
      if (state.getBool(NAVE_HUSKS_FLAG, false) !== due) state.setFlag(NAVE_HUSKS_FLAG, due);
    };
    offs.push(ctx.events.on('save.loaded', () => syncNave()));
    offs.push(
      ctx.events.on('flag.changed', (e: { key: string }) => {
        if (e.key === EORMEN_OUTCOME_FLAG) syncNave();
      }),
    );
    syncNave();

    offs.push(
      ctx.systems.add({
        id: 'waste-creatures.tick',
        fixedPhase: 'afterCombat',
        order: 43,
        fixedUpdate(dt) {
          clock += dt;
        },
      }) as unknown as () => void,
    );

    (plugin as { _offs?: Array<() => void> })._offs = offs;
  },
  dispose() {
    const offs = (plugin as { _offs?: Array<() => void> })._offs;
    for (const off of (offs ?? []).reverse()) off();
    (plugin as { _offs?: Array<() => void> })._offs = undefined;
  },
};

export default plugin;
