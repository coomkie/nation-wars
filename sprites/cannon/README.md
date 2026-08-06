# Cannon (`cannon`)

Long-range splash artillery.

## Sprites

```text
sprites/cannon/Idle/animations/
  Running|Attack|Dead/{east,west}/frame_XXX.png

sprites/projectiles/cannon_ball.png        # round — no flip
sprites/cannon_explosion/frame_XXX.png     # impact VFX (catalog effect)
```

On attack: ball flies to target → `cannon_explosion` VFX + SFX on impact. Splash damage from UnitType `isSplash` / `splashRadius` / `aoeDamage`.

## SFX

| File | Path |
| --- | --- |
| `cannon_spawn.mp3` | `battle-overlay/public/audio/sfx/units/` |
| `cannon_attack.mp3` | `battle-overlay/public/audio/sfx/units/` |
| `cannon_die.mp3` | `battle-overlay/public/audio/sfx/units/` (optional) |
| **`cannon_explosion.mp3`** | **`battle-overlay/public/audio/sfx/effects/`** |
