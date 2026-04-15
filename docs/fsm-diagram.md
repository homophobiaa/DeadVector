# DeadVector FSM Diagram

![DeadVector FSM](./fsm-diagram.svg)

## Mermaid Source

```mermaid
stateDiagram-v2
    [*] --> SPAWN

    SPAWN --> CHASE : spawnTimer ≤ 0 AND player in noticeRange
    SPAWN --> WANDER : spawnTimer ≤ 0

    WANDER --> CHASE : player enters noticeRange
    WANDER --> RETREAT : low health AND retreatCooldown ready

    CHASE --> ATTACK : player in attackRange AND cooldown ready
    CHASE --> RETREAT : low health AND retreatCooldown ready
    CHASE --> WANDER : player beyond 2.2× noticeRange for > 1.3 s (non-boss)

    ATTACK --> RETREAT : attack done AND retreatTimer > 0
    ATTACK --> CHASE : attack done AND player in 1.8× noticeRange
    ATTACK --> WANDER : attack done (fallback)

    RETREAT --> ATTACK : retreatTimer ends AND player in attackRange AND cooldown ready
    RETREAT --> CHASE : retreatTimer ends AND player in noticeRange
    RETREAT --> WANDER : retreatTimer ends (fallback)

    SPAWN --> DEAD : health ≤ 0 (any-transition)
    WANDER --> DEAD : health ≤ 0 (any-transition)
    CHASE --> DEAD : health ≤ 0 (any-transition)
    ATTACK --> DEAD : health ≤ 0 (any-transition)
    RETREAT --> DEAD : health ≤ 0 (any-transition)

    DEAD --> [*]
```

## State Notes
- `SPAWN`: short entry telegraph when a zombie arrives, with a pulsing ring.
- `WANDER`: idle roaming state that picks a random arena target.
- `CHASE`: direct pursuit or ranged repositioning around the player. Sprinters show speed streaks.
- `ATTACK`: windup telegraph (red ring) plus melee strike or ranged projectile.
- `RETREAT`: low-health disengage state with a dashed ring visual.
- `DEAD`: death burst, blood decal, health pickup chance, and corpse fade-out.

## Shared Rule
- Any zombie can transition to `DEAD` when health reaches zero.

## Enemy Variants
| Type | Role | Key Trait |
| --- | --- | --- |
| Shambler | Melee tank | Wobbling arms, slow but steady |
| Sprinter | Fast rusher | Speed streaks, low HP |
| Spitter | Ranged acid | Bloated body, acid drip projectiles |
| Brute | Heavy tank | Armored plates, high damage |
| Screamer | Support caster | Aura buffs nearby allies, ranged purple orbs |
