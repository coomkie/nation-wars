# Molting Cicada — sprite layout (3 phases)

Drop PNGs here. Catalog auto-scans; restart backend or `POST /sprites/rebuild`.

## Phases ↔ folders ↔ Admin

| Phase | When | Folder (`spriteKey`) | UnitType in Admin list? |
| --- | --- | --- | --- |
| **1** Form 1 | Spawn → fight | `cicada` | **Cicada** (spawnable, Can molt) |
| **2** Cocoon | After first lethal hit | `cicada_cocoon` | **No** — only `cocoonSpriteKey` on Cicada |
| **3** Form 2 | After cocoon timer | `cicada_form2` | **Cicada Form 2** (target of molt; usually not gift-mapped) |

So the unit list shows **2** types, not 3. Phase 2 is a sprite sheet / SFX only.

## Playback order (runtime)

```text
Phase1 Running/Attack (+ cicada_spawn / cicada_attack SFX)
  → lethal hit
  → play cicada / Cocooning (one-shot) + cicada_cocoon_spawn
  → swap to cicada_cocoon, loop Dead (or Idle still)
  → timer ends + still alive
  → play cicada_cocoon / Revive (one-shot) + cicada_form2_spawn
  → swap to cicada_form2 Running/Attack/Dead (+ cicada_form2_attack)
```

If Cocooning / Revive missing → falls back to Idle.

## SFX (`battle-overlay/public/audio/sfx/units/`)

| File | When |
| --- | --- |
| `cicada_spawn.mp3` | Form 1 gift spawn |
| `cicada_attack.mp3` | Form 1 attack |
| `cicada_cocoon_spawn.mp3` | Enter cocoon (phase 2) |
| `cicada_form2_spawn.mp3` | Emerge as form 2 |
| `cicada_form2_attack.mp3` | Form 2 attack |

Names must match `spriteKey` + `_spawn` / `_attack` (folder `cicada_form2` → `cicada_form2_*.mp3`).

## Tree (put `frame_000.png` … in each dir)

```text
sprites/
  cicada/                          # Phase 1
    Idle/
      rotations/
        east.png
        west.png
      animations/
        Running/{east,west}/frame_XXX.png
        Attack/{east,west}/frame_XXX.png
        Cocooning/{east,west}/frame_XXX.png   ← enter shell

  cicada_cocoon/                   # Phase 2
    Idle/
      rotations/
        east.png                   ← static shell still
        west.png
      animations/
        Dead/{east,west}/frame_XXX.png      ← hold while cocooning
        Revive/{east,west}/frame_XXX.png    ← emerge before form 2

  cicada_form2/                    # Phase 3
    Idle/
      rotations/
        east.png
        west.png
      animations/
        Running/{east,west}/frame_XXX.png
        Attack/{east,west}/frame_XXX.png
        Dead/{east,west}/frame_XXX.png
```

## Naming rules

- Prefer `east` + `west` (same as other units).
- Frames: `frame_000.png`, `frame_001.png`, …
- Folder names must match Admin `spriteKey` / `cocoonSpriteKey` exactly.
- Optional SFX: `battle-overlay/public/audio/sfx/units/cicada_attack.mp3`, `cicada_form2_attack.mp3`, …
