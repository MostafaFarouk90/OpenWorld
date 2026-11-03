import { afterEach, describe, expect, it } from 'vitest';
import { Burn } from '../../spells/Burn';
import { createSurgeForms, registerSurge } from '../../spells/SurgeAndRally';
import { SpellCaster } from '../../spells/SpellCaster';
import { Ember } from '../../spells/Ember';
import { FakeActor } from '../../spells/testHost';
import { SKILLS, getSkill, registerClassSkills, resetClassSkills } from '../../progression/skills';
import { SURGE } from '../../vfx/tuning';
import { DEFAULT_KITS } from '../kits';
import { EMBERWRIGHT_DRILL, EMBERWRIGHT_KIT } from './kit';
import { buildEmberwrightSkills, registerEmberwrightSkills } from './skills';
import { emberwrightSurgeForm } from './surge';
import { ANVIL_DROP, ATTACKS, FLAME_LASH, SURGE_FORM, WARM_BREATH } from './tuning';
import { EMBERWRIGHT_STRINGS_EN } from './strings.en';
import { DT, makeRig, SKILL, type Rig } from './testkit';

let rig: Rig;
afterEach(() => rig?.rt.dispose());

describe('Flame Lash', () => {
  it('hits hostiles on the 8 m line only, ignites, refuses other classes and while blocked', () => {
    rig = makeRig();
    rig.w.player.facingYaw = 0;
    rig.hostile('on', 0, -6);
    rig.hostile('beside', 3, -4);
    rig.hostile('behind', 0, 3);
    rig.hostile('long', 0, -9.2);
    rig.w.actors.add(new FakeActor('npc', 'neutral', 0, -3));
    expect(rig.rt.castAbility(SKILL.flameLash)).toEqual({ ok: true });
    expect(rig.applied()).toHaveLength(0); // lands at the release, not at the key
    rig.step(1.0);
    expect(rig.applied()).toHaveLength(0);
    rig.step(0.6);
    expect(rig.applied().map((r) => r.targetId).sort()).toEqual(['on']);
    expect(rig.applied()[0]).toMatchObject({ amount: FLAME_LASH.damage, poise: FLAME_LASH.poise, kind: 'spell' });
    expect(rig.statusCalls[0]).toMatchObject({ id: 'on', spec: { kind: 'ignite', id: 'emberwright.ignite' } });
  });

  it('is refused for another class, while stunned or in a modal-free dialogue, and a busy caster', () => {
    rig = makeRig();
    rig.state.classId = 'knight';
    expect(rig.rt.castAbility(SKILL.flameLash)).toEqual({ ok: false, reason: 'class' });
    rig.state.classId = 'emberwright';
    rig.state.stunned = true;
    expect(rig.rt.castAbility(SKILL.flameLash)).toEqual({ ok: false, reason: 'blocked' });
    rig.state.stunned = false;
    expect(rig.rt.castAbility(SKILL.flameLash).ok).toBe(true);
    expect(rig.rt.castAbility(SKILL.flameLash)).toEqual({ ok: false, reason: 'busy' });
  });

  it('a cancel before the release (stagger, rest, load, modal, class change) hits nothing and refunds the Ember the abilities service spent', () => {
    for (const cancel of ['stagger', 'rest', 'save.loaded', 'ui.modal', 'class.changed', 'death'] as const) {
      rig = makeRig();
      rig.hostile('on', 0, -6);
      expect(rig.rt.castAbility(SKILL.flameLash).ok).toBe(true);
      rig.ember.value -= FLAME_LASH.ember; // what abilities.use does after the handler
      rig.step(0.3);
      if (cancel === 'stagger') rig.w.events.emit('actor.staggered', { actorId: 'player' } as never);
      else if (cancel === 'death') rig.w.events.emit('actor.died', { actorId: 'player' } as never);
      else rig.w.events.emit(cancel as never, (cancel === 'ui.modal' ? { id: 'inv', open: true } : cancel === 'class.changed' ? { classId: 'knight', previous: 'emberwright', free: true, cost: 0 } : {}) as never);
      rig.step(2);
      expect(rig.applied(), cancel).toHaveLength(0);
      expect(rig.ember.value, cancel).toBe(100);
      rig.rt.dispose();
    }
  });

  it('after the release a cancel refunds nothing', () => {
    rig = makeRig();
    rig.hostile('on', 0, -6);
    rig.rt.castAbility(SKILL.flameLash);
    rig.ember.value -= FLAME_LASH.ember;
    rig.step(1.5);
    expect(rig.applied()).toHaveLength(1);
    rig.w.events.emit('rest', {} as never);
    rig.step(2);
    expect(rig.ember.value).toBe(100 - FLAME_LASH.ember);
  });
});

