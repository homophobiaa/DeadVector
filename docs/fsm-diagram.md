# DeadVector FSM Diagram

![DeadVector FSM](./fsm-diagram.svg)

## State Notes
- `SPAWN`: short entry telegraph when a zombie arrives.
- `WANDER`: idle roaming state that picks a random arena target.
- `CHASE`: direct pursuit or ranged repositioning around the player.
- `ATTACK`: windup plus melee strike or acid projectile.
- `RETREAT`: low-health disengage state that creates temporary distance.
- `DEAD`: death burst, blood decal, and corpse fade-out.

## Shared Rule
- Any zombie can transition to `DEAD` when health reaches zero.
