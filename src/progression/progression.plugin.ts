import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import '../hud/events';
import { hudDocument, asHtml, emitLoose, injectCss, soft } from '../hud/soft';
import { HUD_CSS } from '../hud/hudStyles';
import type { ActorPort, ProgressionService } from '../hud/ports';
import { Abilities } from './abilities';
import { Progression } from './Progression';
import { SkillMenu } from './SkillMenu';
import { SKILL_STRINGS_EN } from './strings.en';
import { BAR_SLOTS } from './tuning';

const progressionPlugin: GamePlugin = {
  id: 'progression',
  dependsOn: ['core'],
  setup(ctx: GameContext) {
    ctx.strings.register('en', SKILL_STRINGS_EN);
    const emit = emitLoose(ctx);
    const warn = { warn: (m: string) => console.warn(m) };
    const player = (): ActorPort => ctx.actors.player;
    const progression = new Progression({ emit, logger: warn, actor: player });
    // A fresh game starts at full health on the new maximum; a loaded save restores its own health later.
    const start = player();
    const wasFull = start.health >= start.maxHealth;
    progression.applyMaxHealth();
    if (wasFull) start.health = start.maxHealth;

    const abilities = new Abilities({
      progression,
      spells: () => soft(ctx, 'spells'),
      caster: player,
      ctx: () => ctx,
      emit,
      logger: warn,
      // Used only while no thread registered a handler for the skill (thread 7 registers Rally Cry).
      fallback: ({ ctx: c }) => {
        const pos = { x: ctx.actors.player.root?.position.x ?? 0, y: ctx.actors.player.root?.position.y ?? 0, z: ctx.actors.player.root?.position.z ?? 0 };
        soft(c as GameContext, 'vfx')?.spawnEffect('skill-q', { position: pos });
        return { ok: true };
      },
    });

    ctx.services.provide('progression', progression as ProgressionService);
    ctx.services.provide('abilities', abilities);
    ctx.persist.register({
      key: Progression.key,
      version: Progression.version,
      serialize: () => progression.serialize(),
      load: (data) => progression.load(data),
    });
    // Other persistables (the player's health) load around us: recompute once everything is in.
    ctx.events.on('save.loaded', () => progression.applyMaxHealth());

    ctx.events.on('actor.died', (e) => {
      progression.onKill({ actorId: e.actorId, kind: e.kind, team: e.team, level: e.level, killerId: e.killerId });
    });
    ctx.events.on('mercy', (e) => {
      if (!e.actorId) return;
      progression.onMercy({ actorId: e.actorId, kind: e.creature, level: ctx.actors.get(e.actorId)?.level ?? 1 });
    });
    ctx.events.on('mercy.revoked', (e) => progression.onMercyRevoked(e.actorId));
    ctx.events.on('xp.grant', (e) => {
      progression.grantXp(e.amount, e.source);
    });

    let close: (() => void) | null = null;
    const toggleMenu = (): void => {
      if (close) {
        close();
        return;
      }
      injectCss(HUD_CSS);
      const menu = new SkillMenu(hudDocument(), {
        progression,
        t: (k, p) => ctx.strings.t(k, p),
        close: () => close?.(),
        onLearn: () => ctx.services.get('prompts')?.success('skills'),
        onRefused: () => emit('hud.toast', { textKey: 'hud.skills.refused' }),
      });
      const closer = ctx.hud.openModal({
        id: 'skills',
        element: asHtml(menu.element),
        dispose: () => {
          close = null;
        },
      });
      if (!closer) return;
      close = closer;
    };

    ctx.systems.add({
      id: 'progression.fixed',
      fixedPhase: 'input',
      order: 5,
      fixedUpdate() {
        abilities.tick();
        const actions = ctx.input.actions;
        if (actions.pressed('skills')) toggleMenu();
        for (let slot = 0; slot < BAR_SLOTS; slot++) {
          if (!actions.pressed(`ability${slot + 1}` as 'ability1')) continue;
          const result = abilities.use(slot);
          if (result.ok) ctx.services.get('prompts')?.success('ability');
          else emit('ability.failed', { slot, reason: result.reason });
        }
      },
    });
  },
};

export default progressionPlugin;
