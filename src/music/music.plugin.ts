import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { GameServices } from '../core/Services';
import { InteriorFx } from '../audio/InteriorFx';
import { BarClock } from './barClock';
import { BeatScheduler, beatInfoAt, performanceToAudioTime, type BeatInfo } from './beatClock';
import { isCombatHit } from './hostileSet';
import { MusicDirector } from './MusicDirector';
import { musicConfig } from './musicConfig';
import { BARE_SFX, impactLayers, isHeavyHit, resolveMaterial, SFX, swingLayer } from './sfxLayers';
import { registerPlaceholderSfx, SfxPlayer } from './SfxPlayer';
import { loadTrackStems } from './stemLoader';
import { BARLEY_AND_BRAZIER, loopSeconds, type TrackDef } from './tracks';

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

const TRACKS: Readonly<Record<string, TrackDef>> = { [BARLEY_AND_BRAZIER.id]: BARLEY_AND_BRAZIER };

/**
 * Wires the music director and the SFX player into the world. Returns the teardown. Registrations
 * made through the scoped context (events, systems, services) are also undone by the plugin
 * loader; the teardown stops the mixer and cancels a stem load still in flight.
 */
export function setupMusic(ctx: GameContext, track: TrackDef = BARLEY_AND_BRAZIER): () => void {
  const audio = ctx.services.get('audio');
  if (!audio) return () => {}; // no Web Audio: the world runs silently and no music service exists

  let disposed = false;
  let gameTime = 0; // simulated seconds: stands still while the game is paused
  const audioNow = (): number => audio.context.currentTime;

  let clock: BarClock | null = null;
  const beats = new BeatScheduler();
  const fx = InteriorFx.create(audio.context, audio.musicBus ?? null, audio.masterNode ?? null);

  const director = new MusicDirector({
    track,
    driver: { setMix: (mix, ramp) => audio.music.setMix(mix, ramp) },
  });

  ctx.services.provide('music', {
    get state() {
      return director.state;
    },
    setBoss: (on, bossId) => director.setBoss(on, gameTime, bossId),
    beat() {
      const state = (audio.context as { state?: string }).state;
      if (!clock || (state !== undefined && state !== 'running')) return null;
      return beatInfoAt(clock, track.bpm, audioNow());
    },
    onBeat: (cb) => beats.onBeat(cb),
    toAudioTime: (ms) => performanceToAudioTime(audio.context, ms, performance.now(), musicConfig.beatInputOffsetSeconds),
    duck: (reason, on) => director.duck(reason, on),
    setRegionTrack(trackId) {
      if (!TRACKS[trackId] || trackId !== track.id) {
        console.warn(`Music: unknown or unsupported region track "${trackId}"; slice 1 has only "${track.id}"`);
      }
    },
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
  ev.on('discover', () => director.requestDiscover());
  ev.on('waystone.rekindled', () => director.requestDiscover());
  ev.on('dialogue.started', (e) => director.duck(`dialogue:${e.dialogueId}`, true));
  ev.on('dialogue.ended', (e) => director.duck(`dialogue:${e.dialogueId}`, false));
  ev.on('cutscene.started', (e) => director.duck(`cutscene:${e.cutsceneId}`, true));
  ev.on('cutscene.ended', (e) => director.duck(`cutscene:${e.cutsceneId}`, false));
  ev.on('save.loaded', () => {
    director.reset(gameTime);
    rederiveBosses();
    // The interiors service sets its current id before `save.loaded`; never reset to outdoors blindly.
    const interiors = (ctx.services as unknown as { get(name: string): { current?: string | null } | undefined }).get('interiors');
    fx?.setInterior(interiors?.current ?? null);
  });
  ev.on('actor.revived', (e) => {
    if (e.actorId === playerId && e.reason === 'respawn') {
      director.reset(gameTime);
      rederiveBosses();
    }
  });

  // Boss music follows the core registry only (phases are 1-based).
  ev.on('boss.started', (e) => director.bossStarted(e.bossId, ctx.bosses?.state(e.bossId)?.phase ?? 1, gameTime));
  ev.on('boss.phase', (e) => director.bossPhase(e.bossId, e.phase));
  ev.on('boss.releaseWindow', (e) => director.bossHush(e.bossId, e.open));
  ev.on('boss.defeated', (e) => director.bossResolved(e.bossId, gameTime));
  ev.on('boss.released', (e) => director.bossResolved(e.bossId, gameTime));
  ev.on('boss.ended', (e) => director.bossEnded(e.bossId, gameTime));

  // Interiors: one slot (contracts/interiors-and-nav.md); the same id again is a no-op.
  ev.on('interior.entered', (e) => fx?.setInterior(e.interiorId));
  ev.on('interior.exited', () => fx?.setInterior(null));

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
    for (const id of ctx.bosses?.active() ?? []) director.bossStarted(id, ctx.bosses.state(id)?.phase ?? 1, gameTime);
  }

  ctx.systems.add({
    id: 'music',
    fixedPhase: 'rules',
    order: 200,
    fixedUpdate: (dt) => {
      gameTime += dt;
      director.update(gameTime, distanceTo, { audioNow: audioNow(), hostileNear: hostileNearby() });
      const state = (audio.context as { state?: string }).state;
      if (clock && (state === undefined || state === 'running')) beats.update(clock, track.bpm, audioNow());
    },
    dispose: () => {
      director.dispose();
      fx?.dispose();
    },
  });

  // Last, so nothing above can throw after the background load has started with no owner to stop it.
  // --- stems: load in the background, start once ready and unlocked -----------------------------
  void (async () => {
    try {
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
    director.dispose();
    fx?.dispose();
    if (audio.music.isPlaying) audio.music.stop();
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
