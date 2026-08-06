# Bomb Carrier (`bomb_carrior`)

Folder name keeps the disk typo **`bomb_carrior`** — use that as DB `spriteKey` and SFX names.

## Sprites

```text
sprites/bomb_carrior/Idle/animations/
  Running/{east,west}/frame_XXX.png
  Attack/{east,west}/frame_XXX.png
  Dead/{east,west}/frame_XXX.png

sprites/bomb_carrior_explosion/   # flat VFX (catalog effects)
  frame_000.png … frame_015.png
```

On death: Dead plays first, then after ~0.75s server applies AoE damage and overlay plays `bomb_carrior_explosion` VFX + SFX together.

## SFX

| File | Path |
| --- | --- |
| `bomb_carrior_spawn.mp3` | `battle-overlay/public/audio/sfx/units/` |
| `bomb_carrior_attack.mp3` | `battle-overlay/public/audio/sfx/units/` |
| `bomb_carrior_die.mp3` | `battle-overlay/public/audio/sfx/units/` (optional) |
| **`bomb_carrior_explosion.mp3`** | **`battle-overlay/public/audio/sfx/effects/`** |

Explosion is an **effect**, not a unit clip — put it under `sfx/effects/`, not `sfx/units/`.
