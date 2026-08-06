# Sprites — asset convention

Folder `sprites/` holds per-frame PNGs for units, castle, and optional battlefield art.
Runtime: Nest serves `sprites/` at `/sprites` and exposes `GET /sprites/catalog`.
Battle overlay plays Idle / Running / Attack / Dead (units) and Crash / Damaging (castle).

Battlefield background for OBS is uploaded via Admin → Match Setup (`/uploads/battlefield/`).

## Current status (on-disk)

| Asset group | Folder | Notes |
| --- | --- | --- |
| Infantry | `infantry/` | Present |
| Cavalry | `calvary/` | Typo folder name; catalog aliases → `cavalry` |
| Archer | `archer/` | Present |
| Mage | `mage/` | Present |
| Bull | `bull/` | Present |
| Berserker | `berserker/` | Present |
| Titan | `titan/` | Present |
| Knight | `knight/` | Present |
| Castle | `castle/` | Present (`East`/`West` casing OK) |
| Battlefield | optional draft | Runtime via Admin upload |

## Directory tree

```text
sprites/
  infantry|calvary|archer|mage|bull|berserker|titan|knight/
    Idle/
      rotations/
        east.png | north.png | south.png | west.png   # stills OK
      animations/
        Running/{south,north,east,west}/frame_XXX.png
        Attack/{east,west}/frame_XXX.png
        Dead/{east,west}/frame_XXX.png
  castle/
    Idle/
      rotations/East.png | West.png
      animations/
        Crash/{East,West}/frame_XXX.png
        Damaging/{East,West}/frame_XXX.png
```

## Rules

- DB `spriteKey` usually matches folder name; `cavalry` maps to folder `calvary`.
- New unit folders are auto-discovered by the catalog (no code change needed).
- Directions case-insensitive.
- Frames: `frame_000.png` … (any count).
- Unit east/west sheets: no horizontal flip in overlay (use matching dir).
- State map: advancing→Running, engaging/attacking_base→Attack, death→Dead, idle→rotations.
- Mage AoE: `mage_explosion/` flat `frame_*.png` plays at target when Attack anim reaches ~50% (no projectile).
- Rebuild catalog after adding files: `POST /sprites/rebuild` (admin) or restart backend.
