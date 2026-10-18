import { angleDegrees } from './lookAt';
import type { DirectorEvent, GoalSpec, GoalTracker, StateQuery, TickSample } from './types';

/** Kind-specific logic; the wrapper in `createGoal` adds the "once done, stays done" latch. */
interface Impl {
  done(): boolean;
  progress(): number;
  onEvent?(e: DirectorEvent): void;
  tick?(s: TickSample, q: StateQuery): void;
  sync?(q: StateQuery): void;
  restore(progress: number): void;
  detail?(): string | null;
}

function simple(
  match: (e: DirectorEvent) => boolean,
  syncCheck?: (q: StateQuery) => boolean,
  tickCheck?: (q: StateQuery) => boolean,
): Impl {
  let hit = false;
  return {
    done: () => hit,
    progress: () => (hit ? 1 : 0),
    onEvent(e) {
      if (match(e)) hit = true;
    },
    tick(_s, q) {
      if (tickCheck && tickCheck(q)) hit = true;
    },
    sync(q) {
      if (syncCheck && syncCheck(q)) hit = true;
    },
    restore(p) {
      hit = p >= 1;
    },
  };
}

function killGoal(spec: Extract<GoalSpec, { kind: 'kill' }>): Impl {
  let credited = 0;
  const seen = new Set<string>();
  const credit = (actorId: string | undefined): void => {
    if (actorId !== undefined) {
      if (seen.has(actorId)) return;
      seen.add(actorId);
    }
    credited = Math.min(spec.count, credited + 1);
  };
  return {
    done: () => credited >= spec.count,
    progress: () => credited,
    onEvent(e) {
      if (e.type === 'kill') {
        if (e.byPlayer && e.kind === spec.creature && e.spawnTag === spec.spawnTag) credit(e.actorId);
      } else if (e.type === 'mercy') {
        if (e.creature === spec.creature && e.spawnTag === spec.spawnTag) credit(e.actorId);
      }
    },
    restore(p) {
      credited = Math.max(0, Math.min(spec.count, Math.floor(p)));
    },
  };
}

function gazeGoal(spec: Extract<GoalSpec, { kind: 'gaze' }>): Impl {
  const n = spec.anchors.length;
  let index = 0;
  let dwell = 0;
  const skipMissing = (q: StateQuery): void => {
    while (index < n && q.anchor(spec.anchors[index]) === null) {
      index++;
      dwell = 0;
    }
  };
  return {
    done: () => index >= n,
    progress: () => index,
    tick(s, q) {
      skipMissing(q);
      if (index >= n || !s.camera) return;
      const a = q.anchor(spec.anchors[index]);
      if (!a) return;
      if (angleDegrees(s.camera.position, s.camera.forward, a) <= spec.degrees) {
        dwell += s.dt;
        if (dwell >= spec.dwell) {
          index++;
          dwell = 0;
        }
      } else {
        dwell = 0;
      }
    },
    sync: skipMissing,
    restore(p) {
      index = Math.max(0, Math.min(n, Math.floor(p)));
      dwell = 0;
    },
    detail: () => (index < n ? spec.anchors[index] : null),
  };
}

function countGoal(spec: Extract<GoalSpec, { kind: 'count' }>): Impl {
  let c = 0;
  return {
    done: () => c >= spec.count,
    progress: () => c,
    onEvent(e) {
      if (e.type === spec.event) c++;
    },
    restore(p) {
      c = Math.max(0, Math.floor(p));
    },
  };
}

/** Max believable single-tick step; anything larger is a teleport and is ignored. */
const MAX_SPRINT_STEP = 5;

