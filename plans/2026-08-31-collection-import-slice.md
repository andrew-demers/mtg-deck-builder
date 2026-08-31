# Plan: Collection import + MTGJSON matching + categorized browse UI

Date: 2026-08-31
Status: IN PROGRESS

## Problem

Players who track MTG collections digitally still cross-reference them manually to figure out what they own. This is the first vertical slice of the MTG Commander Deckbuilder (see PRD, 2026-08-24): get a user from a raw ManaBox CSV export to a browsable, filterable, MTGJSON-enriched view of their collection, with a place to resolve rows that can't be auto-matched. Commander suggestion, deck construction, critique, and card-suggestion features (all LLM-driven) are explicitly deferred to a follow-up plan.

## Decisions locked in with the user

- **Stack:** Next.js (App Router) + TypeScript + Postgres, single deployable.
- **Scope:** vertical slice only - import, card-catalog matching, categorized/filterable browse. No commander suggestion, deck build, critique, or card suggestions yet.
- **LLM provider:** out of scope for this slice (no LLM calls needed for import/browse). Future slice should keep the LLM call behind a small provider interface so both Anthropic and a local Ollama model can be plugged in - noted here so the next plan doesn't relitigate it, not built now.
- **Card rules data source: MTGJSON, not Scryfall.** `api.scryfall.com` and `data.scryfall.io` are both blocked outbound by the org's Zscaler policy (confirmed: 403 from Zscaler itself, not a DNS/TLS issue - `registry.npmjs.org` and `github.com` pass through fine, so this is a deliberate block on Scryfall's domains specifically). `mtgjson.com` is reachable. MTGJSON publishes `AtomicCards.json` (~35k unique card names, deduplicated across printings, ~25MB `.xz` / ~160MB uncompressed) with everything this slice needs: `manaCost`, `manaValue`, `colors`, `colorIdentity`, `type` (full type line), `types`/`supertypes`/`subtypes`, `text` (oracle text, absent on vanilla cards), `legalities`, `identifiers.scryfallOracleId`. This changes the matching architecture from "live per-import API lookups" to "bulk-sync the canonical card catalog into our own `Card` table once (`npm run sync-cards`), then match ManaBox rows against that local table by exact card name" - which is actually the pattern Scryfall's own docs recommend for bulk operations anyway. Verified against a real fetch of the file: confirmed field names, and confirmed a real non-legendary commander-granting card (`Clear, the Mind`: "Spell commander (This card can be your commander...)") for the eligibility fixture.

## Decisions made during planning (not explicitly asked, using sensible defaults)

- **ORM:** Prisma - standard pairing with Next.js + Postgres, migrations are simple to review.
- **Auth:** Auth.js (NextAuth v5) Credentials provider, JWT session strategy, bcryptjs password hashing. Minimal signup/login only - no email verification, password reset, or OAuth. Needed now because collections are per-account data (PRD constraint: multi-device accounts require backend+DB from day one), but kept deliberately thin since auth itself isn't one of the three named features in this slice.
- **Local Postgres:** `docker-compose.yml` for local dev.
- **CSV parsing:** `csv-parse` (sync API), header-name-based column mapping (not positional), since ManaBox's export schema can shift and the PRD flags this as unverified. Confirmed current export columns via research: `Name, Set Code, Set Name, Collector Number, Foil, Rarity, Quantity, ManaBox ID, Scryfall ID, Purchase Price, Misprint, Altered, Condition, Language, Purchase Price Currency`. Required column for matching: `Name` (exact, case-insensitive, against the local `Card` catalog - see below). `Set Code`/`Scryfall ID` are stored on the `CollectionEntry` as provenance only, not used for matching (MTGJSON's `AtomicCards` is deduplicated by name across printings, and its `scryfallOracleId` is a different ID space than the per-printing Scryfall ID ManaBox exports, so they aren't cross-referenceable anyway). `Quantity`, `Foil` required.
- **Card catalog sync:** a standalone script (`scripts/sync-cards.ts`, run via `npm run sync-cards`) downloads `https://mtgjson.com/api/v5/AtomicCards.json.xz`, decompresses, and upserts all ~35k cards into the local `Card` table, computing `isCommanderEligible` per card on the way in. This is a one-time (or periodically re-run) setup step, documented in the README, independent of any single user's import. CSV import then matches against this local table - no runtime network call per import.
- **Manual resolution:** unmatched rows are resolved by searching the local `Card` table (`ILIKE` substring match on name, ranked by name length) and picking a result, or marking the row ignored. No external fuzzy-search API involved.
- **Card cache:** the `Card` table is keyed by `name` (unique) and holds the full MTGJSON-derived rules data, refreshed by re-running the sync script.
- **Test runner:** Vitest + React Testing Library for units/components; no e2e in this slice.
- **Package manager:** npm (no assumption of a globally-installed alternative).

## Scope

