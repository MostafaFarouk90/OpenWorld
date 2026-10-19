import { beforeEach, describe, expect, it } from 'vitest';
import { BEATS, FULL_ORDER, KETTLEWICK_ORDER, LOCKABLE_VERBS, VETERAN_ORDER } from './beats';
import { createGoal } from './goals';
import { CRACK_SECONDS, DRILL_SECONDS, SPAWN_RETRY_SECONDS, TutorialDirector, VOW_RETRY_SECONDS, type DrillDef } from './TutorialDirector';
import type { BeatId, DirectorEvent, DirectorPorts, SpawnSpec, TickSample } from './types';

const DT = 1 / 60;

/** A recording fake of every port; world state is plain data the test mutates. */
class FakeWorld implements DirectorPorts {
  flags = new Map<string, boolean | string | number>();
  quests = new Map<string, 'inactive' | 'active' | 'completed' | 'failed'>();
  equippedSlots = new Map<string, string>();
  learnedSkills = new Set<string>();
  lit = new Set<string>(['kettlewick']);
  anchors = new Map<string, { x: number; y: number; z: number }>();
  calls: string[] = [];
  warnings: string[] = [];
  beats: string[] = [];
  spawned: SpawnSpec[] = [];
  aliveCount = new Map<string, number>();
  locks: readonly string[] = [];
  charges: number[] = [];
  xpHeld = false;
  xpReasons: string[] = [];
  /** Trigger volumes the player is inside, as the last fixedUpdate saw them. */
  inside = new Set<string>();
  lvl = 1;
  levelGrants = 0;
  grants: { sourceId: string; items: { itemId: string; count: number }[] }[] = [];
  consumables = 0;
  health = 1;
  smokeHits = 0;
  eatSmoke = false;
  cut: string | null = null;
  cutLog: (string | null)[] = [];
  vowOk = true;
  vowOpened = false;
  prompts: string[] = [];
  counts = new Map<string, number>();
  toasts: string[] = [];
  completions = 0;
  noSpawn = new Set<string>();
  teleports: string[] = [];
  fadePromise: { resolve: () => void } | null = null;
  autoFade = true;
  /**
   * Like the real quests and dialogue services outside a bus dispatch, completing a quest and
   * closing the vow emit straight back into the director (review B1, M1).
   */
  syncEmit = true;
  private emit(e: DirectorEvent) {
    if (this.syncEmit) d.onEvent(e);
  }

  readonly state = {
    equipped: (slot: string) => this.equippedSlots.get(slot) ?? null,
    learned: (id: string) => this.learnedSkills.has(id),
    isLit: (id: string) => this.lit.has(id),
    flag: (key: string) => !!this.flags.get(key),
    anchor: (id: string) => this.anchors.get(id) ?? null,
    questState: (id: string) => this.quests.get(id) ?? 'inactive',
  };
  warn(m: string) {
    this.warnings.push(m);
  }
  now() {
    return 0;
  }
  setFlag(key: string, value: boolean | string | number) {
    this.flags.set(key, value);
  }
  startQuest(id: string) {
    if ((this.quests.get(id) ?? 'inactive') === 'inactive') this.quests.set(id, 'active');
  }
  completeQuest(id: string) {
    this.calls.push(`complete:${id}`);
    const was = this.quests.get(id);
    this.quests.set(id, 'completed');
    if (was !== 'completed') this.emit({ type: 'questCompleted', questId: id });
  }
  completeObjective(q: string, o: string) {
    this.calls.push(`objective:${q}.${o}`);
  }
  startVow() {
    if (!this.vowOk) return false;
    this.vowOpened = true;
    return true;
  }
  closeVow() {
    const was = this.vowOpened;
    this.vowOpened = false;
    this.calls.push('closeVow');
    if (was) this.emit({ type: 'dialogueEnded', dialogueId: 't04-vow', reason: 'skip' });
  }
  vowOpen() {
    return this.vowOpened;
  }
  teleport(a: string) {
    this.teleports.push(a);
  }
  placeNpc(npc: string, a: string) {
    this.calls.push(`place:${npc}@${a}`);
  }
  spawn(spec: SpawnSpec) {
    this.spawned.push(spec);
    if (this.noSpawn.has(spec.spawnerId)) return [];
    this.aliveCount.set(spec.spawnerId, 3);
    return ['a', 'b'];
  }
  despawn(id: string) {
    this.calls.push(`despawn:${id}`);
    this.aliveCount.set(id, 0);
  }
  resetGroup(id: string) {
    this.calls.push(`reset:${id}`);
  }
  alive(id: string) {
    return this.aliveCount.get(id) ?? 0;
  }
  setLocks(a: readonly string[]) {
    this.locks = a;
  }
  reArm(n: number) {
    this.charges.push(n);
  }
  playerHealthFraction() {
    return this.health;
  }
  smokeHit(f: number) {
    this.smokeHits++;
    if (!this.eatSmoke) this.health = Math.max(0.01, this.health - f);
  }
  healFull() {
    this.health = 1;
  }
  fadeTeleport(a: string) {
    this.teleports.push(`fade:${a}`);
    if (this.autoFade) return Promise.resolve();
    return new Promise<void>((resolve) => (this.fadePromise = { resolve }));
  }
  holdKillXp(on: boolean, reason?: string) {
    this.xpHeld = on;
    if (on) this.xpReasons.push(reason ?? '');
  }
  playerInTrigger(id: string) {
    return this.inside.has(id);
  }
  level() {
    return this.lvl;
  }
  grantLevelTwo() {
    this.levelGrants++;
    this.lvl = Math.max(this.lvl, 2);
  }
  grantItems(sourceId: string, items: { itemId: string; count: number }[]) {
    this.grants.push({ sourceId, items });
    for (const i of items) if (i.itemId === 'healing-flask' || i.itemId === 'hearth-bread') this.consumables += i.count;
  }
  equip(id: string) {
    this.equippedSlots.set(id === 'gauts-spare-tabard' ? 'armour' : 'weapon', id);
  }
  resetToStarterKit() {
    this.calls.push('starterKit');
    this.consumables = 3;
  }
  hasConsumable() {
    return this.consumables > 0;
  }
  rekindle(id: string) {
    this.lit.add(id);
    this.calls.push(`rekindle:${id}`);
  }
  showPrompt(p: { mechanic: string }) {
    this.prompts.push(p.mechanic);
  }
  promptCount(m: string) {
    return this.counts.get(m) ?? 0;
  }
  hidePrompts() {
    this.prompts = [];
  }
  showLine(k: string) {
    this.calls.push(`line:${k}`);
  }
  toast(k: string) {
    this.toasts.push(k);
  }
  cutscene(kind: 'knighting' | 'crack' | null) {
    this.cut = kind;
    this.cutLog.push(kind);
  }
  crackEffects() {
    this.calls.push('crack');
  }
  emitBeat(id: BeatId, state: string) {
    this.beats.push(`${id}:${state}`);
  }
  recordCompletion() {
    this.completions++;
  }
  goals: string[] = [];
  /** What the fake quest tracker holds per `beat.step`; unset means the quest has no step objective. */
  tracked = new Map<string, number>();
  trackedUnits(beat: BeatId, step: number) {
    return this.tracked.get(`${beat}.${step}`) ?? null;
  }
  goalProgress(beat: BeatId, step: number, delta: number) {
    for (let i = 0; i < delta; i++) this.goals.push(`${beat}.${step}`);
  }
  stepTicks: string[] = [];
  stepDone(beat: BeatId, step: number) {
    this.stepTicks.push(`${beat}.${step}`);
  }
  beatsDone: string[] = [];
  beatDone(beat: BeatId) {
    this.beatsDone.push(beat);
  }
  successes: string[] = [];
  promptSuccess(m: string) {
    this.successes.push(m);
  }
}

