# Projectile sprites

Single-frame PNGs for ranged unit shots. Catalog key = filename without extension.

```text
sprites/projectiles/
  archer_arrow.png       # faces EAST — overlay flips when flying west
  crossbower_arrow.png   # faces EAST — overlay flips when flying west
  cannon_ball.png        # round — no flip
```

Restart backend or `POST /sprites/rebuild` after adding files.

## Archer / Crossbower arrows

- Put files as `archer_arrow.png` / `crossbower_arrow.png` (art facing **east** / right).
- Overlay sets `scale.x = -1` when the shot flies west (team B).
- Slight rotation follows vertical aim.

## Cannon ball

- Put file here as `cannon_ball.png`.
- No flip / no aim rotation (sphere).
- Impact VFX: `sprites/cannon_explosion/frame_*.png` + SFX `sfx/effects/cannon_explosion.mp3`.