**In scope:**
- Project scaffold: Next.js + TypeScript + Tailwind, Prisma + Postgres (via Docker Compose), env config, lint/test wiring.
- Minimal account system (signup, login, session) so collections are scoped per user.
- ManaBox CSV upload and parsing into a normalized import (name, set, quantity, foil).
- A local card catalog synced from MTGJSON (mana cost, color identity, type, oracle text, legalities) that imported rows are matched against.
- Surfacing unmatched/ambiguous rows in a resolution queue, with a search-and-pick UI to resolve them.
- A categorized, filterable/sortable collection browse view: filter by mana value, color identity, card type, and commander eligibility.
- Deterministic commander-eligibility logic (legendary creature, or oracle text grants "can be your commander"), unit tested.

**Out of scope (deferred to a later plan):**
- Decklist import (plain text) as a separate pool from the collection.
- LLM-assisted commander suggestion, deck construction, legality engine for a full 100-card deck, deck critique, card suggestions, wishlist mode.
- Partner/Background commander pairings.
- OAuth login, email verification, password reset.
- Any LLM provider integration (Anthropic/Ollama).

## Success criteria

1. `npm run build` succeeds and `npm test` passes with no failing tests.
2. A user can sign up and log in; collection data is scoped to their account.
3. Uploading a well-formed ManaBox CSV produces an import summary showing counts of matched vs. unmatched rows, and matched cards appear in the collection view enriched with MTGJSON data (mana cost, colors, type line, legalities).
4. Uploading a CSV with a row that doesn't match any card in the synced local catalog surfaces that row in a resolution queue instead of silently dropping it; searching and picking a card there resolves it into the collection.
5. The collection view can be filtered by mana value, color identity, and card type simultaneously, and by commander eligibility; results update to match the filter combination.
6. A unit test proves commander eligibility is true for a legendary creature, true for a non-legendary card with explicit "can be your commander" text, and false for a vanilla non-legendary creature.

## Context to load

Greenfield repo - nothing exists yet (`git log` is empty, working tree is empty aside from `.git`). No `CLAUDE.md` to read. Task groups below should each read the outputs of their prerequisite groups (e.g. the Prisma schema, the MTGJSON parser) before writing code that depends on them, rather than assuming shapes.

## Tasks

### Group A - Project scaffold & infra  [no dependencies, runs first, solo]
- [ ] Task 1: Scaffold Next.js app (`create-next-app`, TypeScript, App Router, Tailwind, ESLint) at repo root; add Vitest + React Testing Library config (`vitest.config.ts`, `package.json` test script).
  verify: `npm run build` and `npm test` both run (test suite may be empty but must exit 0).
- [ ] Task 2: Add `docker-compose.yml` for local Postgres, `prisma/schema.prisma` with `datasource` config, `.env.example` with `DATABASE_URL`, `NEXTAUTH_SECRET`. Add `User` model only for now.
  verify: `docker compose up -d db && npx prisma migrate dev --name init` runs clean against the local container.
- [ ] Task 3: Add root `README.md` with setup steps (env vars, docker compose, migrate, dev server) and confirm `npm run dev` boots on `localhost:3000`.
  verify: `curl -sf localhost:3000 > /dev/null` while dev server is running.

### Group B - Auth  [depends on A] [parallel with C]
- [ ] Task 4: Add `User` password field + Auth.js config (`src/lib/auth.ts` or `auth.config.ts`) with Credentials provider, JWT session, bcryptjs hashing. Add `app/api/auth/[...nextauth]/route.ts`.
  verify: unit test hitting the credentials `authorize` callback with a seeded bcrypt hash returns a session-shaped user for correct password, `null` for wrong password.
- [ ] Task 5: Add signup page (`app/signup/page.tsx`) + API route creating a `User` with a hashed password, and login page (`app/login/page.tsx`) using Auth.js `signIn`.
  verify: `npm test` covers the signup API route (rejects duplicate email, rejects short password, creates user on valid input); manual check - `npm run dev`, sign up a test account, log in.
- [ ] Task 6: Add auth middleware/session check protecting `/collection/*` routes, redirecting unauthenticated users to `/login`.
  verify: hitting `/collection` with no session redirects to `/login` (integration test or manual curl following redirects).

### Group C - MTGJSON card catalog  [depends on A] [parallel with B]
- [ ] Task 7: Add `Card` Prisma model (`name` unique, `manaCost` nullable string, `manaValue` float, `colors` string[], `colorIdentity` string[], `type` string, `types`/`supertypes`/`subtypes` string[], `oracleText` nullable string, `legalities` Json, `scryfallOracleId` nullable string, `isCommanderEligible` boolean) + migration.
  verify: `npx prisma migrate dev --name add-card` applies clean.