function sprintGoal(spec: Extract<GoalSpec, { kind: 'sprint' }>): Impl {
  let segments = 0;
  let seg = 0;
  let counted = false;
  let prev: { x: number; z: number } | null = null;
  return {
    done: () => segments >= spec.count,
    progress: () => segments,
    tick(s) {
      if (s.sprinting) {
        if (prev && !counted) {
          const d = Math.hypot(s.feet.x - prev.x, s.feet.z - prev.z);
          if (d <= MAX_SPRINT_STEP) seg += d;
          if (seg >= spec.meters) {
            segments++;
            counted = true;
          }
        }
      } else {
        seg = 0;
        counted = false;
      }
      prev = { x: s.feet.x, z: s.feet.z };
    },
    restore(p) {
      segments = Math.max(0, Math.floor(p));
      seg = 0;
      counted = false;
      prev = null;
    },
  };
}

function attacksGoal(spec: Extract<GoalSpec, { kind: 'attacks' }>): Impl {
  let mask = 0;
  let chainDone = false;
  let chain = 0;
  let clock = 0;
  let last = 0;
  const allLanded = (): boolean => spec.slots.every((sl) => (mask & (1 << sl)) !== 0);
  return {
    done: () => chainDone,
    progress: () => mask + (chainDone ? 32 : 0),
    onEvent(e) {
      if (e.type !== 'hit' || e.slot < 1 || e.slot > 4) return;
      const before = allLanded();
      mask |= 1 << e.slot;
      if (!before) {
        if (allLanded() && spec.chain <= 0) chainDone = true;
        return;
      }
      if (chain > 0 && clock - last <= spec.window) chain++;
      else chain = 1;
      last = clock;
      if (chain >= spec.chain) chainDone = true;
    },
    tick(s) {
      clock += s.dt;
    },
    restore(p) {
      const v = Math.max(0, Math.floor(p));
      mask = v & 30;
      chainDone = v >= 32;
      chain = 0;
    },
  };
}

function lockSwapGoal(spec: Extract<GoalSpec, { kind: 'lockSwap' }>): Impl {
  let state = 0; // 0 nothing, 1 locked, 2 swapped
  let kills = 0;
  let lastNonNull: string | null = null;
  let current: string | null = null;
  return {
    done: () => state >= 2 && kills >= spec.kills,
    progress: () => (state < 2 ? state : 2 + kills),
    onEvent(e) {
      if (e.type === 'lockon') {
        current = e.targetId;
        if (e.targetId !== null) {
          if (state === 0) state = 1;
          else if (state === 1 && lastNonNull !== null && e.targetId !== lastNonNull) state = 2;
          lastNonNull = e.targetId;
        }
      } else if (e.type === 'hit') {
        if (state >= 2 && e.killed && current !== null && e.targetId === current) {
          kills = Math.min(spec.kills, kills + 1);
        }
      }
    },
    restore(p) {
      const v = Math.max(0, Math.floor(p));
      state = Math.min(2, v);
      kills = v >= 2 ? Math.min(spec.kills, v - 2) : 0;
      lastNonNull = null;
      current = null;
    },
  };
}

function equippedGoal(spec: Extract<GoalSpec, { kind: 'equipped' }>): Impl {
  const m = spec.items.map(() => false);
  return {
    done: () => m.every(Boolean),
    progress: () => m.filter(Boolean).length,
    onEvent(e) {
      if (e.type !== 'equipped') return;
      spec.items.forEach((it, i) => {
        if (it.slot === e.slot) m[i] = e.itemId === it.itemId;
      });
    },
    sync(q) {
      spec.items.forEach((it, i) => {
        m[i] = q.equipped(it.slot) === it.itemId;
      });
    },
    restore(p) {
      const k = Math.max(0, Math.floor(p));
      m.forEach((_, i) => {
        m[i] = i < k;
      });
    },
  };
}

/**
 * Skill progress encoding. With `all = [...actives, ...passives]` and `index` the position of the
 * learned skill in `all`: 0 = nothing learned, `1 + 2*index` = learned, `2 + 2*index` = done.
 */
