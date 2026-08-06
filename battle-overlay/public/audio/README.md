# Battle overlay audio

Drop `.mp3` files here (`.ogg` optional). Prefer **mp3** — that is what the loader tries first.

Missing files are skipped — overlay stays silent, no crash.

**Browser:** click the overlay once (“Click to enable audio”) — autoplay policy blocks sound until a gesture.

**OBS:** Browser Source → enable *Control audio via OBS*, then unmute the source.

## Where to put unit SFX (spawn / attack / die)

**Folder:** `battle-overlay/public/audio/sfx/units/`

**Naming** (must match DB `spriteKey`):

| File | When |
|------|------|
| `{spriteKey}_spawn.mp3` | Unit spawns |
| `{spriteKey}_attack.mp3` | Unit attacks |
| `{spriteKey}_die.mp3` | Unit dies |

Examples:

```text
battle-overlay/public/audio/sfx/units/
  infantry_spawn.mp3
  infantry_attack.mp3
  infantry_die.mp3
  archer_spawn.mp3
  archer_attack.mp3
  archer_die.mp3
  cavalry_spawn.mp3       # spriteKey is "cavalry" (folder sprites/calvary)
  cavalry_attack.mp3
  cavalry_die.mp3
  mage_spawn.mp3
  mage_attack.mp3
  mage_die.mp3
  bull_spawn.mp3
  bull_attack.mp3
  bull_die.mp3
  berserker_spawn.mp3
  berserker_attack.mp3
  berserker_die.mp3
  titan_spawn.mp3
  titan_attack.mp3
  titan_die.mp3
  knight_spawn.mp3
  knight_attack.mp3
  knight_die.mp3
```

Fallback if a unit file is missing:

1. Spawn → `sfx/unit_spawn.mp3`
2. Attack → `sfx/unit_attack_melee.mp3` or `sfx/unit_attack_ranged.mp3` → then `sfx/unit_attack.mp3`
3. Die → `sfx/unit_die.mp3`

## Full layout

```text
battle-overlay/public/audio/
  music/
    battle_start.mp3
    battle_loop.mp3
    victory.mp3
  sfx/
    unit_spawn.mp3
    unit_attack.mp3
    unit_attack_melee.mp3
    unit_attack_ranged.mp3
    unit_die.mp3
    base_attack.mp3        ← HQ shoots an enemy unit
    base_hit.mp3           ← HQ takes damage
    base_destroy.mp3
    units/                 ← per-unit spawn/attack/die (put your files HERE)
      {spriteKey}_spawn.mp3
      {spriteKey}_attack.mp3
      {spriteKey}_die.mp3
```

Vite serves this as `/audio/...` (e.g. `/audio/sfx/units/knight_spawn.mp3`).

## Tips

- Keep SFX short (≤1s).
- Default volumes: music 0.35 / sfx 0.7.
- OBS: enable **Control audio via OBS** on the Browser Source if needed.
- `.ogg` also works if you prefer; both extensions are tried.