const data = {
  beats: BEATS,
  orders: { full: FULL_ORDER, veteran: VETERAN_ORDER, kettlewick: KETTLEWICK_ORDER },
  lockable: LOCKABLE_VERBS,
  createGoal,
};

let w: FakeWorld;
let d: TutorialDirector;
let feet = { x: 0, y: 0, z: 0 };
const sample = (over: Partial<TickSample> = {}): TickSample => ({
  dt: DT,
  feet,
  sprinting: false,
  moving: false,
  camera: null,
  ...over,
});
const tick = (n = 1, over: Partial<TickSample> = {}) => {
  for (let i = 0; i < n; i++) d.tick(sample(over));
};
const ev = (e: DirectorEvent) => d.onEvent(e);
const seconds = (s: number) => tick(Math.ceil(s / DT) + 1);

/** Event scripts that pass each beat the normal way. */
const PASS: Record<BeatId, () => void> = {
  t01: () => {
    ev({ type: 'trigger', id: 'trg.t01.gate' });
    w.flags.set('place.scarecrow.toppled', true);
    tick();
  },
  t02: () => {
    // Look straight at each banner from the origin.
    for (const id of ['chapel.banner-1', 'chapel.banner-2', 'chapel.banner-3']) {
      const a = w.anchors.get(id)!;
      const len = Math.hypot(a.x, a.y, a.z);
      tick(20, { camera: { position: { x: 0, y: 0, z: 0 }, forward: { x: a.x / len, y: a.y / len, z: a.z / len } } });
    }
  },
  t03: () => ev({ type: 'questCompleted', questId: 't03' }),
  t04: () => {
    ev({ type: 'trigger', id: 'trg.t04.chapel' });
    ev({ type: 'interact', id: 'kneel:chapel' });
    tick();
    ev({ type: 'vowComplete' });
  },
  t05: () => {
    seconds(CRACK_SECONDS);
    for (const id of ['w1', 'w2', 'w3']) ev({ type: 'kill', actorId: id, kind: 'ash-wraith', spawnTag: 't05.churchyard', byPlayer: true });
    ev({ type: 'groupCleared', spawnerId: 't05.churchyard' });
  },
  t06: () => {
    for (let seg = 0; seg < 2; seg++) {
      for (let i = 0; i < 90; i++) {
        feet = { x: feet.x + 0.5, y: 0, z: 0 };
        tick(1, { sprinting: true, moving: true });
      }
      tick(1, { sprinting: false });
    }
    ev({ type: 'trigger', id: 'trg.t06.end' });
  },
  t07: () => {
    ev({ type: 'trigger', id: 'trg.t07.cart' });
    ev({ type: 'trigger', id: 'trg.t07.fence' });
  },
  t08: () => {
    for (const slot of [2, 3, 4, 1, 2, 3, 4] as const) {
      ev({ type: 'hit', slot, targetId: 'w', killed: false });
      tick(10);
    }
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
  },
  t09: () => {
    for (let i = 0; i < 3; i++) ev({ type: 'blocked' });
    ev({ type: 'groupCleared', spawnerId: 't09.soldier' });
  },
  t10: () => {
    for (let i = 0; i < 3; i++) ev({ type: 'dodged' });
    ev({ type: 'groupCleared', spawnerId: 't10.sweeper' });
  },
  t11: () => {
    ev({ type: 'lockon', targetId: 'a' });
    ev({ type: 'lockon', targetId: 'b' });
    ev({ type: 'hit', slot: 1, targetId: 'b', killed: true });
    ev({ type: 'lockon', targetId: 'c' });
    ev({ type: 'hit', slot: 1, targetId: 'c', killed: true });
    ev({ type: 'groupCleared', spawnerId: 't11.square' });
  },
  t12: () => {
    ev({ type: 'equipped', slot: 'weapon', itemId: 'squires-arming-sword' });
    ev({ type: 'equipped', slot: 'armour', itemId: 'gauts-spare-tabard' });
    ev({ type: 'itemUsed', itemId: 'healing-flask' });
    ev({ type: 'questCompleted', questId: 't12' });
  },
  t13: () => {
    ev({ type: 'learned', skillId: 'knight.rallyCry' });
    ev({ type: 'abilityUsed', skillId: 'knight.rallyCry' });
  },
  t14: () => {
    ev({ type: 'trigger', id: 'trg.t14.chapel' });
    ev({ type: 'rekindled', waystoneId: 'chapel' });
    ev({ type: 'fastTravel', fromId: 'chapel', toId: 'kettlewick' });
  },
  t15: () => {
    ev({ type: 'trigger', id: 'trg.t15.gate' });
    ev({ type: 'spellReleased', spellId: 'heartshard-surge' });
    ev({ type: 'groupCleared', spawnerId: 't15.gate' });
    ev({ type: 'rest', waystoneId: 'kettlewick' });
  },
  skirmish: () => {
    ev({ type: 'dodged' });
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
    ev({ type: 'groupCleared', spawnerId: 't10.sweeper' });
    ev({ type: 'groupCleared', spawnerId: 't09.soldier' });
    ev({ type: 'groupCleared', spawnerId: 't11.square' });
  },
};

function passUntil(stop: BeatId | null): void {
  let guard = 0;
  while (d.beat && d.beat !== stop && guard++ < 40) {
    PASS[d.beat]();
    tick();
  }
}

beforeEach(() => {
  w = new FakeWorld();
  w.anchors.set('chapel.banner-1', { x: 45.6, y: 5, z: 54 });
  w.anchors.set('chapel.banner-2', { x: 45.6, y: 5, z: 57 });
  w.anchors.set('chapel.banner-3', { x: 45.6, y: 5, z: 63 });
  d = new TutorialDirector(w, data);
  feet = { x: 0, y: 0, z: 0 };
});

