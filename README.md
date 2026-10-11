## MTG Commander Deckbuilder

Web app that ingests a ManaBox collection export, enriches it against a local MTG card catalog, and (in later slices) helps build and refine a Commander deck from cards you own.

This is the first vertical slice: account signup/login, ManaBox CSV import, card-catalog matching, a manual-resolution queue for unmatched rows, and a filterable collection browse view. See `plans/2026-08-31-collection-import-slice.md` for scope and rationale, including why card rules data comes from [MTGJSON](https://mtgjson.com) rather than Scryfall (Scryfall's API/bulk-data domains are blocked by this org's network policy).

### Setup

1. Copy `.env.example` to `.env` and fill in `NEXTAUTH_SECRET` (any random 32+ byte string).
2. Start local Postgres:
   ```bash
   docker compose up -d db
   ```
3. Install dependencies and apply migrations:
   ```bash
   npm install
   npx prisma migrate dev
   ```
4. Sync the local card catalog from MTGJSON (one-time; re-run periodically to pick up new sets). Requires the `xz` CLI on `PATH` (`brew install xz` on macOS):
   ```bash
   npm run sync-cards
   ```
5. Run the dev server:
   ```bash
   npm run dev
   ```
   App runs at http://localhost:3000.

### Testing

```bash
npm test        # vitest
npm run build   # production build / type-check
```

### Scryfall prices and lookups

Card rules data still comes from MTGJSON, but live data comes from the [Scryfall API](https://scryfall.com/docs/api):

- **Prices and images**: `POST /api/decks/[id]/prices` (the "Refresh prices" button on a deck page) stores USD / USD-foil prices and a card image URL on each `Card`. The deck page shows a per-card price and an estimated deck total. Prices are for Scryfall's default printing of each card.
- **Bulk refresh**: `npm run sync-prices` refreshes every card in a collection or deck (`-- --all` for the whole catalog, `-- --force` to ignore the 24h staleness check).
- **Lookup**: `GET /api/cards/lookup?name=sol rng` returns a fuzzy-matched card with oracle text, image, and prices; add `&autocomplete=1` for name suggestions.

Scryfall's domains are blocked on the Tricentis corporate network, so these return a 502 / "Could not reach Scryfall" there. They work from home networks and from the NAS.

### Deploying to Unraid

The stack (Next.js app + Postgres) is defined in `docker-compose.unraid.yml`.

1. Copy the repo to the NAS (e.g. `/mnt/user/appdata/mtg-deck-builder`), or `git clone` it there.
2. `cp .env.unraid.example .env` and fill in `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`), and `NEXTAUTH_URL` (the address you'll browse to, e.g. `http://tower.local:3000`).
3. Build and start (SSH, or the Docker Compose Manager plugin pointed at the compose file):
   ```bash
   docker compose -f docker-compose.unraid.yml up -d --build
   ```
   Migrations are applied automatically on every container start.
4. One-time card catalog load, then prices:
   ```bash
   docker compose -f docker-compose.unraid.yml exec app npm run sync-cards
   docker compose -f docker-compose.unraid.yml exec app npm run sync-prices
   ```
5. Open `http://<nas-address>:3000` and sign up.

Postgres data lives in the `db-data` Docker volume; back it up with `docker compose -f docker-compose.unraid.yml exec db pg_dump -U mtg mtg_deck_builder > backup.sql`. The app has no HTTPS of its own - put it behind Unraid's reverse proxy (Nginx Proxy Manager, SWAG) or keep it LAN-only.
