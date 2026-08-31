## MTG Commander Deckbuilder

Web app that ingests a ManaBox collection export, enriches it against Scryfall, and (in later slices) helps build and refine a Commander deck from cards you own.

This is the first vertical slice: account signup/login, ManaBox CSV import, Scryfall matching, a manual-resolution queue for unmatched rows, and a filterable collection browse view. See `plans/2026-08-31-collection-import-slice.md` for scope and rationale.

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
4. Run the dev server:
   ```bash
   npm run dev
   ```
   App runs at http://localhost:3000.

### Testing

```bash
npm test        # vitest
npm run build   # production build / type-check
```