describe('TutorialDirector happy path', () => {
  it('runs T01 to T15 in order and ends with Brightwater open', () => {
    d.begin('full');
    expect(d.beat).toBe('t01');
    expect(w.teleports).toEqual(['beat.t01.start']);
    passUntil(null);
    expect(d.complete).toBe(true);
    expect(w.beats).toEqual(FULL_ORDER.flatMap((b) => [`${b}:started`, `${b}:completed`]));
    expect(w.flags.get('tutorial.complete')).toBe(true);
    expect(w.flags.get('tutorial.heartshard-awakened')).toBe(true);
    expect(w.flags.get('tutorial.t04.begin')).toBe(true);
    expect(w.flags.get('tutorial.t12.kit')).toBe(true);
    expect(w.locks).toEqual([]);
    expect(w.xpHeld).toBe(false);
    expect(w.charges.at(-1)).toBe(0);
    expect(w.toasts).toContain('tutorial.toast.open');
    expect(w.completions).toBe(1);
    expect(w.flags.has('tutorial.skipped')).toBe(false);
    for (const b of FULL_ORDER) expect(w.quests.get(BEATS[b].questId)).toBe('completed');
  });

  it('teaches one verb per beat: attack 2 locked in T05, free from T08', () => {
    d.begin('full');
    passUntil('t05');
    expect(w.locks).toContain('attack2');
    expect(w.locks).toContain('surge');
    passUntil('t08');
    expect(w.locks).not.toContain('attack2');
    expect(w.locks).toContain('block');
    passUntil('t15');
    expect(w.locks).not.toContain('surge');
  });

  it('Second Wind: none before the shard, one charge from T05 and per crisis beat, cleared at the end', () => {
    d.begin('full');
    expect(w.charges).toEqual([0]);
    passUntil('t05');
    expect(w.charges.at(-1)).toBe(1);
    expect(w.flags.get('tutorial.heartshard-awakened')).toBe(true);
    passUntil('t09');
    const before = w.charges.length;
    PASS.t09();
    tick();
    expect(w.charges.length).toBe(before + 1);
  });

  it('holds kill XP until T13 and grants the level-2 point once there', () => {
    d.begin('full');
    expect(w.xpHeld).toBe(true);
    passUntil('t13');
    expect(w.xpHeld).toBe(false);
    expect(w.levelGrants).toBe(1);
    expect(w.lvl).toBe(2);
  });

  it('T05 plays the crack, then spawns the wraiths only after the cutscene ends', () => {
    d.begin('full');
    passUntil('t05');
    expect(w.cut).toBe('crack');
    expect(w.spawned.filter((s) => s.spawnerId === 't05.churchyard')).toHaveLength(0);
    seconds(CRACK_SECONDS);
    expect(w.cut).toBeNull();
    expect(w.spawned.filter((s) => s.spawnerId === 't05.churchyard')).toHaveLength(1);
  });

  it('T04 kneel opens the vow inside the knighting cutscene', () => {
    d.begin('full');
    passUntil('t04');
    ev({ type: 'trigger', id: 'trg.t04.chapel' });
    ev({ type: 'interact', id: 'kneel:chapel' });
    expect(w.cut).toBe('knighting');
    expect(w.vowOpened).toBe(true);
    ev({ type: 'dialogueEnded', dialogueId: 't04-vow', reason: 'skip' });
    tick();
    expect(d.beat).toBe('t05');
  });
});

describe('T04 vow retry', () => {
  it('retries dialogue.start, then recovers and lets the player kneel again', () => {
    d.begin('full');
    passUntil('t04');
    w.vowOk = false;
    ev({ type: 'trigger', id: 'trg.t04.chapel' });
    ev({ type: 'interact', id: 'kneel:chapel' });
    tick(10);
    w.vowOk = true;
    tick();
    expect(w.vowOpened).toBe(true);
    expect(w.cut).toBe('knighting');
  });

  it('gives up after a second, ends the cutscene and re-enables the kneel', () => {
    d.begin('full');
    passUntil('t04');
    w.vowOk = false;
    ev({ type: 'trigger', id: 'trg.t04.chapel' });
    ev({ type: 'interact', id: 'kneel:chapel' });
    seconds(VOW_RETRY_SECONDS);
    expect(w.cut).toBeNull();
    expect(w.warnings.some((m) => m.includes('vow'))).toBe(true);
    expect(d.beat).toBe('t04');
    w.vowOk = true;
    ev({ type: 'interact', id: 'kneel:chapel' });
    expect(w.vowOpened).toBe(true);
  });
});

describe('out of order and wrong credit', () => {
  it('ignores triggers and verbs that belong to a later beat', () => {
    d.begin('full');
    ev({ type: 'trigger', id: 'trg.t07.fence' });
    ev({ type: 'blocked' });
    expect(d.beat).toBe('t01');
    PASS.t01();
    expect(d.beat).toBe('t02');
  });

  it('T01 passes when the scarecrow falls before the gate is reached', () => {
    d.begin('full');
    w.flags.set('place.scarecrow.toppled', true);
    tick();
    expect(d.beat).toBe('t01');
    ev({ type: 'trigger', id: 'trg.t01.gate' });
    tick();
    expect(d.beat).toBe('t02');
  });

  it('T01 with the scarecrow already toppled (a load) needs only the gate', () => {
    w.flags.set('place.scarecrow.toppled', true);
    d.begin('full');
    ev({ type: 'trigger', id: 'trg.t01.gate' });
    expect(d.beat).toBe('t02');
  });

  it('T05 counts only player kills of its own wraiths', () => {
    d.begin('full');
    passUntil('t05');
    seconds(CRACK_SECONDS);
    ev({ type: 'kill', actorId: 'm1', kind: 'ash-wraith', spawnTag: 'm01', byPlayer: true });
    ev({ type: 'kill', actorId: 'x1', kind: 'ash-wraith', spawnTag: 't08.lane', byPlayer: true });
    ev({ type: 'kill', actorId: 'w1', kind: 'ash-wraith', spawnTag: 't05.churchyard', byPlayer: false });
    ev({ type: 'kill', actorId: 'w2', kind: 'ash-wraith', spawnTag: 't05.churchyard', byPlayer: true });
    ev({ type: 'kill', actorId: 'w2', kind: 'ash-wraith', spawnTag: 't05.churchyard', byPlayer: true });
    expect(d.currentStep).toBe(0);
    ev({ type: 'mercy', actorId: 'w3', creature: 'ash-wraith', spawnTag: 't05.churchyard' });
    ev({ type: 'kill', actorId: 'w4', kind: 'ash-wraith', spawnTag: 't05.churchyard', byPlayer: true });
    expect(d.currentStep).toBe(1);
  });

  it('refills a combat group cleared before the verb goal, and waits for the clear after it', () => {
    d.begin('full');
    passUntil('t09');
    ev({ type: 'blocked' });
    ev({ type: 'groupCleared', spawnerId: 't09.soldier' });
    expect(w.calls).toContain('reset:t09.soldier');
    expect(w.spawned.filter((s) => s.spawnerId === 't09.soldier')).toHaveLength(2);
    ev({ type: 'blocked' });
    ev({ type: 'blocked' });
    expect(d.beat).toBe('t09');
    ev({ type: 'groupCleared', spawnerId: 't09.soldier' });
    expect(d.beat).toBe('t10');
  });

  it('T08: hits before every slot landed do not count toward the chain', () => {
    d.begin('full');
    passUntil('t08');
    for (let i = 0; i < 4; i++) ev({ type: 'hit', slot: 2, targetId: 'w', killed: false });
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
    expect(d.beat).toBe('t08');
  });

  it('T11: kills while unlocked do not count', () => {
    d.begin('full');
    passUntil('t11');
    ev({ type: 'hit', slot: 1, targetId: 'a', killed: true });
    ev({ type: 'lockon', targetId: 'a' });
    ev({ type: 'hit', slot: 1, targetId: 'a', killed: true });
    expect(d.currentStep).toBe(0);
  });
});

