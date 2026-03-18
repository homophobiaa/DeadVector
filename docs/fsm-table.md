# DeadVector FSM Transition Table

| Current State | Condition | Next State | Action |
| --- | --- | --- | --- |
| `SPAWN` | Spawn timer finishes and player is inside notice range | `CHASE` | Lock on to the player immediately |
| `SPAWN` | Spawn timer finishes and player is outside notice range | `WANDER` | Start roaming the arena |
| `WANDER` | Player enters notice range | `CHASE` | Move toward player position |
| `WANDER` | Zombie is low health and retreat is allowed | `RETREAT` | Break away to create distance |
| `CHASE` | Player reaches attack range and cooldown is ready | `ATTACK` | Start melee windup or spit windup |
| `CHASE` | Zombie is low health and retreat is allowed | `RETREAT` | Kite away from the player |
| `CHASE` | Player leaves the extended notice range for long enough | `WANDER` | Resume ambient roaming |
| `ATTACK` | Attack completes and retreat flag is active | `RETREAT` | Back off after the strike |
| `ATTACK` | Attack completes and player is still relevant | `CHASE` | Re-engage and pursue again |
| `ATTACK` | Attack completes and player is effectively lost | `WANDER` | Drop back to roaming |
| `RETREAT` | Retreat timer ends and player is still in attack range | `ATTACK` | Counterattack immediately |
| `RETREAT` | Retreat timer ends and player is still nearby | `CHASE` | Push back into pursuit |
| `RETREAT` | Retreat timer ends and player is far away | `WANDER` | Resume roaming |
| `ANY` | `health <= 0` | `DEAD` | Spawn blood burst, fade corpse, award score |
