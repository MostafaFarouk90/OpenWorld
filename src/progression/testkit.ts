import type { ActorPort } from '../hud/ports';
import { Progression } from './Progression';

export interface Evt {
  type: string;
  payload: any;
}

export function fakeActor(over: Partial<{ health: number; maxHealth: number; dead: boolean }> = {}): ActorPort & { dead: boolean } {
  return {
    id: 'player',
    kind: 'player',
    team: 'player',
    level: 1,
    health: over.health ?? 120,
    maxHealth: over.maxHealth ?? 120,
    stamina: 100,
    maxStamina: 100,
    dead: over.dead ?? false,
    restoreStamina() {},
  };
}

export function makeProgression(actor: ActorPort | null = fakeActor()) {
  const events: Evt[] = [];
  const warnings: string[] = [];
  const p = new Progression({
    emit: (type, payload) => events.push({ type, payload }),
    logger: { warn: (m) => warnings.push(m) },
    actor: () => actor,
  });
  return { p, events, warnings, actor };
}