describe('T12 kit and flask', () => {
  beforeEach(() => {
    d.begin('full');
    passUntil('t12');
  });

  it('grants the kit with two flasks once, so the end state matches the starter kit', () => {
    const kit = w.grants.filter((g) => g.sourceId === 'tutorial:t12');
    expect(kit).toHaveLength(1);
    expect(kit[0].items).toEqual([
      { itemId: 'squires-arming-sword', count: 1 },
      { itemId: 'gauts-spare-tabard', count: 1 },
      { itemId: 'healing-flask', count: 2 },
    ]);
  });

  it('hits the player with smoke only at full health, never lethally', () => {
    tick();
    expect(w.smokeHits).toBe(1);
    expect(w.health).toBeCloseTo(0.75);
    tick(5);
    expect(w.smokeHits).toBe(1);
  });

  it('retries the smoke when i-frames eat it, up to the limit', () => {
    w.health = 1;
    w.eatSmoke = true;
    ev({ type: 'modal', id: 'inventory', open: true });
    tick(100);
    expect(w.smokeHits).toBeGreaterThan(1);
    expect(w.smokeHits).toBeLessThanOrEqual(31);
  });

  it('smokes again when the inventory opens at full health, not after drinking', () => {
    tick();
    w.health = 1;
    ev({ type: 'modal', id: 'inventory', open: true });
    tick();
    expect(w.smokeHits).toBe(2);
    ev({ type: 'itemUsed', itemId: 'hearth-bread' });
    w.health = 1;
    ev({ type: 'modal', id: 'inventory', open: true });
    tick();
    expect(w.smokeHits).toBe(2);
  });

  it('opening the journal first does not finish the beat; one item is not enough', () => {
    ev({ type: 'questCompleted', questId: 't12' });
    ev({ type: 'equipped', slot: 'weapon', itemId: 'squires-arming-sword' });
    ev({ type: 'itemUsed', itemId: 'healing-flask' });
    expect(d.beat).toBe('t12');
    expect(w.flags.get('tutorial.t12.kit')).toBeUndefined();
    expect(w.prompts).not.toContain('journal');
    ev({ type: 'equipped', slot: 'armour', itemId: 'gauts-spare-tabard' });
    expect(w.flags.get('tutorial.t12.kit')).toBe(true);
    expect(w.prompts).toContain('journal');
  });
});

describe('T13 passives', () => {
  it('a passive finishes T13 pending and passes on its first trigger later', () => {
    d.begin('full');
    passUntil('t13');
    ev({ type: 'learned', skillId: 'knight.rimBash' });
    tick();
    expect(d.beat).toBe('t14');
    expect(w.quests.get('t13')).toBe('active');
    expect(d.snapshot().t13PendingPassive).toBe('knight.rimBash');
    ev({ type: 'skillTriggered', skillId: 'knight.rimBash' });
    expect(w.quests.get('t13')).toBe('completed');
  });

  it('an untriggered passive is passed when the tutorial ends', () => {
    d.begin('full');
    passUntil('t13');
    ev({ type: 'learned', skillId: 'knight.riposteEdge' });
    tick();
    passUntil(null);
    expect(w.quests.get('t13')).toBe('completed');
  });

  it('a skill learned before T13 is read from state', () => {
    d.begin('full');
    passUntil('t12');
    w.learnedSkills.add('knight.rallyCry');
    PASS.t12();
    tick();
    expect(d.beat).toBe('t13');
    ev({ type: 'abilityUsed', skillId: 'knight.rallyCry' });
    expect(d.beat).toBe('t14');
  });
});

describe('hold-Esc skip', () => {
  it('skips every beat with its rewards, once each', () => {
    d.begin('full');
    let guard = 0;
    while (d.beat && guard++ < 30) {
      d.skipCurrent();
      tick();
    }
    expect(d.complete).toBe(true);
    expect(w.beats.filter((b) => b.endsWith(':skipped'))).toHaveLength(15);
    expect(w.flags.get('tutorial.skipped')).toBe(true);
    expect(w.flags.get('tutorial.heartshard-awakened')).toBe(true);
    expect(w.flags.get('tutorial.t04.tone')).toBe('earnest');
    expect(w.flags.get('quest.t03.eddaGift')).toBe(true);
    expect(w.grants.filter((g) => g.sourceId === 'tutorial:t12')).toHaveLength(1);
    expect(w.equippedSlots.get('weapon')).toBe('squires-arming-sword');
    expect(w.equippedSlots.get('armour')).toBe('gauts-spare-tabard');
    expect(w.levelGrants).toBe(1);
    expect(w.lit.has('chapel')).toBe(true);
    for (const b of FULL_ORDER) expect(w.quests.get(BEATS[b].questId)).toBe('completed');
  });

  it('skipping T04 mid-vow closes the dialogue and ends the cutscene', () => {
    d.begin('full');
    passUntil('t04');
    ev({ type: 'trigger', id: 'trg.t04.chapel' });
    ev({ type: 'interact', id: 'kneel:chapel' });
    d.skipCurrent();
    expect(w.calls).toContain('closeVow');
    expect(d.beat).toBe('t05');
    expect(w.beats.slice(-2)).toEqual(['t04:skipped', 't05:started']);
    expect(w.beats).not.toContain('t04:completed');
    expect(w.cut).toBe('crack');
  });

  it('skipping T03 enters T04 exactly once', () => {
    d.begin('full');
    passUntil('t03');
    d.skipCurrent();
    tick();
    expect(w.beats.filter((b) => b === 't04:started')).toHaveLength(1);
    expect(w.beats).not.toContain('t03:completed');
  });

  it('skip after partial progress grants nothing twice', () => {
    d.begin('full');
    passUntil('t03');
    w.flags.set('quest.t03.eddaGift', true);
    d.skipCurrent();
    expect(w.grants.filter((g) => g.sourceId === 'tutorial:t03')).toHaveLength(0);
    passUntil('t12');
    d.skipCurrent();
    expect(w.grants.filter((g) => g.sourceId === 'tutorial:t12')).toHaveLength(1);
    w.lvl = 2;
    d.skipCurrent();
    expect(w.levelGrants).toBe(1);
    w.lit.add('chapel');
    d.skipCurrent();
    expect(w.calls).not.toContain('rekindle:chapel');
  });

  it('skip despawns the beat group and does nothing while a restart is pending', () => {
    d.begin('full');
    passUntil('t09');
    expect(d.onLethal()).toBe(true);
    d.skipCurrent();
    expect(d.beat).toBe('t09');
  });
});

