/**
 * Wyrm colours (design 10 "Dragon fallback", 14.3). A palette is data only: every wyrm material reads it through
 * uniforms, so the three Act 2 palettes and Act 3's share one shader program per material role.
 */
export interface WyrmPalette {
  readonly id: string;
  /** Back scales. */
  readonly scale: number;
  /** Underside, blended in where the scale faces down. */
  readonly belly: number;
  /** Ember fresnel rim on the scales. */
  readonly rim: number;
  /** Glowing cracks between scales. */
  readonly crack: number;
  readonly horn: number;
  readonly eye: number;
  /** Mouth core at full inhale. */
  readonly mouth: number;
  readonly membrane: number;
  /** Wing bones and legs. */
  readonly frame: number;
  /** Rim strength at rest, 0..1. */
  readonly rimStrength: number;
}

export type WyrmPaletteId = 'ember' | 'wyrmling' | 'orsk' | 'cooled-slag' | 'hathren';

export const WYRM_PALETTES: Readonly<Record<WyrmPaletteId, WyrmPalette>> = {
  // Ember Wyrm (row 6): soot-black scales, orange rim and cracks, a dull red membrane.
  ember: {
    id: 'ember', scale: 0x2a1c18, belly: 0x5a3020, rim: 0xff6a1a, crack: 0xff8a2a, horn: 0x1a1210, eye: 0xffc040,
    mouth: 0xffa030, membrane: 0x6a2418, frame: 0x241814, rimStrength: 0.55,
  },
  // Wyrmling (row 7): lighter and warmer, a young hide.
  wyrmling: {
    id: 'wyrmling', scale: 0x5a3424, belly: 0xb07040, rim: 0xffa040, crack: 0xffb050, horn: 0x3a2418, eye: 0xffe080,
    mouth: 0xffc060, membrane: 0xa04a2a, frame: 0x4a2a1c, rimStrength: 0.45,
  },
  // Orsk (row 28): the shared dragon build, grey-blue tint.
  orsk: {
    id: 'orsk', scale: 0x3a4652, belly: 0x6a7884, rim: 0x8fb8ff, crack: 0xffa050, horn: 0x22282e, eye: 0xb0e0ff,
    mouth: 0xffb060, membrane: 0x4a5866, frame: 0x2a3138, rimStrength: 0.35,
  },
  // Ysmeryth (Act 3, reserved): cooled slag with a lit crest.
  'cooled-slag': {
    id: 'cooled-slag', scale: 0x2e2a28, belly: 0x4a403a, rim: 0xff7a3a, crack: 0xffb060, horn: 0x161412, eye: 0xffe0a0,
    mouth: 0xffc070, membrane: 0x3e3430, frame: 0x221e1c, rimStrength: 0.4,
  },
  // Hathren Quench-Tongue (Act 3, row 29): the shared build in a teal water form; cold aqua rim, pale jade belly.
  hathren: {
    id: 'hathren', scale: 0x1f4a4e, belly: 0x8fb8a8, rim: 0x7fe8e0, crack: 0x9ff0e8, horn: 0x16302f, eye: 0xd8fff0,
    mouth: 0xbff8f0, membrane: 0x2f6a6a, frame: 0x183a3a, rimStrength: 0.4,
  },
};

export function paletteOf(p: WyrmPaletteId | WyrmPalette): WyrmPalette {
  return typeof p === 'string' ? WYRM_PALETTES[p] : p;
}
