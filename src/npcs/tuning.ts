// Tunable numbers for the tutorial NPCs. Posts only: nobody walks (item 37).

export const NPC_TUNING = {
  /** Within this distance (m) an idle NPC turns to look at the player. */
  glanceRadius: 6,
  /** Turn rate (rad/s) while glancing or returning to the post yaw. */
  idleTurnRate: 3,
  /** Turn rate (rad/s) while in dialogue with the player. */
  talkTurnRate: 6,
  /** Speed (m/s) of the one scripted walk (the carters leaving Hollin Ford). */
  walkSpeed: 1.4,
  /** Interaction radius (m) of the 'talk' interactable. */
  talkRadius: 2.5,
  /** An NPC's GLB starts downloading once the player is this close to its post (first-load budget). */
  modelLoadRadius: 100,
  /** Mixers of NPCs farther than this (m) from the player are not advanced. */
  animationCullDistance: 80,
  /** Largest dt (s) a behaviour step accepts; bigger values are clamped. */
  maxStepDt: 0.25,
  /** KayKit characters are ~2.3 m tall; this brings them to ~1.8 m (same as KNIGHT.modelScale). */
  modelBaseScale: 0.78,
  /** How far (0..1) the tint pulls the material colour toward the tint colour. */
  tintStrength: 0.5,
  /** Placeholder figure (metres). */
  placeholder: { height: 1.8, bodyRadius: 0.3, bodyLength: 0.8, headRadius: 0.2 },
} as const;