describe('failure: Second Wind then beat restart', () => {
  it('restarts the beat with enemies at half health and Second Wind re-armed', async () => {
    d.begin('full');
    passUntil('t09');
    ev({ type: 'blocked' });
    expect(d.onLethal()).toBe(true);
    expect(w.calls).toContain('despawn:t09.soldier');
    tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(d.beat).toBe('t09');
    expect(w.teleports.at(-1)).toBe('fade:beat.t09.start');
    const last = w.spawned.at(-1)!;
    expect(last.spawnerId).toBe('t09.soldier');
    expect(last.healthScale).toBe(0.5);
    expect(w.health).toBe(1);
    expect(w.charges.at(-1)).toBe(1);
    // The block earned before the failure is kept (review 21), so two more pass the step, and the
    // tracker counted exactly three: it never goes backwards or double counts.
    ev({ type: 'blocked' });
    expect(d.currentStep).toBe(0);
    ev({ type: 'blocked' });
    expect(d.currentStep).toBe(1);
    expect(w.goals.filter((g) => g === 't09.0')).toHaveLength(3);
  });

  it('three lethal hits during the fade cause one restart', async () => {
    d.begin('full');
    passUntil('t09');
    w.autoFade = false;
    expect(d.onLethal()).toBe(true);
    tick();
    expect(d.onLethal()).toBe(true);
    expect(d.onLethal()).toBe(true);
    tick(5);
    expect(w.teleports.filter((t) => t.startsWith('fade:'))).toHaveLength(1);
    w.fadePromise!.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(d.restartInFlight).toBe(false);
  });

  it('is inactive once the tutorial is complete, and outside a run', () => {
    expect(d.onLethal()).toBe(false);
    d.begin('full');
    passUntil(null);
    expect(d.onLethal()).toBe(false);
  });

  it('a restart outside a combat beat only teleports', async () => {
    d.begin('full');
    passUntil('t07');
    const before = w.spawned.length;
    d.onLethal();
    tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(w.spawned.length).toBe(before);
    expect(w.teleports.at(-1)).toBe('fade:beat.t07.start');
  });
});

describe('reload', () => {
  function saveAt(beat: BeatId): unknown {
    d.begin('full');
    passUntil(beat);
    return d.serialize();
  }

  it('reload mid-T09 restarts T09 on the next tick with its progress and group reset', () => {
    d.begin('full');
    passUntil('t09');
    ev({ type: 'blocked' });
    const save = d.serialize();
    const w2 = new FakeWorld();
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    expect(w2.spawned).toHaveLength(0);
    tick();
    expect(d.beat).toBe('t09');
    expect(w2.calls).toContain('reset:t09.soldier');
    expect(w2.spawned.map((s) => s.spawnerId)).toEqual(['t09.soldier']);
    // One block was saved, two more pass the verb step.
    ev({ type: 'blocked' });
    ev({ type: 'blocked' });
    expect(d.currentStep).toBe(1);
  });

  it('a beat whose quest completed before the save does not advance by itself', () => {
    const save = saveAt('t12');
    const w2 = new FakeWorld();
    w2.quests.set('t12', 'completed');
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(d.beat).toBe('t12');
  });

  it('T12 reload after equip and drink with nothing left refills one flask and never re-grants the kit', () => {
    d.begin('full');
    passUntil('t12');
    ev({ type: 'equipped', slot: 'weapon', itemId: 'squires-arming-sword' });
    const save = d.serialize();
    const w2 = new FakeWorld();
    w2.equippedSlots.set('weapon', 'squires-arming-sword');
    w2.equippedSlots.set('armour', 'gauts-spare-tabard');
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(w2.grants.map((g) => g.sourceId)).toEqual(['tutorial:t12.refill']);
    ev({ type: 'itemUsed', itemId: 'healing-flask' });
    expect(w2.flags.get('tutorial.t12.kit')).toBe(true);
    ev({ type: 'questCompleted', questId: 't12' });
    expect(d.beat).toBe('t13');
  });

  it('reload after the T13 grant stays at level 2', () => {
    const save = saveAt('t13');
    const w2 = new FakeWorld();
    w2.lvl = 2;
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(w2.levelGrants).toBe(0);
  });

  it('reload in T05 replays the crack at the beat start, never the vow', () => {
    const save = saveAt('t05');
    const w2 = new FakeWorld();
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(w2.teleports).toEqual(['beat.t05.start']);
    expect(w2.cut).toBe('crack');
    expect(w2.vowOpened).toBe(false);
  });

  it('reload in T14 with the chapel already lit counts the rekindle from state', () => {
    const save = saveAt('t14');
    const w2 = new FakeWorld();
    w2.lit.add('chapel');
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    ev({ type: 'trigger', id: 'trg.t14.chapel' });
    ev({ type: 'fastTravel', fromId: 'chapel', toId: 'kettlewick' });
    expect(d.beat).toBe('t15');
  });

  it('a load before T13 holds kill XP again', () => {
    const save = saveAt('t09');
    const w2 = new FakeWorld();
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(w2.xpHeld).toBe(true);
  });

  it('events between the load and the next tick are ignored (dialogue closing on load)', () => {
    const save = saveAt('t04');
    d.load(save);
    d.onSaveLoaded();
    ev({ type: 'dialogueEnded', dialogueId: 't04-vow', reason: 'load' });
    tick();
    expect(d.beat).toBe('t04');
  });

  it('a save without a tutorial entry is migrated from quest states', () => {
    for (const b of ['t01', 't02', 't03']) w.quests.set(b, 'completed');
    d.onSaveLoaded();
    tick();
    expect(d.beat).toBe('t04');
    expect(d.begun).toBe(true);
  });

  it('a save with tutorial.complete does nothing and unlocks everything', () => {
    w.flags.set('tutorial.complete', true);
    d.onSaveLoaded();
    tick();
    expect(d.complete).toBe(true);
    expect(d.beat).toBeNull();
    expect(w.locks).toEqual([]);
  });

  it('a malformed save loads as an empty state without throwing', () => {
    d.load({ mode: 'nope', beat: 't99', finished: ['t01', 5], progress: { a: 'x', b: 2 } });
    expect(d.snapshot().mode).toBe('full');
    expect(d.snapshot().beat).toBeNull();
    expect(d.snapshot().finished).toEqual(['t01']);
  });
});