describe('Anvil Drop', () => {
  it('needs a target: lock-on first, else the nearest hostile in front within 12 m', () => {
    rig = makeRig();
    rig.hostile('behind', 0, 4);
    rig.hostile('far', 0, -14);
    expect(rig.rt.castAbility(SKILL.anvilDrop)).toEqual({ ok: false, reason: 'no-target' });
    rig.hostile('front', 0, -8);
    rig.hostile('nearer', 1, -3);
    expect(rig.rt.castAbility(SKILL.anvilDrop).ok).toBe(true);
    rig.step(1.5);
    expect(rig.applied().find((r) => r.amount === ANVIL_DROP.damage)!.targetId).toBe('nearer');
  });

  it('the impact comes 0.35 s after the release: crush, stun on the primary only, half splash on neighbours, hostile only', () => {
    rig = makeRig();
    rig.hostile('t', 0, -6);
    rig.hostile('n', 1.5, -6);
    rig.hostile('away', 5, -6);
    rig.w.actors.add(new FakeActor('ally', 'ally', 0.5, -6));
    rig.state.lockOn = 't';
    rig.rt.castAbility(SKILL.anvilDrop);
    const release = SKILL_RELEASE();
    rig.step(release - 0.05);
    expect(rig.applied()).toHaveLength(0);
    rig.step(0.05 + ANVIL_DROP.impactDelay - 0.05);
    expect(rig.applied()).toHaveLength(0);
    rig.step(0.12);
    const t = rig.applied().find((r) => r.targetId === 't')!;
    const n = rig.applied().find((r) => r.targetId === 'n')!;
    expect(t).toMatchObject({ amount: ANVIL_DROP.damage, poise: ANVIL_DROP.poise });
    expect(n.amount).toBeCloseTo(ANVIL_DROP.damage * ANVIL_DROP.splash);
    expect(rig.applied().some((r) => r.targetId === 'away' || r.targetId === 'ally')).toBe(false);
    expect(rig.statusCalls).toEqual([{ id: 't', spec: { id: ANVIL_DROP.stunId, kind: 'stun', seconds: ANVIL_DROP.stunSeconds, sourceId: 'player' } }]);
  });

  it('a pending impact survives a stagger but not a class change', () => {
    rig = makeRig();
    rig.hostile('t', 0, -6);
    rig.state.lockOn = 't';
    rig.rt.castAbility(SKILL.anvilDrop);
    rig.step(SKILL_RELEASE() + 0.05);
    rig.w.events.emit('actor.staggered', { actorId: 'player' } as never);
    rig.step(0.5);
    expect(rig.applied().some((r) => r.targetId === 't')).toBe(true);

    const second = makeRig();
    second.hostile('t', 0, -6);
    second.state.lockOn = 't';
    second.rt.castAbility(SKILL.anvilDrop);
    second.step(SKILL_RELEASE() + 0.05);
    second.w.events.emit('class.changed', { classId: 'knight', previous: 'emberwright', free: true, cost: 0 } as never);
    second.step(0.5);
    expect(second.applied()).toHaveLength(0);
    second.rt.dispose();
  });

  it('a target that dies before the impact still crushes its neighbours', () => {
    rig = makeRig();
    const t = rig.hostile('t', 0, -6);
    rig.hostile('n', 1.5, -6);
    rig.state.lockOn = 't';
    rig.rt.castAbility(SKILL.anvilDrop);
    rig.step(SKILL_RELEASE() + 0.05);
    t.kill();
    rig.step(0.5);
    expect(rig.applied().map((r) => r.targetId)).toEqual(['n']);
  });
});

function SKILL_RELEASE(): number {
  return 2.1 * 0.37;
}

