import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { GameServices } from '../core/Services';
import { AmbienceBed } from '../audio/AmbienceBed';
import { InteriorFx } from '../audio/InteriorFx';
import { MusicReverb } from '../audio/MusicReverb';
import type { StemMixer } from '../audio/StemMixer';
import { BarClock } from './barClock';
import { BeatScheduler, beatInfoAt, performanceToAudioTime, type BeatInfo } from './beatClock';
import { isCombatHit } from './hostileSet';
import { MusicDirector } from './MusicDirector';
import { musicConfig } from './musicConfig';
import { BARE_SFX, impactLayers, isHeavyHit, resolveMaterial, SFX, swingLayer } from './sfxLayers';
import { registerPlaceholderSfx, SfxPlayer } from './SfxPlayer';
import { loadTrackStems } from './stemLoader';
import { HandoverMachine, planHandover } from './trackSwitch';
import { BARLEY_AND_BRAZIER, loopSeconds, TRACKS_BY_ID, type TrackDef } from './tracks';

export type MusicService = GameServices['music'];

declare module '../core/Services' {
  interface GameServices {
    /** Provided by thread 8 (src/music); contracts/music-states.md section 2. */
    music: {
      readonly state: import('./MusicDirector').MusicState;
      setBoss(on: boolean, bossId?: string): void;
      duck(reason: string, on: boolean): void;
      setRegionTrack(trackId: string): void;
      /** contracts/music-states.md section 6. Null while audio is locked or no track plays. */
      beat(): BeatInfo | null;
      onBeat(cb: (b: BeatInfo) => void): () => void;
      toAudioTime(performanceMs: number): number;
    };
  }
}

/** M05's trinket (thread 6): cosmetic, never used, so its sound plays when it is granted. */
const WHISTLE_ITEM = 'tobbs-lucky-whistle';
const BARK_GAP_SECONDS = 0.8;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Services this plugin reads lazily: it depends only on core, and some of them come from later plugins. */
interface LazyServices {
  region?: { at(x: number, z: number): { id: string; track: string } | null };
  interiors?: { readonly current: string | null };
  stealth?: { active(): boolean };
  chase?: { active(): boolean };
}