describe('missing anchors and services', () => {
  it('a spawner that spawns nothing never soft-locks its beat', () => {
    w.noSpawn.add('t09.soldier');
    d.begin('full');
    passUntil('t08');
    PASS.t08();
    tick();
    expect(d.beat).toBe('t09');
    seconds(5);
    expect(d.beat).toBe('t09');
    w.noSpawn.delete('t09.soldier');
    seconds(1);
    expect(w.spawned.filter((s) => s.spawnerId === 't09.soldier').length).toBeGreaterThan(1);
    expect(d.beat).toBe('t09');
  });

  it('a spawner still empty after the retry window counts as done', () => {
    w.noSpawn.add('t09.soldier');
    d.begin('full');
    passUntil('t08');
    PASS.t08();
    tick();
    seconds(SPAWN_RETRY_SECONDS);
    expect(d.beat).toBe('t10');
    expect(w.warnings.some((m) => m.includes('t09.soldier'))).toBe(true);
  });
});

describe('veteran and Skip to Kettlewick', () => {
  it('veteran collapses T06 to T11 into a two-wave skirmish that needs a dodge', () => {
    d.begin('veteran');
    passUntil('skirmish');
    expect(w.spawned.map((s) => s.spawnerId).filter((s) => s !== 't05.churchyard')).toEqual(['t08.lane', 't10.sweeper']);
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
    ev({ type: 'groupCleared', spawnerId: 't10.sweeper' });
    expect(w.calls).toContain('reset:t10.sweeper');
    ev({ type: 'dodged' });
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
    ev({ type: 'groupCleared', spawnerId: 't10.sweeper' });
    expect(w.spawned.map((s) => s.spawnerId)).toContain('t11.square');
    ev({ type: 'groupCleared', spawnerId: 't09.soldier' });
    ev({ type: 'groupCleared', spawnerId: 't11.square' });
    expect(d.beat).toBe('t12');
    expect(w.locks).not.toContain('dodge');
  });

  it('skirmish prompts only for verbs never used', () => {
    w.counts.set('block', 2);
    d.begin('veteran');
    passUntil('skirmish');
    expect(w.prompts).not.toContain('block');
    expect(w.prompts).toContain('dodge');
  });

  it('Skip to Kettlewick starts at T15 with the starter kit, level 2 and the chapel lit', () => {
    d.begin('kettlewick');
    expect(d.beat).toBe('t15');
    expect(w.calls[0]).toBe('starterKit');
    expect(w.grants.filter((g) => g.sourceId === 'tutorial:t12')).toHaveLength(0);
    expect(w.lvl).toBe(2);
    expect(w.lit.has('chapel')).toBe(true);
    expect(w.teleports).toEqual(['beat.t15.start']);
    expect(w.quests.get('t12')).toBe('completed');
    expect(w.locks).toEqual([]);
    PASS.t15();
    expect(d.complete).toBe(true);
  });

  it('begin with a beat applies every earlier reward and starts there', () => {
    d.begin('full', 't12');
    expect(d.beat).toBe('t12');
    expect(w.flags.get('tutorial.heartshard-awakened')).toBe(true);
    expect(w.teleports).toEqual(['beat.t12.start']);
  });

  it('begin is a no-op once begun', () => {
    d.begin('full');
    d.begin('kettlewick');
    expect(d.mode).toBe('full');
  });
});

describe('Replay board drills', () => {
  const block: DrillDef = {
    id: 'block',
    waves: [{ spawnerId: 'replay.blocker', moves: ['soldier.chop'], aggro: true }],
    steps: [[{ kind: 'count', event: 'blocked', count: 3 }], [{ kind: 'cleared', spawnerIds: ['replay.blocker'] }]],
  };

  it('is refused before the tutorial ends', () => {
    d.begin('full');
    expect(d.startDrill(block)).toBe(false);
  });

  it('holds kill XP, completes, and a drill death is saved without a restart', () => {
    d.begin('full');
    passUntil(null);
    expect(d.startDrill(block)).toBe(true);
    expect(w.xpHeld).toBe(true);
    expect(w.xpReasons.at(-1)).toBe('tutorial.replay');
    w.health = 0.01;
    expect(d.onLethal()).toBe(true);
    expect(d.drillActive).toBeNull();
    expect(w.health).toBe(1);
    expect(w.xpHeld).toBe(false);
    expect(d.startDrill(block)).toBe(true);
    for (let i = 0; i < 3; i++) ev({ type: 'blocked' });
    ev({ type: 'groupCleared', spawnerId: 'replay.blocker' });
    expect(d.drillActive).toBeNull();
    expect(w.toasts).toContain('tutorial.replay.done');
  });
});

describe('trigger goals with the player already inside', () => {
  const sprintT06 = (): void => {
    for (let seg = 0; seg < 2; seg++) {
      for (let i = 0; i < 90; i++) {
        feet = { x: feet.x + 0.5, y: 0, z: 0 };
        tick(1, { sprinting: true, moving: true });
      }
      tick(1, { sprinting: false });
    }
  };

  it('T06 end completes when the sprint steps finish with the player inside the trigger', () => {
    d.begin('full', 't06');
    w.inside.add('trg.t06.end');
    sprintT06();
    expect(w.beats).toContain('t06:completed');
    expect(d.beat).toBe('t07');
  });

  it('T15 gate completes after fast travel lands the player in the gate trigger', () => {
    d.begin('full', 't14');
    PASS.t14();
    w.inside.add('trg.t15.gate'); // stale this tick, current on the next
    tick();
    expect(d.beat).toBe('t15');
    expect(d.currentStep).toBe(1);
    expect(w.spawned.map((s) => s.spawnerId)).toContain('t15.gate');
  });

  it('a kettlewick start inside the gate trigger moves on at once', () => {
    w.inside.add('trg.t15.gate');
    d.begin('kettlewick');
    expect(d.currentStep).toBe(1);
  });

  it('teleport then step current: the stale first check misses, the next tick completes once', () => {
    d.begin('full', 't15');
    expect(d.currentStep).toBe(0);
    w.inside.add('trg.t15.gate'); // volumes catch up on the next fixedUpdate
    tick();
    expect(d.currentStep).toBe(1);
    tick(3);
    expect(w.spawned.filter((s) => s.spawnerId === 't15.gate')).toHaveLength(1);
  });

  it('step current then teleport into the trigger completes once', () => {
    d.begin('full', 't06');
    sprintT06();
    expect(d.currentStep).toBe(1);
    tick(2);
    expect(d.currentStep).toBe(1);
    w.inside.add('trg.t06.end');
    tick();
    expect(w.beats.filter((b) => b === 't06:completed')).toHaveLength(1);
    expect(d.beat).toBe('t07');
  });

  it('a real trigger.enter in the same tick as the check does not double-complete', () => {
    d.begin('full', 't06');
    w.inside.add('trg.t06.end');
    sprintT06();
    ev({ type: 'trigger', id: 'trg.t06.end' });
    tick(3);
    expect(w.beats.filter((b) => b === 't06:completed')).toHaveLength(1);
    expect(w.beats.filter((b) => b === 't07:started')).toHaveLength(1);
  });

  it('only the step own trigger goals are fed: a second trigger goal of the step is not consumed', () => {
    d.begin('full', 't07');
    w.inside.add('trg.t07.cart');
    tick();
    expect(d.beat).toBe('t07');
    w.inside.add('trg.t07.fence');
    tick();
    expect(d.beat).not.toBe('t07');
  });

  it('a reload resumes a trigger step with the player inside', () => {
    d.begin('full', 't06');
    sprintT06();
    const save = d.serialize();
    w.inside.add('trg.t06.end');
    d.load(save);
    d.onSaveLoaded();
    tick(2);
    expect(d.beat).toBe('t07');
  });

  it('a Replay drill trigger step completes when the player is inside', () => {
    const drill: DrillDef = { id: 'gate', steps: [[{ kind: 'count', event: 'blocked', count: 1 }], [{ kind: 'trigger', id: 'trg.drill' }]] };
    d.begin('full');
    passUntil(null);
    expect(d.startDrill(drill)).toBe(true);
    ev({ type: 'blocked' });
    expect(d.drillActive).toBe('gate');
    w.inside.add('trg.drill');
    tick();
    expect(d.drillActive).toBeNull();
    expect(w.toasts.filter((t) => t === 'tutorial.replay.done')).toHaveLength(1);
  });
});

