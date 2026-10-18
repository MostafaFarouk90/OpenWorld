# Music and combat audio

`music.plugin.ts` plugs the music director and the SFX player into the world scene.

## Dropping in recorded stems

"Barley and Brazier" ships as procedurally generated placeholder stems. Recorded beatbox stems replace
them by file name, per stem, with no code change:

    public/assets/music/barley-and-brazier/{kick,snare,hat,bass,vocal,melody,boss}.ogg

Requirements: mono or stereo OGG, 92 BPM, exactly 16 bars (bars 1 to 8 the A statement, 9 to 16 the B variation),
all in D minor. The canonical length is `round(16 * 240 / 92 * sampleRate)` frames (about 41.74 s). A file within
2 frames of that is trimmed or zero-padded to match; any other length is rejected with a console warning and
that stem alone falls back to its placeholder. A stem that is missing or fails to decode also falls back.
The mixer never changes `playbackRate`, so every variant must be its own stem of the same length.

## Spell sounds

`registerPlaceholderSfx` also registers `sfx.surge.charge`, `sfx.surge.release` and `sfx.rally` under those exact
keys (no `#variant` suffix) for the spells plugin, which plays them through `services.get('audio')`.
