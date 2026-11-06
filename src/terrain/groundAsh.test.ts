// Act 4 thread L1: the Ashen Waste's ground (plans/act4-L1.md section 3): the ash rule and its short blend, the Waste
// origin, and the glass-sand glints with their quality tiers.
import { describe, expect, it } from 'vitest';
import { GLASS_SCATTER, GROUND_RULES, WASTE_GROUND_ORIGIN, chunkGround, glassWeight, groundOriginFor, groundWeights, grassRule, ruleBlend } from './ground';
import { GLASS_TIER, createGroundMaterial, injectGround, releaseGroundUniforms, setGroundGlassTier } from './groundShader';
import { heightAt } from './heightfield';
import { GLASSLANDS, GLASSLANDS_PLAIN } from './shape/waste';

describe('the ash rule', () => {
  it('is 1 inside the Waste and fades out within 150 m, never painting the Dragonspine or Harrowmark', () => {
    expect(ruleBlend('ash')).toBe(150);
    expect(groundWeights(9000, 7000).ash).toBe(1);
    expect(groundWeights(9000, 4425).ash).toBeGreaterThan(0);
    expect(groundWeights(9000, 4425).ash).toBeLessThan(1);
    // Harrowmark's north fields and the Dragonspine's south edge.
    expect(groundWeights(9000, 4340).ash).toBe(0);
    expect(groundWeights(12000, 11160).ash).toBe(0);
    // The other rules keep their 600 m blend.
    expect(ruleBlend('dragonspine')).toBe(600);
  });

  it('greys the soil and thins the grass to dead tufts', () => {
    const r = GROUND_RULES.ash;
    expect(Math.min(...r.soil)).toBeGreaterThan(0.3);
    const g = grassRule(9000, 7000);
    expect(g.tint).toEqual(r.grass);
    expect(g.density).toBeCloseTo(0.15, 6);
  });

  it('samples the Waste origin in Waste chunks', () => {
    expect(groundOriginFor(9000, 7000, 800)).toBe('waste');
    expect(groundOriginFor(13000, 14000, 800)).toBe('dragonspine');
    expect(WASTE_GROUND_ORIGIN).toEqual({ x: 11000, z: 8000 });
  });
});

describe('the glass glints', () => {
  it('are full on the glass-sand plain, scattered and weaker elsewhere on the ash, none off it', () => {
    expect(glassWeight(GLASSLANDS[0], GLASSLANDS[1])).toBe(1);
    expect(glassWeight((GLASSLANDS_PLAIN.box.minX + GLASSLANDS_PLAIN.box.maxX) / 2, GLASSLANDS_PLAIN.box.maxZ)).toBe(1);
    let peak = 0;
    for (let x = 7500; x < 9500; x += 53) for (let z = 7000; z < 10000; z += 59) peak = Math.max(peak, glassWeight(x, z));
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(GLASS_SCATTER + 1e-9);
    expect(glassWeight(8500, 2000)).toBe(0);
  });

  it('ride the ground.x channel in a Waste chunk (and the ash-fog channel stays empty)', () => {
    const cg = chunkGround(GLASSLANDS[0], GLASSLANDS[1], 200, heightAt)!;
    const colors = new Float32Array([0.2, 0.4, 0.2]);
    const ground = new Float32Array(2);
    cg.vertex(GLASSLANDS[0], GLASSLANDS[1], heightAt(GLASSLANDS[0], GLASSLANDS[1]), 1, colors, 0, ground, 0);
    expect(ground[0]).toBeCloseTo(1, 6);
    expect(ground[1]).toBe(0);
    expect(colors[0]).toBeCloseTo(GROUND_RULES.ash.soil[0], 2);
  });

  it('follow the quality tier on every live Waste material: Low none, Medium glints, High sparkle', () => {
    const waste = createGroundMaterial({}, 'waste');
    const act2 = createGroundMaterial({}, 'act2');
    expect(waste.uniforms.uGroundWaste.value).toBe(1);
    expect(act2.uniforms.uGroundWaste.value).toBe(0);
    setGroundGlassTier(GLASS_TIER.low);
    expect(waste.uniforms.uGroundGlass.value).toBe(0);
    setGroundGlassTier(GLASS_TIER.high);
    expect(waste.uniforms.uGroundGlass.value).toBe(2);
    expect(act2.uniforms.uGroundGlass.value).toBe(0);
    const later = createGroundMaterial({}, 'waste');
    expect(later.uniforms.uGroundGlass.value).toBe(2);
    releaseGroundUniforms(waste.uniforms);
    setGroundGlassTier(GLASS_TIER.medium);
    expect(waste.uniforms.uGroundGlass.value).toBe(2);
    expect(later.uniforms.uGroundGlass.value).toBe(1);
    releaseGroundUniforms(later.uniforms);
    for (const m of [waste, act2, later]) m.material.dispose();
  });

  it('are gated in the shader: no glint below tier 1, no view-angle term below tier 2, no embers on the Waste', () => {
    const { fragment } = injectGround('#include <common>\n#include <project_vertex>', '#include <common>\n#include <color_fragment>\n#include <emissivemap_fragment>');
    expect(fragment).toContain('step(0.5, tier)');
    expect(fragment).toContain('tier > 1.5');
    expect(fragment).toContain('(1.0 - uGroundWaste)');
  });
});