function skillGoal(spec: Extract<GoalSpec, { kind: 'skill' }>): Impl {
  const all = [...spec.actives, ...spec.passives];
  const nActive = spec.actives.length;
  let idx = -1;
  let used = false;
  return {
    done: () => used,
    progress: () => (idx < 0 ? 0 : used ? 2 + 2 * idx : 1 + 2 * idx),
    onEvent(e) {
      if (e.type === 'learned') {
        if (idx < 0) idx = all.indexOf(e.skillId);
      } else if (idx >= 0) {
        if (e.type === 'abilityUsed' && idx < nActive && e.skillId === all[idx]) used = true;
        else if (e.type === 'skillTriggered' && idx >= nActive && e.skillId === all[idx]) used = true;
      }
    },
    sync(q) {
      if (idx >= 0) return;
      idx = all.findIndex((id) => q.learned(id));
    },
    restore(p) {
      const v = Math.max(0, Math.floor(p));
      if (v === 0) {
        idx = -1;
        used = false;
        return;
      }
      const i = Math.floor((v - 1) / 2);
      if (i >= all.length) {
        idx = -1;
        used = false;
        return;
      }
      idx = i;
      used = v % 2 === 0;
    },
    detail: () => (idx >= 0 ? all[idx] : null),
  };
}

function clearedGoal(spec: Extract<GoalSpec, { kind: 'cleared' }>): Impl {
  let mask = 0;
  const full = spec.spawnerIds.reduce((a, _, i) => a | (1 << i), 0);
  return {
    done: () => (mask & full) === full,
    progress: () => mask,
    onEvent(e) {
      if (e.type !== 'groupCleared') return;
      const i = spec.spawnerIds.indexOf(e.spawnerId);
      if (i >= 0) mask |= 1 << i;
    },
    restore(p) {
      mask = Math.max(0, Math.floor(p)) & full;
    },
  };
}

function build(spec: GoalSpec): Impl {
  switch (spec.kind) {
    case 'trigger':
      return simple((e) => e.type === 'trigger' && e.id === spec.id);
    case 'kill':
      return killGoal(spec);
    case 'flag':
      return simple(() => false, (q) => q.flag(spec.key), (q) => q.flag(spec.key));
    case 'gaze':
      return gazeGoal(spec);
    case 'count':
      return countGoal(spec);
    case 'sprint':
      return sprintGoal(spec);
    case 'attacks':
      return attacksGoal(spec);
    case 'lockSwap':
      return lockSwapGoal(spec);
    case 'equipped':
      return equippedGoal(spec);
    case 'consume':
      return simple((e) => e.type === 'itemUsed');
    case 'quest':
      return simple(
        (e) => e.type === 'questCompleted' && e.questId === spec.questId,
        (q) => q.questState(spec.questId) === 'completed',
      );
    case 'skill':
      return skillGoal(spec);
    case 'lit':
      return simple((e) => e.type === 'rekindled' && e.waystoneId === spec.waystoneId, (q) => q.isLit(spec.waystoneId));
    case 'travel':
      return simple((e) => e.type === 'fastTravel');
    case 'spell':
      return simple((e) => e.type === 'spellReleased' && e.spellId === spec.spellId);
    case 'rest':
      return simple((e) => e.type === 'rest');
    case 'interact':
      return simple((e) => e.type === 'interact' && e.id === spec.id);
    case 'vow':
      return simple(
        (e) => e.type === 'vowComplete' || (e.type === 'dialogueEnded' && e.dialogueId === spec.dialogueId),
      );
    case 'cleared':
      return clearedGoal(spec);
  }
}

export function createGoal(spec: GoalSpec): GoalTracker {
  const impl = build(spec);
  let finished = impl.done();
  const latch = (): void => {
    if (impl.done()) finished = true;
  };
  return {
    spec,
    get done() {
      return finished;
    },
    get progress() {
      return impl.progress();
    },
    onEvent(e) {
      if (finished) return;
      impl.onEvent?.(e);
      latch();
    },
    tick(s, q) {
      if (finished) return;
      impl.tick?.(s, q);
      latch();
    },
    sync(q) {
      if (finished) return;
      impl.sync?.(q);
      latch();
    },
    restore(p) {
      impl.restore(p);
      finished = impl.done();
    },
    detail: () => impl.detail?.() ?? null,
  };
}
