# status

The `status` service (contracts/actors-and-damage.md section 10): bleed, ignite, stun and slow on any actor.

- `StatusEngine.ts`: pure bookkeeping (validation, refresh, ticks, expiry) behind `StatusPorts`.
- `status.plugin.ts`: wires it to the damage bus, the event bus, `actor.data['status']` and the player's move modifiers.
- `view.ts`: `ActorStatusView` (`stunned`, `stunRemaining`, `slow`), the shape thread 5's enemy brain reads from `actor.data['status']`.

Rules worth knowing:
- A bleed or ignite ticks `dps` once per full second (`kind: 'status'`, poise 0, unblockable). A trailing partial second does not tick.
- Same id on the same actor refreshes to the longer time and keeps the larger dps; different ids stack. Stun and slow are strongest-wins: all entries are kept, the longest stun and the largest slow are in effect.
- A tick the damage bus drops on a living target (team rule) ends that status.
- The player's guard and dodge ignore status ticks (`CombatVerbs.guardModifier`, `statusThroughDodge`); other i-frames (respawn grace, Second Wind) still stop them.
- A stunned player cannot move or use attack, block, dodge, jump, sprint, Surge, Leap, abilities or mount. This is `lockMove` plus `lockActions`, not the `freeze` modifier (freeze removes gravity and would hang a player mid-air).
- A mercy on an actor clears the statuses the player's side put on it. Death, despawn and `save.loaded` clear everything. Nothing is saved.