describe('kill XP pause reasons', () => {
  it('the run pauses as tutorial, a drill as tutorial.replay, and both release on end', () => {
    d.begin('full');
    expect(w.xpHeld).toBe(true);
    expect(w.xpReasons).toEqual(['tutorial']);
    passUntil(null);
    expect(w.xpHeld).toBe(false);
    const drill: DrillDef = { id: 'block', steps: [[{ kind: 'count', event: 'blocked', count: 1 }]] };
    expect(d.startDrill(drill)).toBe(true);
    expect(w.xpHeld).toBe(true);
    expect(w.xpReasons.at(-1)).toBe('tutorial.replay');
    ev({ type: 'blocked' });
    expect(d.drillActive).toBeNull();
    expect(w.xpHeld).toBe(false);
  });
});

describe('review fixes', () => {
  it('each beat starts and finishes exactly once with synchronous quest events', () => {
    d.begin('full');
    // T01 the natural way: gate first, then the scarecrow finishes it on the tick's flag check.
    ev({ type: 'trigger', id: 'trg.t01.gate' });
    w.flags.set('place.scarecrow.toppled', true);
    tick(3);
    expect(w.beats).toEqual(['t01:started', 't01:completed', 't02:started']);
    passUntil(null);
    for (const b of FULL_ORDER) {
      expect(w.beats.filter((x) => x === `${b}:started`)).toHaveLength(1);
      expect(w.beats.filter((x) => x === `${b}:completed`)).toHaveLength(1);
    }
  });

  it('an event raised mid-transition for the old beat gives the new beat no credit', () => {
    d.begin('full');
    passUntil('t08');
    // A stale "cleared" from finishing T08 must not reach T09.
    w.syncEmit = false;
    PASS.t08();
    expect(d.beat).toBe('t09');
    expect(d.currentStep).toBe(0);
  });

  it('a T05 reload after the last kill respawns the wave so the clear step can end', () => {
    d.begin('full');
    passUntil('t05');
    seconds(CRACK_SECONDS);
    for (const id of ['w1', 'w2', 'w3']) ev({ type: 'kill', actorId: id, kind: 'ash-wraith', spawnTag: 't05.churchyard', byPlayer: true });
    expect(d.currentStep).toBe(1);
    const save = d.serialize();
    const w2 = new FakeWorld();
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    seconds(CRACK_SECONDS);
    expect(w2.spawned.map((s) => s.spawnerId)).toEqual(['t05.churchyard']);
    ev({ type: 'groupCleared', spawnerId: 't05.churchyard' });
    expect(d.beat).toBe('t06');
  });

  it('a later-step goal met while an earlier step was current is read when its step begins (T14)', () => {
    d.begin('full');
    passUntil('t14');
    ev({ type: 'rekindled', waystoneId: 'chapel' });
    w.lit.add('chapel');
    ev({ type: 'trigger', id: 'trg.t14.chapel' });
    expect(d.currentStep).toBe(2);
  });

  it('an abandoned drill ends by itself and releases the XP pause; the board cancels a running drill', () => {
    const drill: DrillDef = {
      id: 'block',
      waves: [{ spawnerId: 'replay.blocker', aggro: true }],
      steps: [[{ kind: 'count', event: 'blocked', count: 3 }]],
    };
    d.begin('full');
    passUntil(null);
    expect(d.startDrill(drill)).toBe(true);
    seconds(DRILL_SECONDS);
    expect(d.drillActive).toBeNull();
    expect(w.xpHeld).toBe(false);
    expect(w.calls).toContain('despawn:replay.blocker');
    expect(d.onLethal()).toBe(false);
    expect(d.startDrill(drill)).toBe(true);
    d.cancelDrill();
    expect(d.drillActive).toBeNull();
    expect(w.xpHeld).toBe(false);
    expect(w.toasts.filter((t) => t === 'tutorial.replay.cancelled')).toHaveLength(2);
  });

  it('a restart fade that resolves after a load or teardown does nothing', async () => {
    d.begin('full');
    passUntil('t09');
    w.autoFade = false;
    expect(d.onLethal()).toBe(true);
    tick();
    const fade = w.fadePromise!;
    const save = d.serialize();
    d.load(save);
    d.onSaveLoaded();
    tick();
    ev({ type: 'blocked' });
    fade.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(d.restartInFlight).toBe(false);
    expect(d.currentStep).toBe(0);
    expect(w.spawned.filter((s) => s.spawnerId === 't09.soldier' && s.healthScale === 0.5)).toHaveLength(0);

    expect(d.onLethal()).toBe(true);
    tick();
    const fade2 = w.fadePromise!;
    d.dispose();
    const xpBefore = w.xpHeld;
    const spawns = w.spawned.length;
    fade2.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(w.spawned.length).toBe(spawns);
    expect(w.xpHeld).toBe(xpBefore);
  });

  it('a save from before the director, past T12 or into M01, migrates to complete', () => {
    for (const [quest, state] of [['t12', 'completed'], ['m01', 'active'], ['m01', 'completed']] as const) {
      const w2 = new FakeWorld();
      w2.quests.set(quest, state);
      w = w2;
      d = new TutorialDirector(w2, data);
      d.onSaveLoaded();
      tick();
      expect(d.complete).toBe(true);
      expect(w2.locks).toEqual([]);
      // After M01 the quest posts own Gaut and Aelfreda (src/quests/posts.ts): the tutorial no longer places them.
      if (quest === 'm01' && state === 'completed') expect(w2.calls).not.toContain('place:gaut@tutorial.gaut.gate');
      else expect(w2.calls).toContain('place:gaut@tutorial.gaut.gate');
    }
    const w3 = new FakeWorld();
    w3.quests.set('t01', 'completed');
    w = w3;
    d = new TutorialDirector(w3, data);
    d.onSaveLoaded();
    expect(d.beat).toBe('t02');
    expect(d.complete).toBe(false);
  });

  it('a reload in a beat with no NPC entry re-applies the latest placement (Gaut at the lane in T07)', () => {
    d.begin('full');
    passUntil('t07');
    const save = d.serialize();
    const w2 = new FakeWorld();
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    const gaut = w2.calls.filter((c) => c.startsWith('place:gaut@'));
    expect(gaut).toHaveLength(1);
    const expected = FULL_ORDER.slice(0, FULL_ORDER.indexOf('t07') + 1)
      .map((b) => BEATS[b].npcs?.gaut)
      .filter(Boolean)
      .pop();
    expect(gaut[0]).toBe(`place:gaut@${expected}`);
  });
});

