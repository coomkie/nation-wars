# Bell Ringer (`bell_ringer`)

Stationary support — rings a bell to stun nearby enemies. Max **1** active per nation.

## Sprites

```text
sprites/bell_ringer/Idle/animations/
  Running/{east,west,north,south}/frame_XXX.png
  Attack/{east,west}/frame_XXX.png   # bell ring (plays each aura pulse)
  Dead/{east,west}/frame_XXX.png
```

## Combat

| Field | Value |
| --- | --- |
| `stationary` | true (stays near spawn / own base) |
| `dealsDamage` | false |
| `maxActivePerNation` | 1 |
| `auraRadius` | 150 |
| `auraInterval` | 2.2s |
| `auraStunChance` | 1 (all enemies in radius) |
| `auraStunDuration` | 1.2s |
| `attackSpeed` | 0.55 (Attack anim length ≈ 1.8s; stun lands at anim end) |

Each pulse: overlay plays Attack + `bell_ringer_attack` SFX (last frame); stun applies when anim finishes.

## SFX (`battle-overlay/public/audio/sfx/units/`)

| File | When |
| --- | --- |
| `bell_ringer_spawn.mp3` | Gift spawn |
| `bell_ringer_attack.mp3` | Bell ring pulse |
| `bell_ringer_die.mp3` | Death (optional) |
