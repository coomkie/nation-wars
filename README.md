# Nation Wars Live

Realtime OBS overlay game for TikTok LIVE: gifts spawn units for competing nations, push a battle frontline, and feed a tournament bracket.

## Structure

| Path | Role | Dev URL |
|------|------|---------|
| `backend/` | NestJS API + Socket.IO + TikTok listener + SQLite | http://localhost:3000 |
| `battle-overlay/` | PixiJS OBS Browser Source | http://localhost:5173 |
| `bracket-overlay/` | D3 bracket tree (OBS scene) | http://localhost:5174 |
| `admin-ui/` | Plain HTML/TS admin panel | http://localhost:5175 |

## Prerequisites

- Node.js 20+
- Euler Stream API key ([eulerstream.com](https://www.eulerstream.com)) for live TikTok gifts
- OBS Studio (for overlays)

SQLite is file-based — **no database server and no paid plan required**.

## Setup

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env: ADMIN_PASSWORD, SIGN_API_KEY, TIKTOK_USERNAME (optional)
npm install
npm run start:dev

# Frontends (separate terminals)
cd battle-overlay && npm install && npm run dev
cd bracket-overlay && npm install && npm run dev
cd admin-ui && npm install && npm run dev
```

### `.env` keys

```
TIKTOK_USERNAME=          # optional at boot; can connect from Admin → TikTok
SIGN_API_KEY=             # Euler Stream API key
ADMIN_PASSWORD=changeme
DATABASE_PATH=./nation-wars.sqlite
DEFAULT_MATCH_DURATION_MINUTES=15
PORT=3000
```

## OBS

1. Add **Browser Source** → URL `http://localhost:5173` → Width `1920` Height `1080` → check **Transparent background**.
2. Optional second scene: `http://localhost:5174` for the bracket.

## Combat MVP (auto-battler)

- Units march toward the enemy base, engage 1v1, and damage the enemy HQ.
- Win by destroying the enemy base, or by higher remaining base HP when the timer ends.
- Frontline bar tracks base HP ratio (not gift score). Gift score still tracks for stats/tiebreakers.
- Admin → **Unit Types**: CRUD stats + sprite URL slots (tier 1–3) for future assets/animations.
- Match setup requires **default unit type** + **base max HP**; optional gift→unitType JSON.
- Mock gift can force nation + unit type; Random gift picks a random type.


1. Open http://localhost:5175 — set admin password (default `changeme`).
2. **Nations** — create at least 2 nations (name + flag file or URL).
3. **Bracket** — select nations → Create bracket (handles byes for non-power-of-2).
4. **Match** — pick Nation A/B, set **Default nation** for unmapped gifts, optional `bracketNodeId` from bracket JSON, Start match.
5. Send **Mock gift** (pick Nation A or B) to verify scoring/units without going live, or connect TikTok under **TikTok**.
6. Watch battle overlay update; when the timer ends (or End match), winner advances in the bracket.
7. After an **intermission** (default 20s, set on match start / `.env` `DEFAULT_INTERMISSION_SECONDS`), the next ready bracket pair starts automatically (outer rounds first, then inward). Final champion shows **CHAMPION** on the overlay.

### Gift mapping

- Optional `giftMappings` JSON on match start.
- Any gift ID not in the list credits `defaultNationId`.
- Empty mappings → all gifts go to the default nation.
- Mock gifts can force a nation via the Nation select (overrides mapping).

### Tiebreaker

If scores are equal at match end, the nation that **first reached that score** wins (`scoreReachedAt`). A 0–0 draw produces no winner / no bracket advance.

### Mid-tournament nations

Not allowed. Archive the active bracket, then create a new one that includes new nations.

## API cheat sheet

- `GET /nations` · `POST /nations` (admin + multipart `flag`)
- `POST /brackets` `{ nationIds }` (admin)
- `GET /brackets/active` · `GET /brackets/latest`
- `POST /matches` (admin) — includes `intermissionSeconds`
- `POST /matches/next` (admin) — start next playable bracket match now
- `POST /matches/mock-gift` (admin) — optional `nationId` to force side
- `PATCH /matches/settings` `{ intermissionSeconds, durationMinutes }`
- `POST /tiktok/connect` `{ username }` (admin)

Admin auth: header `x-admin-password: <password>` or HTTP Basic.

Socket.IO namespaces: `/battle`, `/bracket`. Extra battle events: `match:intermission`, `tournament:complete`.