- [ ] Task 8: Add `src/lib/commander-eligibility.ts`: pure function `isCommanderEligible({ type, text }): boolean` - true if `type` contains "Legendary Creature", or `text` matches `/can be your commander/i`.
  verify: `npm test -- commander-eligibility` passes for: legendary creature (true, use `Atraxa, Praetors' Voice` shape), non-legendary card with explicit commander-granting text (true, use `Clear, the Mind`'s real text: "Spell commander (This card can be your commander. ...)"), vanilla non-legendary creature (false, e.g. `Grizzly Bears`).
- [ ] Task 9: Add `src/lib/mtgjson.ts`: `parseAtomicCards(jsonText)` parsing MTGJSON's `AtomicCards.json` shape (`{ data: { [name]: AtomicCardFace[] } }`, one face per name for this slice's purposes) into a flat `{ name, manaCost, manaValue, colors, colorIdentity, type, types, supertypes, subtypes, oracleText, legalities, scryfallOracleId }[]`. Add a small fixture file `src/lib/__fixtures__/atomic-cards-sample.json` with the three cards from Task 8 plus one split card (e.g. `Fire // Ice`) for shape coverage.
  verify: `npm test -- mtgjson` passes against the fixture.
- [ ] Task 10: Add `src/lib/card-sync.ts`: `syncCards(cards)` upserting parsed cards into the `Card` model by `name`, computing `isCommanderEligible` via Task 8's function on the way in. Add `scripts/sync-cards.ts` (run via `npm run sync-cards`) that fetches `https://mtgjson.com/api/v5/AtomicCards.json.xz`, decompresses it (`xz -d` or a JS xz decoder), parses via Task 9, and calls `syncCards`.
  verify: `npm test -- card-sync` passes, confirms an upsert on an existing `name` updates fields rather than duplicating rows.

### Group D - CSV import pipeline  [depends on A, C]
- [ ] Task 11: Add `CollectionEntry` (userId, cardId, quantity, foil, setCode nullable, sourceScryfallId nullable - provenance only) and `UnmatchedImportRow` (userId, rawName, rawSet, quantity, foil, status: pending/resolved/ignored) Prisma models + migration.
  verify: `npx prisma migrate dev --name add-collection-import` applies clean.
- [ ] Task 12: Add `src/lib/manabox-csv.ts`: header-name-based parser using `csv-parse`, normalizing rows to `{ name, setCode, scryfallId?, quantity, foil }`, tolerant of the columns confirmed above, rejecting a file missing `Name`.
  verify: `npm test -- manabox-csv` passes against fixture CSVs in `src/lib/__fixtures__/` (well-formed row, missing-set row, malformed quantity row).
- [ ] Task 13: Add `app/api/collection/import/route.ts`: accepts uploaded CSV, parses via Task 12, looks up each row's `name` (case-insensitive) against the local `Card` table synced by Group C, upserts matches into `CollectionEntry`, writes non-matches into `UnmatchedImportRow`, returns `{ matched, unmatched }` counts.
  verify: `npm test -- collection/import` passes against a seeded test `Card` table, asserting matched rows land in `CollectionEntry` and unmatched rows land in `UnmatchedImportRow`.
- [ ] Task 14: Add `app/import/page.tsx`: file upload form posting to Task 13's route, showing the matched/unmatched summary on success.
  verify: manual - `npm run dev`, upload a fixture CSV, see the summary counts render.

### Group E - Manual resolution UI  [depends on B, D] [parallel with F]
- [ ] Task 15: Add `app/api/collection/unmatched/route.ts` (GET, lists pending `UnmatchedImportRow`s for the session user) and `app/api/collection/unmatched/[id]/resolve/route.ts` (POST, accepts either a chosen `cardId` or `ignore`, and on resolve upserts the `CollectionEntry` and marks the row `resolved`).
  verify: `npm test -- unmatched` passes covering resolve-with-match and resolve-as-ignore paths.
- [ ] Task 16: Add `app/api/cards/search/route.ts` (GET, `?q=`, `ILIKE '%q%'` against the local `Card` table, ranked by name length, capped at 20 results) and `app/collection/unmatched/page.tsx`: lists pending rows, lets the user type a search against that route and pick a result to resolve.
  verify: manual - resolve one of the unmatched fixture rows from Task 12/13 through the UI and confirm it disappears from the queue and appears in `/collection`.

### Group F - Categorized browse UI  [depends on B, C, D] [parallel with E]
- [ ] Task 17: Add `app/api/collection/route.ts` (GET, session-scoped): returns the user's `CollectionEntry`s joined with `Card`, supporting query params for mana value range, color identity, card type substring, and `commanderEligible=true`.
  verify: `npm test -- collection/route` passes covering each filter independently and combined.
- [ ] Task 18: Add `app/collection/page.tsx`: table/grid of the user's collection with filter controls (mana value, color identity, type, commander-eligible toggle) and sort (name, mana value) wired to Task 17's route.
  verify: manual - `npm run dev`, log in, import a fixture CSV, apply each filter and confirm the visible set changes correctly.

## Self-review

- File paths are explicit; Prisma model names and API route paths are stated so downstream groups (D, E, F) know exactly what to import.
- B and C both depend only on A and touch disjoint files, so they run in parallel; E and F both depend on D but touch disjoint routes/pages, so they also run in parallel.
- Verify steps are concrete commands or specific manual checks, not "confirm it works."
- ManaBox's exact export schema was researched (not guessed) but not confirmed against a live export file - Task 12's fixtures encode the columns found during planning; flag to the user if a real export deviates.
