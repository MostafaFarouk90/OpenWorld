import { describe, expect, it } from 'vitest';
import { EDRIC_BLADE_NAME } from '../companions/act4/edric';
import * as THREE from 'three';
import { ESCORT_ALLIES, ESCORT_ALLY_IDS, allyNpcDef, isEscortAlly, memberSpec } from './allies';

describe('escort allies (L4)', () => {
  it('lists Edric, Rook and the watch, the M35 delegations, twelve miners and the carter', () => {
    for (const id of ['edric', 'rook', 'watch.1', 'watch.2', 'delegate.halvard', 'delegate.oswin', 'delegate.grisel', 'carter']) expect(isEscortAlly(id), id).toBe(true);
    expect(ESCORT_ALLY_IDS.filter((id) => id.startsWith('miner.'))).toHaveLength(12);
    expect(ESCORT_ALLY_IDS.filter((id) => id.startsWith('guard.'))).toHaveLength(6);
    expect(isEscortAlly('gaut')).toBe(false);
    expect(isEscortAlly('toString')).toBe(false);
  });

  it('Edric and the walkers never fight; Rook, the watch and the guards do', () => {
    expect(ESCORT_ALLIES.edric.role).toBe('walker');
    expect(ESCORT_ALLIES['miner.1'].role).toBe('walker');
    expect(ESCORT_ALLIES.carter.role).toBe('walker');
    expect(ESCORT_ALLIES.rook.role).toBe('fighter');
    expect(ESCORT_ALLIES['guard.grisel.2'].role).toBe('fighter');
  });

  it('Edric keeps the shipped look (Rogue at 0.72, gold) and carries the blade only when R22 chose one', () => {
    const none = allyNpcDef('edric', () => undefined)!;
    expect(none.model).toBe('rogue');
    expect(none.scale).toBe(0.72);
    expect(none.tint).toBe(0xd9b23a);
    const m = new THREE.Group();
    none.decorate?.(m);
    expect(m.getObjectByName(EDRIC_BLADE_NAME)).toBeUndefined();
    const light = allyNpcDef('edric', (k) => (k === 'story.r22.choice' ? 'light' : undefined))!;
    light.decorate!(m);
    expect(m.getObjectByName(EDRIC_BLADE_NAME)?.userData.blade).toBe('light');
  });

  it('memberSpec builds a placeholder body headless and refuses unknown ids', () => {
    const s = memberSpec('miner.3', null, () => undefined)!;
    expect(s.role).toBe('walker');
    const body = s.makeBody();
    expect(body.root).toBeInstanceOf(THREE.Object3D);
    body.dispose();
    expect(memberSpec('nobody', null, () => undefined)).toBeNull();
  });
});