describe('clarity review fixes', () => {
  it('a skirmish restart in its last step respawns only the wave that step still needs (review M3)', async () => {
    d.begin('veteran');
    passUntil('skirmish');
    ev({ type: 'dodged' });
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
    ev({ type: 'groupCleared', spawnerId: 't10.sweeper' });
    expect(d.currentStep).toBe(2);
    expect(d.onLethal()).toBe(true); // Second Wind
    expect(d.onLethal()).toBe(true); // restart
    const before = w.spawned.length;
    tick();
    await Promise.resolve();
    await Promise.resolve();
    expect(d.beat).toBe('skirmish');
    expect(d.currentStep).toBe(2);
    const respawned = w.spawned.slice(before).map((s) => s.spawnerId);
    expect(respawned).toEqual(expect.arrayContaining(['t09.soldier', 't11.square']));
    expect(respawned).not.toContain('t08.lane');
    expect(respawned).not.toContain('t10.sweeper');
  });

  it('skirmish counts: the tracker gets one unit per step goal (review 24)', () => {
    d.begin('veteran');
    passUntil('skirmish');
    ev({ type: 'dodged' });
    ev({ type: 'groupCleared', spawnerId: 't08.lane' });
    ev({ type: 'groupCleared', spawnerId: 't10.sweeper' });
    ev({ type: 'groupCleared', spawnerId: 't09.soldier' });
    ev({ type: 'groupCleared', spawnerId: 't11.square' });
    expect(d.beat).toBe('t12');
    expect(w.goals.filter((g) => g.startsWith('skirmish.'))).toEqual(['skirmish.0', 'skirmish.1', 'skirmish.2']);
  });

  it('T06 calls "Again!" once, after the first sprint', () => {
    d.begin('full');
    passUntil('t06');
    for (let seg = 0; seg < 2; seg++) {
      for (let i = 0; i < 90; i++) {
        feet = { x: feet.x + 0.5, y: 0, z: 0 };
        tick(1, { sprinting: true, moving: true });
      }
      tick(1, { sprinting: false });
      expect(w.calls.filter((c) => c === 'line:tutorial.line.t06.again')).toHaveLength(1);
    }
  });

  it('a reload sends the tracker what an old save lacks, so the step objectives fill (review B1)', () => {
    d.begin('full');
    passUntil('t09');
    ev({ type: 'blocked' });
    const save = d.serialize();
    const w2 = new FakeWorld();
    w2.tracked.set('t09.0', 0); // an old save: the quest has the step objective but counted nothing
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(w2.goals.filter((g) => g === 't09.0')).toHaveLength(1);
    ev({ type: 'blocked' });
    ev({ type: 'blocked' });
    expect(w2.goals.filter((g) => g === 't09.0')).toHaveLength(3);
  });

  it('a reload whose tracker already agrees sends nothing, and beats finish with one beatDone each', () => {
    d.begin('full');
    passUntil('t09');
    ev({ type: 'blocked' });
    const save = d.serialize();
    const w2 = new FakeWorld();
    w2.tracked.set('t09.0', 1);
    w = w2;
    d = new TutorialDirector(w2, data);
    d.load(save);
    d.onSaveLoaded();
    tick();
    expect(w2.goals).toEqual([]);
    expect(w2.beatsDone).toEqual([]);
    passUntil(null);
    expect(new Set(w2.beatsDone).size).toBe(w2.beatsDone.length);
  });

  it('currentTarget is null during the crack and during a restart, and follows the step otherwise', async () => {
    d.begin('full', 't05');
    expect(d.currentTarget()).toBeNull();
    d = new TutorialDirector((w = new FakeWorld()), data);
    d.begin('full', 't07');
    expect(d.currentTarget()).toBe('lane.cart');
    ev({ type: 'trigger', id: 'trg.t07.cart' });
    expect(d.currentTarget()).toBe('lane.fence');
    d = new TutorialDirector((w = new FakeWorld()), data);
    d.begin('full', 't09');
    w.autoFade = false;
    d.onLethal();
    d.onLethal();
    expect(d.restartInFlight).toBe(true);
    expect(d.currentTarget()).toBeNull();
  });

});

describe('restart keeps the tracker equal to the real count (review m11)', () => {
  const restart = async () => {
    expect(d.onLethal()).toBe(true); // Second Wind
    expect(d.onLethal()).toBe(true); // restart
    tick();
    await Promise.resolve();
    await Promise.resolve();
  };

  it('T15: the gate wave cleared before a failure stays counted and is not respawned', async () => {
    d.begin('full', 't15');
    ev({ type: 'trigger', id: 'trg.t15.gate' });
    ev({ type: 'groupCleared', spawnerId: 't15.gate' });
    expect(d.currentStep).toBe(1);
    expect(w.goals.filter((g) => g === 't15.1')).toHaveLength(1); // the clear, not the spell yet
    const before = w.spawned.length;
    await restart();
    expect(d.beat).toBe('t15');
    expect(d.currentStep).toBe(1);
    expect(w.spawned.slice(before).map((s) => s.spawnerId)).not.toContain('t15.gate');
    // Only the spell is owed: one more unit, and the step passes on it alone.
    ev({ type: 'spellReleased', spellId: 'heartshard-surge' });
    expect(d.currentStep).toBe(2);
    expect(w.goals.filter((g) => g === 't15.1')).toHaveLength(2);
  });

  it('T15: a wave not yet cleared at the failure respawns, and the tracker still ends at the real count', async () => {
    d.begin('full', 't15');
    ev({ type: 'trigger', id: 'trg.t15.gate' });
    ev({ type: 'spellReleased', spellId: 'heartshard-surge' });
    const before = w.spawned.length;
    await restart();
    expect(w.spawned.slice(before).map((s) => s.spawnerId)).toContain('t15.gate');
    expect(w.goals.filter((g) => g === 't15.1')).toHaveLength(1);
    ev({ type: 'groupCleared', spawnerId: 't15.gate' });
    expect(d.currentStep).toBe(2);
    expect(w.goals.filter((g) => g === 't15.1')).toHaveLength(2);
  });
});