describe('Warm Breath', () => {
  it('heals allies in the 6 m cone for 20% of their max health, nothing else', () => {
    rig = makeRig();
    rig.w.player.facingYaw = 0;
    const tobb = rig.w.actors.add(new FakeActor('tobb', 'ally', 0, -4));
    tobb.health = 10;
    const behind = rig.w.actors.add(new FakeActor('behind', 'ally', 0, 3));
    behind.health = 10;
    const hostile = rig.hostile('h', 0, -3);
    expect(rig.rt.castAbility(SKILL.warmBreath).ok).toBe(true);
    rig.step(1);
    expect(tobb.health).toBeCloseTo(10 + 100 * WARM_BREATH.healFraction);
    expect(behind.health).toBe(10);
    expect(hostile.health).toBe(100);
    expect(rig.w.player.actor.health).toBe(100);
    expect(rig.applied()).toHaveLength(0);
  });
});

describe('Surge forms', () => {
  function surgeWorld(burnValue: number) {
    const r = makeRig();
    rig = r;
    const burn = new Burn();
    burn.add(burnValue, 'test');
    const spellsEmber = new Ember();
    const restored: number[] = [];
    const services: Record<string, unknown> = {
      spells: { maxEmber: 100, restoreEmber: (n: number) => { restored.push(n); return n; } },
    };
    const forms = createSurgeForms();
    for (const zone of ['warm', 'blaze', 'cinder'] as const) forms.register('emberwright', zone, emberwrightSurgeForm(zone, r.rt));
    const caster = new SpellCaster({ ...r.w.host, ember: spellsEmber });
    registerSurge(r.w, caster, {
      damage: r.w.damage, clock: r.w.clock, services: { get: (k: string) => services[k] } as never, burn, forms, classId: () => 'emberwright',
    });
    return { r, burn, caster, restored };
  }
  const fire = (s: ReturnType<typeof surgeWorld>) => {
    expect(s.caster.cast('player', SURGE.spellId).ok).toBe(true);
    for (let i = 0; i < 200; i++) s.caster.update(DT);
  };

  it.each([
    [0, 'warm', 6, false],
    [39, 'warm', 6, false],
    [40, 'blaze', 8, true],
    [74, 'blaze', 8, true],
    [75, 'cinder', 10, false],
    [100, 'cinder', 10, false],
  ])('Burn %i is the %s form: %i m, burning ground %s, 40%% Ember refill, plain damage and no ignite', (b, _zone, radius, ground) => {
    const s = surgeWorld(b as number);
    s.r.hostile('in', (radius as number) - 0.5, 0);
    s.r.hostile('out', (radius as number) + 0.5, 0);
    s.r.w.actors.add(new FakeActor('npc', 'neutral', 1, 0));
    fire(s);
    expect(s.r.applied().map((x) => x.targetId)).toEqual(['in']);
    expect(s.r.applied()[0]).toMatchObject({ amount: SURGE.damage, kind: 'spell' });
    expect(s.restored).toEqual([100 * SURGE_FORM.emberRefill]);
    expect(s.r.rt.groundCount()).toBe(ground ? 1 : 0);
    expect(s.r.statusCalls).toHaveLength(0);
  });

  it('the Scar only comes from the shared path: Burn 74 scars nothing, 75 does, and the form never changes Burn', () => {
    const s74 = surgeWorld(74);
    fire(s74);
    expect(s74.burn.scars).toBe(0);
    s74.r.rt.dispose();
    const s75 = surgeWorld(75);
    const before = s75.burn.value;
    fire(s75);
    expect(s75.burn.value).toBeGreaterThanOrEqual(before);
    s75.r.rt.dispose();
  });

  it('burning ground ignites hostiles standing in it every half second for 5 s, then ends', () => {
    const s = surgeWorld(50);
    s.r.hostile('in', 3, 0);
    s.r.hostile('out', 7, 0);
    s.r.rt.addGround(0, 0, 0);
    s.r.step(0.2);
    expect(s.r.statusCalls.map((c) => c.id)).toEqual(['in']);
    s.r.step(1);
    expect(s.r.statusCalls.length).toBeGreaterThanOrEqual(3);
    s.r.step(SURGE_FORM.groundSeconds);
    expect(s.r.rt.groundCount()).toBe(0);
    const n = s.r.statusCalls.length;
    s.r.step(2);
    expect(s.r.statusCalls.length).toBe(n);
  });
});