const POLL_SECONDS = 0.25;
const PROBE_SECONDS = 1;
const PROBE_METRES = 400;
const PRELOAD_KEEP_SECONDS = 30;
const PROBE_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2],
  [-1, 0], [-Math.SQRT1_2, -Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Wires the music director and the SFX player into the world. Returns the teardown. Registrations
 * made through the scoped context (events, systems, services) are also undone by the plugin
 * loader; the teardown stops the mixer and cancels a stem load still in flight.
 */
export function setupMusic(ctx: GameContext, initialTrack?: TrackDef): () => void {
  const maybeAudio = ctx.services.get('audio');
  if (!maybeAudio) return () => {}; // no Web Audio: the world runs silently and no music service exists
  const audio: NonNullable<typeof maybeAudio> = maybeAudio;

  const lazy = <K extends keyof LazyServices>(name: K): LazyServices[K] | undefined =>
    (ctx.services as unknown as { get(n: string): unknown }).get(name) as LazyServices[K] | undefined;
  const regionAtPlayer = (): { id: string; track: string } | null => {
    try {
      return lazy('region')?.at(ctx.player.feet.x, ctx.player.feet.z) ?? null;
    } catch {
      return null;
    }
  };
  // The track of the region the player stands in; Brightwater's when no region service answers.
  let track: TrackDef = initialTrack ?? TRACKS_BY_ID[regionAtPlayer()?.track ?? ''] ?? BARLEY_AND_BRAZIER;

  let disposed = false;
  let gameTime = 0; // simulated seconds: stands still while the game is paused
  const audioNow = (): number => audio.context.currentTime;

  let clock: BarClock | null = null;
  const beats = new BeatScheduler();
  const fx = InteriorFx.create(audio.context, audio.musicBus ?? null, audio.masterNode ?? null);
  // One cheap shared reverb outdoors; indoors the interior's own takes over.
  const reverb = MusicReverb.create(audio.context as never, audio.musicBus ?? null, audio.masterNode ?? null);
  const bed = AmbienceBed.create(audio.context as never, audio.masterNode ?? null);

  // Region handover state (design 6.1 trigger 6): the idle mixer holds the next track's stems.
  const machine = new HandoverMachine(track.id);
  let committed: { track: TrackDef; clock: BarClock; at: number } | null = null;
  let idleLoaded: string | null = null;
  let preloading: string | null = null;
  let loadGeneration = 0;
  let lastProbeHit = -Infinity;
  const warnedTracks = new Set<string>();
  const failedUntil = new Map<string, number>(); // a track whose load failed is retried after a backoff or a region.entered
  let discoverAfterSwap = false;

  const director = new MusicDirector({
    track,
    driver: {
      // Once the new mixer is scheduled it alone takes changes, held silent until the bar line.
      setMix: (mix, ramp = musicConfig.rampSeconds) =>
        committed ? audio.musicNext.setMixAt(mix, committed.at) : audio.music.setMix(mix, ramp),
    },
  });

  ctx.services.provide('music', {
    get state() {
      return director.state;
    },
    setBoss: (on, bossId) => director.setBoss(on, gameTime, bossId),
    beat() {
      const state = (audio.context as { state?: string }).state;
      if (disposed || !clock || (state !== undefined && state !== 'running')) return null;
      return beatInfoAt(clock, track.bpm, audioNow()); // the active track until the swap
    },
    onBeat: (cb) => beats.onBeat(cb),
    toAudioTime: (ms) => performanceToAudioTime(audio.context, ms, performance.now(), musicConfig.beatInputOffsetSeconds),
    duck: (reason, on) => director.duck(reason, on),
    setRegionTrack: (trackId) => requestTrack(trackId),
  });

  // --- SFX ----------------------------------------------------------------------------------
  const sfx = new SfxPlayer({ audio, now: audioNow });
  try {
    registerPlaceholderSfx(audio);
  } catch (err) {
    console.warn('Music: SFX registration failed; hits and swings stay silent.', err);
  }
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const warnedMaterials = new Set<string>();

  const positionOf = (actorId: string, out: THREE.Vector3): THREE.Vector3 | null => {
    const actor = ctx.actors.get(actorId);
    if (!actor || !actor.root) return null;
    return actor.worldPosition(out);
  };

  const distanceTo = (actorId: string): number | undefined => {
    const p = positionOf(actorId, tmpA);
    return p ? p.distanceTo(ctx.player.feet) : undefined;
  };

  /** Any living, unmercied hostile-team actor within 12 m keeps the fight going, aggroed or not. */
  const hostileNearby = (): boolean => {
    for (const a of ctx.actors.all()) {
      if (a.team !== 'hostile' || a.dead || !a.root || ctx.state.isMercied(a.id)) continue;
      if (a.worldPosition(tmpA).distanceTo(ctx.player.feet) <= musicConfig.hostileClearRadius) return true;
    }
    return false;
  };

  // --- events -------------------------------------------------------------------------------
  const ev = ctx.events;
  const playerId = ctx.actors.player.id;

  ev.on('ai.aggro', (e) => {
    if (e.targetId === playerId) director.onAggro(e.actorId);
    else director.onCalm(e.actorId, gameTime); // retargeted to someone else
  });
  ev.on('ai.calm', (e) => director.onCalm(e.actorId, gameTime));
  ev.on('actor.died', (e) => director.onCalm(e.actorId, gameTime));
  ev.on('actor.despawned', (e) => director.onCalm(e.actorId, gameTime));
  ev.on('mercy', (e) => {
    if (e.actorId) director.onMercy(e.actorId, gameTime);
  });
  ev.on('discover', () => {
    // A phrase planned on the old clock would be cut at the swap: hold it for the new track.
    if (machine.view().phase !== 'idle') discoverAfterSwap = true;
    else director.requestDiscover();
  });
  ev.on('waystone.rekindled', () => director.requestDiscover());
  ev.on('dialogue.started', (e) => director.duck(`dialogue:${e.dialogueId}`, true));
  ev.on('dialogue.ended', (e) => director.duck(`dialogue:${e.dialogueId}`, false));
  ev.on('cutscene.started', (e) => director.duck(`cutscene:${e.cutsceneId}`, true));
  ev.on('cutscene.ended', (e) => director.duck(`cutscene:${e.cutsceneId}`, false));
  ev.on('save.loaded', () => {
    director.reset(gameTime);
    rederiveBosses();
    rederiveSneakAndChase();
    // The interiors service sets its current id before `save.loaded`; never reset to outdoors blindly.
    const current = lazy('interiors')?.current ?? null;
    fx?.setInterior(current);
    reverb?.setIndoors(current !== null);
    bed?.setInterior(current);
    pollRegion();
  });
  ev.on('actor.revived', (e) => {
    if (e.actorId === playerId && e.reason === 'respawn') {
      director.reset(gameTime);
      rederiveBosses();
      rederiveSneakAndChase();
    }
  });

  // Stealth and chase (thread 18, v0.5). A catch keeps the section live; only the alert overlay resets.
  ev.on('stealth.section', (e) => {
    if (e.phase === 'entered') director.stealthEntered(e.sectionId);
    else director.stealthEnded(e.sectionId, gameTime);
  });
  ev.on('stealth.alert', (e) => director.stealthAlert(e.observerId, e.state));
  ev.on('stealth.caught', () => director.stealthCaught());
  ev.on('chase.started', (e) => director.chaseStarted(e.chaseId));
  ev.on('chase.caught', (e) => director.chaseCaught(e.chaseId, gameTime));
  ev.on('chase.lost', (e) => director.chaseLost(e.chaseId, e.reason, gameTime));

  ev.on('region.entered', () => {
    failedUntil.clear();
    pollRegion();
  });

  // Boss music follows the core registry only (phases are 1-based).
  ev.on('boss.started', (e) => director.bossStarted(e.bossId, ctx.bosses?.state(e.bossId)?.phase ?? 1, gameTime));
  ev.on('boss.phase', (e) => director.bossPhase(e.bossId, e.phase));
  ev.on('boss.releaseWindow', (e) => director.bossHush(e.bossId, e.open));
  ev.on('boss.defeated', (e) => director.bossResolved(e.bossId, gameTime));
  ev.on('boss.released', (e) => director.bossResolved(e.bossId, gameTime));
  ev.on('boss.ended', (e) => director.bossEnded(e.bossId, gameTime));

  // Interiors: one slot (contracts/interiors-and-nav.md); the same id again is a no-op.
  ev.on('interior.entered', (e) => {
    fx?.setInterior(e.interiorId);
    reverb?.setIndoors(true);
    bed?.setInterior(e.interiorId);
  });
  ev.on('interior.exited', () => {
    fx?.setInterior(null);
    reverb?.setIndoors(false);
    bed?.setInterior(null);
  });

  // Slice 2 sounds.
  ev.on('shrine.rekindled', () => {
    if (director.state !== 'combat' && director.state !== 'boss') sfx.playKey(BARE_SFX.shrineRekindle);
    director.requestDiscover();
  });
  ev.on('wardstones.complete', () => sfx.playKey(BARE_SFX.wardstonesComplete));
  ev.on('loot.granted', (e) => {
    if (e.items.some((i) => i.itemId === WHISTLE_ITEM)) sfx.playKey(BARE_SFX.whistle);
  });
  ev.on('player.leap', (e) => {
    if (e.phase === 'start') sfx.play([SFX.leap], e.from);
    else if (e.phase === 'land' && e.to) sfx.play([SFX.thump], e.to);
  });
  const seenPulses: string[] = [];
  ev.on('mercy', (e) => {
    if (e.verb !== 'release') return;
    if (e.pulseId !== undefined) {
      if (seenPulses.includes(e.pulseId)) return;
      seenPulses.push(e.pulseId);
      if (seenPulses.length > 16) seenPulses.shift();
    }
    sfx.play([SFX.releasePulse], ctx.player.feet);
  });
  ev.on('enemies.yield', (e) => {
    const at = positionOf(e.actorId, tmpB);
    if (at) sfx.play([SFX.yieldKneel], at);
  });
  ev.on('companion.banter', (e) => {
    sfx.play([SFX.companionBark], ctx.player.feet, { variant: hashString(e.lineKey), minGapSeconds: BARK_GAP_SECONDS });
  });

  ev.on('damage.dealt', (r) => {
    const target = ctx.actors.get(r.targetId);
    const attacker = r.attackerId ? ctx.actors.get(r.attackerId) : undefined;
    const combatHit = isCombatHit(r.kind, attacker?.team, target?.team);
    if (combatHit) {
      director.onCombatHit(gameTime);
      // A hostile that hits the player is part of the fight even if its aggro event named someone else.
      if (combatHit === 'hostile-hit-player' && r.attackerId) director.onAggro(r.attackerId);
    }

    // Spell sounds belong to the spells thread; falls and script damage are silent here.
    if (!target || r.kind !== 'melee') return;
    const raw = (target.data['audio'] as { material?: unknown } | undefined)?.material;
    const { material, known } = resolveMaterial(raw);
    if (!known && !warnedMaterials.has(String(raw))) {
      warnedMaterials.add(String(raw));
      console.warn(`Music: unknown hit material "${String(raw)}"; using flesh`);
    }
    const layers = impactLayers(r.outcome, material, isHeavyHit(r));
    if (layers.length === 0) return;
    const at = r.point ?? positionOf(r.targetId, tmpB);
    if (at) sfx.play(layers, at);
  });

  ev.on('attack.window', (e) => {
    if (e.phase !== 'open') return;
    const at = positionOf(e.actorId, tmpB);
    if (at) sfx.play([swingLayer(e.attackId)], at);
  });

  /** Boss ids the registry has right now; after a load or respawn the director forgot them. */
  function rederiveBosses(): void {
    for (const id of ctx.bosses?.active() ?? []) {
      const st = ctx.bosses.state(id);
      // A beaten or released boss stays registered until it despawns; its music is over.
      if (st?.outcome) continue;
      director.bossStarted(id, st?.phase ?? 1, gameTime);
      if (st?.releaseOpen) director.bossHush(id, true);
    }
  }

  function rederiveSneakAndChase(): void {
    try {
      director.deriveStealth(lazy('stealth')?.active() === true);
      director.deriveChase(lazy('chase')?.active() === true);
    } catch (err) {
      console.warn('Music: could not read the stealth or chase service:', err);
    }
  }

  rederiveBosses(); // a boss registered before this plugin's setup
  rederiveSneakAndChase();

  // --- region handover ----------------------------------------------------------------------
  const sampleRate = (): number => audio.context.sampleRate;

  /** Builds `next`'s stems into the idle mixer; false if cancelled, superseded or nothing could be built. */
  async function preloadIdle(next: TrackDef): Promise<boolean> {
    const idle = audio.musicNext as StemMixer | undefined;
    if (!idle) return false;
    const generation = ++loadGeneration;
    const stale = (): boolean => disposed || generation !== loadGeneration;
    if (idleLoaded === next.id && idle.stemCount > 0) return true;
    idle.clear();
    idleLoaded = null;
    preloading = next.id;
    try {
      const loaded = await loadTrackStems(audio.context, next, { isCancelled: stale });
      if (stale() || loaded.cancelled) return false;
      if (loaded.buffers.size === 0) return false;
      let added = 0;
      for (const [id, buffer] of loaded.buffers) {
        if (stale()) return false;
        try {
          await idle.add(id, buffer);
          added++;
        } catch (err) {
          if (!warnedTracks.has(`stem:${next.id}`)) {
            warnedTracks.add(`stem:${next.id}`);
            console.warn(`Music: could not add stem "${id}" of ${next.id}:`, err);
          }
        }
      }
      if (stale()) return false;
      if (added === 0) return false;
      idleLoaded = next.id;
      return true;
    } catch (err) {
      console.warn(`Music: could not load ${next.id}:`, err);
      return false;
    } finally {
      if (generation === loadGeneration) preloading = null;
    }
  }

  async function prepare(next: TrackDef): Promise<void> {
    const ok = idleLoaded === next.id ? true : await preloadIdle(next);
    if (disposed) return;
    if (!ok) {
      // Superseded or cancelled loads leave the machine as the newer request set it.
      if (machine.view().target === next.id && idleLoaded !== next.id && preloading === null) {
        machine.fail(next.id);
        failedUntil.set(next.id, gameTime + 20);
        if (!warnedTracks.has(next.id)) {
          warnedTracks.add(next.id);
          console.warn(`Music: could not prepare "${next.id}"; keeping "${track.id}".`);
        }
      }
      return;
    }
    tryCommit();
  }

  function requestTrack(trackId: string): void {
    const next = TRACKS_BY_ID[trackId];
    if (!next) {
      if (!warnedTracks.has(trackId)) {
        warnedTracks.add(trackId);
        console.warn(`Music: unknown region track "${trackId}"; keeping "${track.id}"`);
      }
      return;
    }
    if ((failedUntil.get(trackId) ?? -Infinity) > gameTime) return;
    if (!director.started || !clock || disposed) return; // audio is not playing yet: nothing to hand over from
    if (machine.request(trackId)) void prepare(next);
    else tryCommit();
  }

  /** Commits the planned handover once the stems are ready and no boss fight is on. */
  function tryCommit(): void {
    const view = machine.view();
    if (view.phase !== 'loading' || !view.target || idleLoaded !== view.target) return;
    if (director.bossActive || !clock || committed) return;
    const next = TRACKS_BY_ID[view.target];
    const now = audioNow();
    const at = planHandover(clock, now, musicConfig.rampSeconds);
    const nextClock = new BarClock(at, loopSeconds(next, sampleRate()), next.bars);
    try {
      director.switchTrack(next, nextClock, gameTime);
      const incoming = audio.musicNext;
      incoming.start(director.currentMix() as Record<string, number>, Math.max(0, at - now));
      // The old track fades so it is silent exactly on the bar line; the new one starts at full on it.
      audio.music.setMix(Object.fromEntries(track.stems.map((s) => [s, 0])), musicConfig.rampSeconds, at);
      machine.commit(next.id, at);
      committed = { track: next, clock: nextClock, at };
    } catch (err) {
      console.warn(`Music: could not start ${next.id}:`, err);
      try {
        audio.musicNext.stop();
      } catch {
        /* nothing was started */
      }
      idleLoaded = null;
      failedUntil.set(next.id, gameTime + 20);
      if (clock) director.switchTrack(track, clock, gameTime); // back to the track that is still playing
      machine.fail(next.id);
    }
  }

  /** At the bar line the new mixer becomes the active one. */
  function swapIfDue(): void {
    if (!committed || audioNow() < committed.at) return;
    const done = committed;
    committed = null;
    const outgoing = audio.music;
    audio.swapMusic();
    try {
      outgoing.stop(); // already silent; its stems stay cached for the walk back
    } catch (err) {
      console.warn('Music: could not stop the outgoing mixer:', err);
    }
    idleLoaded = track.id;
    track = done.track;
    clock = done.clock;
    beats.reset();
    if (discoverAfterSwap) {
      discoverAfterSwap = false;
      director.requestDiscover();
    }
    const queued = machine.swap();
    if (queued) void prepare(TRACKS_BY_ID[queued]);
  }

  /** What the player's region wants: the bed, and the track (never from the null corridor). */
  function pollRegion(): void {
    const info = regionAtPlayer();
    bed?.setRegion(info?.id ?? null);
    if (info && TRACKS_BY_ID[info.track]) requestTrack(info.track);
  }

  /** Preloads the neighbouring region's track when the player is within 400 m of its border. */
  function probeNeighbours(now: number): void {
    const region = lazy('region');
    if (!region || !director.started || committed) return;
    const { x, z } = ctx.player.feet;
    let found: string | null = null;
    for (const [dx, dz] of PROBE_DIRECTIONS) {
      let at: { track: string } | null = null;
      try {
        at = region.at(x + dx * PROBE_METRES, z + dz * PROBE_METRES);
      } catch {
        at = null;
      }
      if (at && at.track !== track.id && TRACKS_BY_ID[at.track] && (failedUntil.get(at.track) ?? -Infinity) <= now) {
        found = at.track;
        break;
      }
    }
    if (found) {
      lastProbeHit = now;
      if (machine.view().phase === 'idle' && idleLoaded !== found && preloading !== found) void preloadIdle(TRACKS_BY_ID[found]);
    } else if ((idleLoaded || preloading) && machine.view().phase === 'idle' && now - lastProbeHit > PRELOAD_KEEP_SECONDS) {
      loadGeneration++; // cancels a load in flight and discards its result
      audio.musicNext?.clear();
      idleLoaded = null;
      preloading = null;
    }
  }

  let pollClock = 0;
  let probeClock = 0;

  ctx.systems.add({
    id: 'music',
    fixedPhase: 'rules',
    order: 200,
    fixedUpdate: (dt) => {
      gameTime += dt;
      director.update(gameTime, distanceTo, { audioNow: audioNow(), hostileNear: hostileNearby() });
      const state = (audio.context as { state?: string }).state;
      const running = state === undefined || state === 'running';
      if (clock && running) beats.update(clock, track.bpm, audioNow(), committed?.at);
      if (running) swapIfDue();
      if (running && (pollClock += dt) >= POLL_SECONDS) {
        pollClock = 0;
        pollRegion();
        tryCommit(); // a boss fight that held the handover is over
      }
      if (running && (probeClock += dt) >= PROBE_SECONDS) {
        probeClock = 0;
        probeNeighbours(gameTime);
      }
    },
    dispose: () => {
      director.dispose();
      fx?.dispose();
      reverb?.dispose();
      bed?.dispose();
    },
  });

  // Last, so nothing above can throw after the background load has started with no owner to stop it.
  // --- stems: load in the background, start once ready and unlocked -----------------------------
  void (async () => {
    try {
      if (initialTrack === undefined) {
        // Plugins set up in id order, so `region` may not exist yet: resolve the track after setup.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (disposed) return;
        const wanted = TRACKS_BY_ID[regionAtPlayer()?.track ?? ''];
        if (wanted && wanted.id !== track.id) {
          track = wanted;
          machine.reset(wanted.id);
          director.setStartTrack(wanted);
        }
      }
      const loaded = await loadTrackStems(audio.context, track, {});
      if (disposed) return; // late result after dispose: discard
      if (loaded.buffers.size === 0) {
        console.warn('Music: no stem could be built; the world stays without music.');
        return;
      }
      for (const [id, buffer] of loaded.buffers) {
        try {
          await audio.music.add(id, buffer);
        } catch (err) {
          console.warn(`Music: could not add stem "${id}":`, err);
        }
      }
      if (disposed) return;
      audio.onUnlock(() => {
        // Runs inside the audio manager's resume callback: never let it throw into the other callbacks.
        try {
          if (disposed || director.started || audio.music.isPlaying) return;
          audio.music.start(director.currentMix());
          const startedAt = audio.music.startedAt;
          if (startedAt === null) return;
          beats.reset();
          clock = new BarClock(startedAt, loopSeconds(track, audio.context.sampleRate), track.bars);
          director.start(clock, gameTime);
        } catch (err) {
          console.warn('Music: could not start the mixer:', err);
        }
      });
    } catch (err) {
      console.warn('Music: stems failed to load; the world stays without music.', err);
    }
  })();

  return () => {
    disposed = true;
    loadGeneration++;
    director.dispose();
    fx?.dispose();
    reverb?.dispose();
    bed?.dispose();
    if (audio.music.isPlaying) audio.music.stop();
    if (audio.musicNext?.isPlaying) audio.musicNext.stop();
  };
}

const teardowns: Array<() => void> = [];

const plugin: GamePlugin = {
  id: 'music',
  dependsOn: ['core'],
  setup(ctx) {
    teardowns.push(setupMusic(ctx));
  },
  dispose() {
    for (const down of teardowns.splice(0).reverse()) down();
  },
};

export default plugin;
