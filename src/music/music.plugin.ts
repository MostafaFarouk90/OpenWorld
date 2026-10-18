import * as THREE from 'three';
import type { GameContext } from '../core/Game';
import type { GamePlugin } from '../core/plugins';
import type { GameServices } from '../core/Services';
import { BarClock } from './barClock';
import { isCombatHit } from './hostileSet';
import { MusicDirector } from './MusicDirector';
import { impactLayers, isHeavyHit, resolveMaterial, swingLayer } from './sfxLayers';
import { registerPlaceholderSfx, SfxPlayer } from './SfxPlayer';
import { loadTrackStems } from './stemLoader';
import { BARLEY_AND_BRAZIER, loopSeconds, type TrackDef } from './tracks';

export type MusicService = GameServices['music'];

declare module '../core/Services' {
  interface GameServices {
    /** Provided by thread 8 (src/music); contracts/music-states.md section 2. */
    music: {
      readonly state: import('./MusicDirector').MusicState;
      setBoss(on: boolean): void;
      duck(reason: string, on: boolean): void;
      setRegionTrack(trackId: string): void;
    };
  }
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
  const audioNow = (): number => audio.context.currentTime;

  const director = new MusicDirector({
    track,
    driver: { setMix: (mix, ramp) => audio.music.setMix(mix, ramp) },
  });

  ctx.services.provide('music', {
    get state() {
      return director.state;
    },
    setBoss: (on) => director.setBoss(on, audioNow()),
    duck: (reason, on) => director.duck(reason, on),
    setRegionTrack(trackId) {
      if (!TRACKS[trackId] || trackId !== track.id) {
        console.warn(`Music: unknown or unsupported region track "${trackId}"; slice 1 has only "${track.id}"`);
      }
    },
  });

  // --- stems: load in the background, start once ready and unlocked -----------------------------
  void (async () => {
    try {
      const loaded = await loadTrackStems(audio.context, track);
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
        if (disposed || director.started || audio.music.isPlaying) return;
        audio.music.start(director.currentMix());
        const startedAt = audio.music.startedAt;
        if (startedAt === null) return;
        director.start(new BarClock(startedAt, loopSeconds(track, audio.context.sampleRate), track.bars), audioNow());
      });
    } catch (err) {
      console.warn('Music: stems failed to load; the world stays without music.', err);
    }
  })();

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

  // --- events -------------------------------------------------------------------------------
  const ev = ctx.events;
  const playerId = ctx.actors.player.id;

  ev.on('ai.aggro', (e) => {
    if (e.targetId === playerId) director.onAggro(e.actorId);
  });
  ev.on('ai.calm', (e) => director.onCalm(e.actorId, audioNow()));
  ev.on('actor.died', (e) => director.onCalm(e.actorId, audioNow()));
  ev.on('actor.despawned', (e) => director.onCalm(e.actorId, audioNow()));
  ev.on('mercy', (e) => {
    if (e.actorId) director.onMercy(e.actorId, audioNow());
  });
  ev.on('discover', () => director.requestDiscover());
  ev.on('waystone.rekindled', () => director.requestDiscover());
  ev.on('dialogue.started', (e) => director.duck(`dialogue:${e.dialogueId}`, true));
  ev.on('dialogue.ended', (e) => director.duck(`dialogue:${e.dialogueId}`, false));
  ev.on('cutscene.started', (e) => director.duck(`cutscene:${e.cutsceneId}`, true));
  ev.on('cutscene.ended', (e) => director.duck(`cutscene:${e.cutsceneId}`, false));
  ev.on('save.loaded', () => director.reset(audioNow()));
  ev.on('actor.revived', (e) => {
    if (e.actorId === playerId && e.reason === 'respawn') director.reset(audioNow());
  });

  ev.on('damage.dealt', (r) => {
    const target = ctx.actors.get(r.targetId);
    const attacker = r.attackerId ? ctx.actors.get(r.attackerId) : undefined;
    if (isCombatHit(r.kind, attacker?.team, target?.team)) director.onCombatHit(audioNow());

    if (!target) return;
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

  ctx.systems.add({
    id: 'music',
    fixedPhase: 'rules',
    order: 200,
    fixedUpdate: () => director.update(audioNow(), distanceTo),
    dispose: () => director.dispose(),
  });

  return () => {
    disposed = true;
    director.dispose();
    if (audio.music.isPlaying) audio.music.stop();
  };
}

let teardown: (() => void) | null = null;

const plugin: GamePlugin = {
  id: 'music',
  dependsOn: ['core'],
  setup(ctx) {
    teardown = setupMusic(ctx);
  },
  dispose() {
    teardown?.();
    teardown = null;
  },
};

export default plugin;