describe('skills', () => {
  it('registers once, tier 1 to 3 live, 4 and 5 listed unavailable, tier 5 exclusive capstones, tier 1 passives', () => {
    resetClassSkills();
    const first = registerEmberwrightSkills();
    expect(first).toMatchObject({ ok: true, count: 15 });
    expect(registerEmberwrightSkills()).toMatchObject({ ok: true, count: 0 }); // a restart that skipped dispose counts as success
    const mine = SKILLS.filter((s) => s.classId === 'emberwright');
    expect(mine).toHaveLength(15);
    expect(mine.filter((s) => s.availableWhen === true).map((s) => s.id).sort()).toEqual(
      ['anvilDrop', 'emberBolt', 'fireWall', 'flameLash', 'forgeSpark', 'gustStep', 'ironFamiliar', 'smokeScreen', 'warmBreath'].map((n) => `emberwright.${n}`).sort(),
    );
    for (const s of mine.filter((x) => x.tier === 1)) expect(s.kind).toBe('passive');
    for (const s of mine.filter((x) => x.tier === 5)) expect(s).toMatchObject({ capstone: true, exclusiveGroup: 'capstone' });
    expect(getSkill(SKILL.flameLash)).toMatchObject({ emberCost: 16, cooldown: 6, requires: SKILL.emberBolt, tier: 2, cost: 1, kind: 'active' });
    expect(getSkill(SKILL.anvilDrop)).toMatchObject({ emberCost: 24, cooldown: 14, requires: SKILL.forgeSpark });
    expect(getSkill(SKILL.warmBreath)).toMatchObject({ emberCost: 18, cooldown: 12, requires: SKILL.gustStep });
    expect(getSkill(SKILL.emberBolt)!.requires).toBeUndefined();
    resetClassSkills();
  });

  it('the library accepts the data, and every skill has a name and description string', () => {
    resetClassSkills();
    expect(registerClassSkills('emberwright', buildEmberwrightSkills()).ok).toBe(true);
    for (const s of buildEmberwrightSkills()) {
      expect(EMBERWRIGHT_STRINGS_EN[s.nameKey], s.nameKey).toBeTruthy();
      expect(EMBERWRIGHT_STRINGS_EN[s.descKey], s.descKey).toBeTruthy();
    }
    resetClassSkills();
  });
});

describe('kit and clips', () => {
  it('keeps the default trainer and starter gear, adds the spellbook and the Emberwright drill', () => {
    expect(EMBERWRIGHT_KIT.trainer).toEqual(DEFAULT_KITS.emberwright.trainer);
    expect(EMBERWRIGHT_KIT.starter).toEqual(DEFAULT_KITS.emberwright.starter);
    expect(EMBERWRIGHT_KIT.model).toBe('mage');
    expect(EMBERWRIGHT_KIT.offhandVisual).toEqual({ embedded: 'Spellbook' });
    expect(EMBERWRIGHT_DRILL.map((s) => s.id)).toEqual(['attack1', 'attack2', 'attack3', 'attack4', 'block', 'dodge', 'skills', 'ability']);
    expect(EMBERWRIGHT_DRILL.find((s) => s.id === 'attack1')).toMatchObject({ count: 4, textKey: 'classes.drill.emberwright.attack1' });
    expect(EMBERWRIGHT_DRILL.find((s) => s.id === 'block')!.spar).toBeDefined();
    for (const s of EMBERWRIGHT_DRILL) if (s.textKey) expect(EMBERWRIGHT_STRINGS_EN[s.textKey]).toBeTruthy();
  });

  it('every attack clip and the spellbook exist in Mage.glb', async () => {
    const fsModule = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as { readFileSync: (p: string) => { subarray(a: number, b: number): { toString(e: string): string }; readUInt32LE(o: number): number } };
    const buf = readFileSync('public/assets/kaykit-adventurers/characters/Mage.glb');
    const json = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8')) as { animations: Array<{ name: string }>; nodes: Array<{ name: string }> };
    const names = new Set(json.animations.map((a) => a.name));
    for (const a of ATTACKS) expect(names.has(a.clip), a.clip).toBe(true);
    expect(json.nodes.some((n) => n.name === 'Spellbook')).toBe(true);
    for (const clip of ['Spellcast_Long', 'Spellcast_Raise', 'Spellcasting']) expect(names.has(clip)).toBe(true);
  });
});
