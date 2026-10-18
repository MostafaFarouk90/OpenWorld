import { describe, expect, it, vi } from 'vitest';
import type { Anchor } from '../layout/AnchorRegistry';
import { SaveSuspensions } from '../save/suspend';
import { ChaseDirector, type ChaseDef, type ChasePorts } from './ChaseDirector';
import type { P3, RouteNode } from './route';
import { CHASE } from './tuning';

const DT = 1 / 60;
const DEF: ChaseDef = { id: 'm10.rooftops', quest: { id: 'm10', liveUntil: 'o3' }, start: { anchor: 'chase.m10.0', radius: 4 }, restartAnchor: 'chase.m10.0', timer: 30 };
const NODES: RouteNode[] = [0, 1, 2, 3].map((i) => ({ id: `chase.m10.${i}`, position: { x: i * 50, y: 0, z: 0 }, kind: 'run' as const }));

function world() {
  const anchors = new Map<string, Anchor>(NODES.map((n) => [n.id, { id: n.id, position: { ...n.position }, yaw: 0 }]));
  const feet: P3 = { x: -30, y: 0, z: 0 };
  const quest = { live: true };
  const suspensions = new SaveSuspensions();
  const events: string[] = [];
  const teleports: P3[] = [];
  const ports: ChasePorts = {
    find: (id) => anchors.get(id),
    playerFeet: () => feet,
    live: () => quest.live,
    suspend: (r) => suspensions.suspend(r),
    teleport: (p) => {
      teleports.push({ ...p });
      Object.assign(feet, p);
      return Promise.resolve();
    },
    emit: {
      started: (id) => events.push(`started ${id}`),
      caught: (id, s) => events.push(`caught ${id} ${s.toFixed(1)}`),
      lost: (id, r) => events.push(`lost ${id} ${r}`),
    },
    warn: vi.fn(),
  };
  const d = new ChaseDirector(DEF, NODES, ports);
  const at = (x: number, z = 0) => Object.assign(feet, { x, y: 0, z });
  const ticks = (n: number, each?: () => void) => {
    for (let i = 0; i < n; i++) {
      each?.();
      d.fixedUpdate(DT);
    }
  };
  return { d, at, ticks, feet, quest, suspensions, events, teleports, ports };
}

describe('ChaseDirector', () => {
  it('arms while standing in the start box (no enter edge needed), emits started and holds the save', () => {
    const w = world();
    w.ticks(5);
    expect(w.d.active()).toBe(false);
    w.at(1, 1);
    w.d.fixedUpdate(DT);
    expect(w.events).toEqual(['started m10.rooftops']);
    expect(w.suspensions.active).toBe(true);
    expect(w.d.timer()).toMatchObject({ total: 30, phase: 'running' });
  });

  it('never starts while not live', () => {
    const w = world();
    w.quest.live = false;
    w.at(0);
    w.ticks(10);
    expect(w.events).toEqual([]);
  });

  it('caught within 2 m: chase.caught with the seconds, hold released, inactive', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.ticks(30, () => {
      const c = w.d.courier.position;
      w.at(c.x - 1.5);
    });
    expect(w.events.at(-1)).toMatch(/^caught m10.rooftops/);
    expect(w.suspensions.active).toBe(false);
    expect(w.d.active()).toBe(false);
    expect(w.d.timer()).toBeNull();
  });

  it('lost on the timer, then the Again card, then a restart from the start', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.ticks(Math.ceil(DEF.timer / DT) + 1, () => {
      const c = w.d.courier.position;
      w.at(c.x - 10); // keeps up, never closes
    });
    expect(w.events).toContain('lost m10.rooftops timer');
    expect(w.d.timer()?.phase).toBe('again');
    expect(w.d.active()).toBe(true); // music holds across the card
    expect(w.suspensions.active).toBe(true);
    expect(w.teleports.at(-1)).toEqual({ x: 0, y: 0, z: 0 });
    w.ticks(Math.ceil(CHASE.againSeconds / DT) + 1);
    expect(w.events.filter((e) => e.startsWith('started'))).toHaveLength(2);
  });

  it('lost on distance after 3 s above 45 m, not at 2.9 s', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    const far = () => {
      const c = w.d.courier.position;
      w.at(c.x - 50);
    };
    w.ticks(Math.floor(2.9 / DT), far);
    expect(w.events.some((e) => e.startsWith('lost'))).toBe(false);
    w.ticks(Math.ceil(0.2 / DT), far);
    expect(w.events).toContain('lost m10.rooftops distance');
  });

  it('combat loses it; a second loss in the same run is ignored', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.d.onCombat();
    w.d.onCombat();
    expect(w.events.filter((e) => e.startsWith('lost'))).toEqual(['lost m10.rooftops combat']);
  });

  it('aborts (death, travel, dialogue) emit lost once and release the hold; idle until re-armed', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.d.abort();
    w.d.abort();
    expect(w.events.filter((e) => e.startsWith('lost'))).toEqual(['lost m10.rooftops distance']);
    expect(w.suspensions.active).toBe(false);
    expect(w.d.active()).toBe(false);
  });

  it('the quest moving on mid-run ends it with a loss and releases the hold', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.quest.live = false;
    w.d.fixedUpdate(DT);
    expect(w.events.at(-1)).toBe('lost m10.rooftops distance');
    expect(w.suspensions.active).toBe(false);
  });

  it('load: idle with no hold, active false; cornered places the courier at the end', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.d.onLoaded(true);
    expect(w.d.active()).toBe(false);
    expect(w.suspensions.active).toBe(false);
    expect(w.d.courier.cornered).toBe(true);
    expect(w.d.courier.position.x).toBe(150);
  });

  it('dispose releases the hold', () => {
    const w = world();
    w.at(0);
    w.d.fixedUpdate(DT);
    w.d.dispose();
    expect(w.suspensions.active).toBe(false);
  });
});
