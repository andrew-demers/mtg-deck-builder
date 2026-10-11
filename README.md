## MTG Commander Deckbuilder

Web app that ingests a ManaBox collection export, enriches it against a local MTG card catalog, and (in later slices) helps build and refine a Commander deck from cards you own.

This is the first vertical slice: account signup/login, ManaBox CSV import, card-catalog matching, a manual-resolution queue for unmatched rows, and a filterable collection browse view. See `plans/2026-08-31-collection-import-slice.md` for scope and rationale, including why card rules data comes from [MTGJSON](https://mtgjson.com) rather than Scryfall (Scryfall's API/bulk-data domains are blocked by this org's network policy).

### Setup

1. Copy `.env.example` to `.env` and fill in `NEXTAUTH_SECRET` (any random 32+ byte string).
2. Start local Postgres:
   ```bash
   docker compose -f docker-compose.dev.yml up -d db
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

### Deploying (Docker / Unraid)

Deployment mirrors [auto-tracker](https://github.com/andrew-demers/auto-tracker): `.github/workflows/docker-publish.yml` builds an image and pushes it to GitHub Container Registry (`ghcr.io/andrew-demers/mtg-deck-builder`) on every push to `main`, and `docker-compose.yml` pulls it alongside a Postgres container. On the NAS you only need the compose file and a `.env`.

1. **Make the image pullable.** The GHCR package is private by default. After the first publish, go to the repo's **Packages** > `mtg-deck-builder` > **Package settings** > change visibility to public (or run `docker login ghcr.io` on the NAS).
2. **Put the compose file and env on the NAS** (SSH in):
   ```bash
   mkdir -p /mnt/user/appdata/mtg-deck-builder && cd /mnt/user/appdata/mtg-deck-builder
   curl -O https://raw.githubusercontent.com/andrew-demers/mtg-deck-builder/main/docker-compose.yml
   curl -o .env https://raw.githubusercontent.com/andrew-demers/mtg-deck-builder/main/.env.example
   nano .env
   ```
   Set `POSTGRES_PASSWORD`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL` (the exact address you browse to, e.g. `http://tower.local:3000`), and `ANTHROPIC_API_KEY` (or `LLM_PROVIDER=ollama`). Change `APP_PORT` if 3000 is taken.
3. **Start it:**
   ```bash
   docker compose up -d
   ```
   Migrations run automatically on every start. Check progress with `docker compose logs -f app`.
4. **Card catalog and prices.** The catalog (~35k cards, about 1.5 GB of RAM at peak) loads automatically in the background on first start - watch `docker compose logs -f app` for `[ensure-cards]`. Until it finishes, imports show cards as unmatched. If a load is ever interrupted, the next start finishes it. Set `AUTO_SYNC_CARDS=false` to disable. Re-run `docker compose exec app npm run sync-cards` when new sets release. Prices are fetched on demand:
   ```bash
   docker compose exec app npm run sync-prices
   ```
   Run it after importing your collection - it only prices cards that are in a collection or deck.
5. Open `NEXTAUTH_URL`, sign up, and import your ManaBox CSV.

**Unraid notes**
- Replace the `mtg-deck-builder-db` named volume in `docker-compose.yml` with a bind mount to `/mnt/user/appdata/mtg-deck-builder/db` (ideally on a cache pool) so Unraid backups can see it. If Postgres can't write to it, `chown 999:999` that folder.
- To put it behind a reverse proxy (Nginx Proxy Manager, SWAG), proxy to port 3000 and set `NEXTAUTH_URL` to the public URL.
- For auto-updates, install **Watchtower** from Community Applications with `WATCHTOWER_LABEL_ENABLE=true`; the app container already has the opt-in label.
- Backup: `docker compose exec db pg_dump -U mtg mtg_deck_builder > backup.sql`.

**Building locally instead** (before the first publish, or to test changes): in `docker-compose.yml`, comment out `image:` and uncomment `build: .`, then `docker compose up -d --build`. On a TLS-inspecting network (Zscaler), first drop your root CA in `certs/` - see `certs/README.md`.
