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

### Importing from ManaBox

In ManaBox, export your collection (all binders at once works) and upload the CSV on the **Import** page.

- Rows for the same card and finish (normal vs foil) are added together, even across different printings and binders.
- Token rows (set names ending in "Tokens") are skipped, since tokens aren't in the card catalog.
- Re-importing a file replaces the stored quantity for each card instead of adding to it, so you can re-export and re-import as your collection changes. Unmatched names are updated in place rather than duplicated.
- Tick **Replace my collection** to also remove owned cards that are no longer in the file (decks are not affected). It does nothing if the file matched no cards at all.

### Testing

```bash
npm test        # vitest
npm run build   # production build / type-check
```
