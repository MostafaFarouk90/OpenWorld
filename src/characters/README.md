Characters: the player and the KayKit Knight avatar.

- `Player.ts`: kinematic capsule (physics/CharacterController) plus its visual; a placeholder capsule until `setAvatar`.
- `KnightAvatar.ts`: loads Knight.glb, scales it to the capsule, mounts the sword and shield on `handslotr` / `handslotl`.
- `AnimationController.ts`: locomotion state machine and crossfades over a `THREE.AnimationMixer`, advanced only in
  the fixed tick; emits footstep, landing and attack-window events.
- `locomotionState.ts`: pure transition rules and the attack movement lock.
- `knightClips.ts`: clip names, fallbacks, attack windows, foot-plant phases and bone names measured from Knight.glb.

The contract combat relies on is `contracts/animation-events.md` in the project files.
