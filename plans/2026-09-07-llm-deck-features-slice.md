# Plan: LLM-driven Commander deck features (suggestion, construction, critique, card suggestions)
Date: 2026-09-07
Status: COMPLETED

## Problem

The prior slice (`plans/2026-08-31-collection-import-slice.md`, completed) gets a user from a raw ManaBox CSV to a browsable, MTGJSON-enriched collection. It deliberately stopped there: a user can see what they own but still has to manually figure out a commander, build a legal 100-card deck around it, judge whether the deck is any good, and find what else in their collection would improve it. This slice closes that gap: LLM-assisted commander suggestion, full deck construction from the user's owned cards under Commander singleton/color-identity rules, LLM deck critique, and LLM card suggestions - all scoped to cards the user actually owns.

There is no separate PRD file on disk for this (the PRD referenced in the prior plan, dated 2026-08-24, only existed in an earlier conversation and was never saved). This plan's scope is derived from that prior plan's "Out of scope (deferred to a later plan)" list and its "Decisions locked in with the user" note on the LLM provider abstraction.

## Decisions locked in with the user

- **Provider abstraction:** small `LlmProvider` interface behind which both Anthropic and a local Ollama model can be plugged in, selected via env config - per the explicit note left in the prior plan so this slice wouldn't relitigate it.
- **Scope boundary:** collection import, MTGJSON matching, and collection browse are done (prior slice). This slice only adds deck-related LLM features on top of the existing `Card`/`CollectionEntry` tables - it does not touch import or browse.

## Scope

**In scope:**
- Commander legality engine: singleton (one copy of any nonland card, unlimited basic lands), color-identity subset check (every card's `colorIdentity` must be a subset of the commander's), deck size (100 cards including commander) - pure functions, unit tested.
- `Deck` / `DeckCard` data model.
- LLM provider abstraction (`LlmProvider` interface) with an Anthropic implementation and a local Ollama implementation, selected by env var.
- Commander suggestion: given the user's commander-eligible owned cards, ask the LLM to suggest one; validate the suggestion against the user's actual eligible set (reject hallucinated names) before using it.
- Deck construction: given a chosen commander and the user's collection, ask the LLM to pick 99 more cards; run every pick through the legality engine and drop anything that fails (wrong color identity, duplicate nonland, not owned) rather than trusting the LLM's constraint-following; backfill with basic lands if the validated pick count falls short of 99.
- Deck critique: given a built deck, ask the LLM for a free-text review; store and display it.
- Card suggestions: given an existing deck, ask the LLM to suggest additions from the user's *remaining* owned cards (not already in the deck); filter suggestions to cards the user owns and that pass the legality engine before showing them.

**Out of scope (deferred to a later plan):**
- Decklist import (plain text) as a separate pool from the collection.
- Partner/Background commander pairings (this slice assumes a single commander per deck).
- Full banned-card-list enforcement (legality engine here covers singleton, color identity, and deck size only - not the official Commander banlist).
- OAuth login, email verification, password reset.
- Confirming ManaBox's real `Foil` column encoding against a live export - noted as an open risk in the prior plan's Outcome section; it's a collection-import data-quality question, unrelated to this slice's LLM features, and stays deferred.
- Editing/removing cards from a deck by hand (deck construction and card-suggestion-add are the only ways cards enter a deck in this slice); manual deck editing UI is future work.

## Success criteria

1. `npm run build` succeeds and `npm test` passes with no failing tests.
2. A unit test proves the legality engine rejects a duplicate nonland card, rejects a card whose color identity isn't a subset of the commander's, accepts unlimited copies of a basic land, and flags a deck short of 100 cards.
3. Calling the commander-suggestion endpoint for a user with commander-eligible cards in their collection returns one of those cards; a suggestion that doesn't match any owned eligible card is rejected rather than surfaced.
4. Building a deck around a chosen commander produces exactly 100 cards (commander + 99), all singleton except basic lands, all within the commander's color identity, and every non-basic-land card present in the user's `CollectionEntry` table.
5. Requesting a critique on a built deck returns and persists non-empty review text.
6. Requesting card suggestions for a deck returns only cards the user owns, not already in the deck, and within the commander's color identity.
7. The `LlmProvider` selection is driven by an env var (`LLM_PROVIDER=anthropic|ollama`) and unit tests exercise the provider-selection logic and each provider's request/response shape against a mocked HTTP layer - no real network calls in `npm test`.

## Context to load

Before starting, read:
- `prisma/schema.prisma` - existing `User`, `Card`, `CollectionEntry` models this slice's `Deck`/`DeckCard` models must relate to.
- `src/lib/commander-eligibility.ts` - existing pure-function style/testing pattern to match for the new legality engine.
- `src/app/api/collection/route.ts` - existing session-scoped, Prisma-query-then-JS-filter pattern (see `matchesColorSubset`) to reuse for color-identity checks here.
- `src/lib/collection-entry.ts` - existing read-then-write upsert pattern for per-user per-card rows; `DeckCard` writes should follow the same style.
- `src/auth.ts` - session shape (`session.user.id`) every new API route needs.
- `package.json` - confirm no LLM SDK is installed yet; current deps/test setup (Vitest, no network calls in tests today).

## Tasks

### Group A - Deck data model & legality engine  [no dependencies, parallel with B]
- [x] Task 1: Add `Deck` (`id`, `userId`, `name`, `commanderCardId` nullable FK to `Card`) and `DeckCard` (`deckId`, `cardId`, `quantity`, `isCommander` boolean) Prisma models + migration. `@@unique([deckId, cardId])` on `DeckCard`.
  verify: `npx prisma migrate dev --name add-deck` applies clean.
- [x] Task 2: Add `src/lib/commander-legality.ts`: `validateSingleton(cards: { cardId, quantity, isBasicLand }[])`, `validateColorIdentity(commanderColorIdentity: string[], cards: { colorIdentity: string[] }[])`, `validateDeckSize(cards: { quantity }[])` (must total 100), and a combined `validateDeck(input): { valid: boolean; errors: string[] }`. Determine "basic land" via `type.includes("Basic Land")` on the joined `Card`.
  verify: `npm test -- commander-legality` passes for: duplicate nonland rejected, unlimited basic lands accepted, color-identity superset card rejected, exactly-100 accepted, 99 rejected as short.
- [x] Task 3: Add `app/api/decks/route.ts` (GET lists the session user's decks; POST creates a `Deck` with a given `commanderCardId`, validating that card is commander-eligible and owned by the user) and `app/api/decks/[id]/route.ts` (GET returns the deck with `DeckCard`s joined to `Card`, 404/403 if not owned by the session user).
  verify: `npm test -- decks/route` passes covering create-with-eligible-owned-commander (success), create-with-non-eligible-card (rejected), and get-by-other-user (403/404).

### Group B - LLM provider abstraction  [no dependencies, parallel with A]
- [x] Task 4: Add `src/lib/llm/provider.ts` defining the `LlmProvider` interface (`complete(prompt: string): Promise<string>`) and `src/lib/llm/index.ts`: `getLlmProvider()` reading `process.env.LLM_PROVIDER` (`"anthropic"` default, `"ollama"` alternative) and returning the matching implementation.
  verify: `npm test -- llm/index` passes covering both env values and the default.
- [x] Task 5: Add `src/lib/llm/anthropic-provider.ts` using the `@anthropic-ai/sdk` package (`ANTHROPIC_API_KEY` env var) implementing `LlmProvider`.
  verify: `npm test -- anthropic-provider` passes against a mocked SDK client (request shape, response text extraction, non-2xx/error surfaced as a thrown error).
- [x] Task 6: Add `src/lib/llm/ollama-provider.ts` using `fetch` against `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL` env vars, POSTing to `/api/generate`. Add `@anthropic-ai/sdk` to `package.json` dependencies and all four new env vars to `.env.example`.
  verify: `npm test -- ollama-provider` passes against a mocked `fetch` (request body shape, response parsing, non-2xx surfaced as a thrown error).

### Group C - Commander suggestion  [depends on A, B, parallel with D]
- [x] Task 7: Add `src/lib/commander-suggestion.ts`: `suggestCommander(userId)` - loads the user's commander-eligible `CollectionEntry`s joined with `Card`, builds a prompt listing them by name, calls `getLlmProvider().complete(...)`, matches the returned text against the eligible-name set (exact, case-insensitive), and throws/returns an error result if the LLM's answer doesn't match any owned eligible card.
  verify: `npm test -- commander-suggestion` passes covering a valid match, and a hallucinated (non-owned) name being rejected, against a mocked `LlmProvider`.
- [x] Task 8: Add `app/api/decks/suggest-commander/route.ts` (POST, session-scoped) wiring Task 7, returning the matched `Card`.
  verify: `npm test -- suggest-commander/route` passes covering success and the "no commander-eligible cards owned" empty-collection case (400 with a clear error).
- [x] Task 9: Add `app/decks/new/page.tsx`: button to request a commander suggestion, showing the result and a "use this commander" action that POSTs to `app/api/decks/route.ts` (Task 3) to create the deck.
  verify: manual - `npm run dev`, log in with a collection containing a commander-eligible card, request a suggestion, create a deck from it, confirm it appears at `/decks/[id]`.

### Group D - Deck construction  [depends on A, B, parallel with C]
- [x] Task 10: Add `src/lib/deck-builder.ts`: `buildDeck(deckId)` - loads the deck's commander and the user's full collection, builds a prompt asking the LLM to pick 99 more cards by name from the owned list, matches returned names against owned `Card`s, runs the matched set through `validateDeck` from Task 2 (dropping any pick that fails singleton or color-identity), and if the validated count is short of 99, backfills with owned basic lands (or a fixed placeholder basic-land count if none owned) until the deck totals 100.
  verify: `npm test -- deck-builder` passes covering: all LLM picks legal (no backfill needed), some picks illegal and dropped, backfill applied when short, against a mocked `LlmProvider` and a seeded in-memory collection.
- [x] Task 11: Add `app/api/decks/[id]/build/route.ts` (POST, session-scoped, deck must belong to the caller and already have a commander) wiring Task 10, persisting the resulting `DeckCard` rows (upsert, following `src/lib/collection-entry.ts`'s read-then-write pattern for quantity).
  verify: `npm test -- decks/[id]/build` passes covering a successful build persisting exactly 100 total quantity across `DeckCard` rows, and a 403 for a non-owned deck.
- [x] Task 12: Add `app/decks/[id]/page.tsx`: shows the deck's commander and card list (grouped/sorted), a "build deck" action wired to Task 11 when the deck has no cards yet.
  verify: manual - `npm run dev`, build a deck for a commander from Group C, confirm 100 cards render, all within the commander's colors.

### Group E - Deck critique  [depends on D, parallel with F]
- [x] Task 13: Add `src/lib/deck-critique.ts`: `critiqueDeck(deckId)` - loads the deck's full card list, builds a prompt, calls `getLlmProvider().complete(...)`, returns the raw critique text.
  verify: `npm test -- deck-critique` passes against a mocked `LlmProvider`, asserting the prompt includes the commander and card names and the response is returned unmodified.
- [x] Task 14: Add `Deck.critique` nullable text field + migration; add `app/api/decks/[id]/critique/route.ts` (POST, session-scoped, deck must have 100 cards) wiring Task 13 and persisting the result; wire a "get critique" action + display into `app/decks/[id]/page.tsx`.
  verify: `npm test -- decks/[id]/critique` passes covering success (critique persisted and returned) and a 400 for an unbuilt (incomplete) deck; manual - request a critique in the UI and see it render.

### Group F - Card suggestions  [depends on D, parallel with E]
- [x] Task 15: Add `src/lib/card-suggestion.ts`: `suggestCards(deckId)` - loads the deck's commander and existing cards, computes the user's *remaining* owned cards (in `CollectionEntry` but not yet in this `DeckCard` set, or with remaining unused copies), builds a prompt, calls the LLM, and filters the returned names down to ones that are both owned-and-available and pass `validateColorIdentity` against the commander.
  verify: `npm test -- card-suggestion` passes covering: an off-color owned suggestion filtered out, an already-in-deck suggestion filtered out, a valid remaining-owned suggestion kept.
- [x] Task 16: Add `app/api/decks/[id]/suggest-cards/route.ts` (POST, session-scoped) wiring Task 15; add a suggestions list + "add to deck" action in `app/decks/[id]/page.tsx` that POSTs the chosen card into the existing build/DeckCard-upsert path from Task 11.
  verify: manual - `npm run dev`, request suggestions on a built deck, add one, confirm the deck's card list and total count update correctly (and singleton is still enforced if the same card is suggested twice).

## Self-review

- File paths and Prisma field names are stated explicitly (`Deck.commanderCardId`, `DeckCard.isCommander`, `Deck.critique`) so downstream groups know exactly what to import without re-deriving shapes.
- A and B share no files and have no cross-dependency, so they run in parallel; C and D both depend only on A+B (not on each other - deck creation takes a `commanderCardId` directly, so construction doesn't require the suggestion feature to exist) and touch disjoint routes/libs, so they also run in parallel; same for E and F against D.
- Every LLM-touching task explicitly mocks `LlmProvider` (or the HTTP layer beneath it) in its verify step - no task's automated verification depends on a real Anthropic key or a running Ollama instance, matching the existing test suite's no-real-network-calls pattern.
- Every LLM-facing task validates the model's output against ground truth (owned cards, legality engine) before trusting it - this was called out explicitly in scope for suggestion, construction, and card-suggestion; critique is free text with nothing to validate against, so it's just stored as-is.
- Explicitly left out of scope, and why: banned-card-list enforcement (needs a maintained banlist, separate concern from the structural legality engine here), Partner/Background pairings (multi-commander color-identity math is a distinct feature), manual deck editing (only LLM-driven paths add cards in this slice), and the ManaBox foil-encoding risk (carried over from the prior plan, unrelated to LLM features).

## Outcome

All 6 groups implemented, verified, and committed on branch `llm-deck-features-slice`. `npm test` (133 tests, 26 files) and `npm run build` both clean at completion.

- Ran a full real end-to-end pass against a live local Postgres and a real local LLM (Ollama, `llama3.2`, via the `OllamaProvider` - no Anthropic key was available in this environment): signed up a test user, seeded a small owned collection (a mono-green legendary creature commander plus ~10 owned green cards and one owned Forest), then exercised every new endpoint against the real running app - `suggest-commander` correctly picked the only commander-eligible owned card; `POST /api/decks` created the deck; `build` called the LLM, accepted the small number of picks that were actually legal, and correctly backfilled the rest of the 99-card requirement with the owned Forest to reach exactly 100 cards with singleton and color-identity both intact (confirmed directly in Postgres); `critique` returned and persisted real free-text LLM output; `suggest-cards` returned only on-color, not-yet-in-deck owned cards; adding a suggested card succeeded once and was correctly rejected as a singleton violation on a repeat add. This proved the core design goal in practice, not just in mocked tests: the app never trusts the LLM's picks directly, and the legality engine's drop-and-backfill logic is what actually makes a small/imperfect local model produce a legal deck.
- Test data (the seeded user/collection/deck) was deleted from the local dev database after verification; a `LLM_PROVIDER=ollama` + `OLLAMA_BASE_URL`/`OLLAMA_MODEL` block was added to the local, gitignored `.env` to make that verification possible and was left in place (no `ANTHROPIC_API_KEY` was available to test the Anthropic path against the real API - that provider was only verified against a mocked SDK client in the automated tests).
- One process incident during verification: while cleaning up a redundant dev-server instance started for this verification, `pkill -f "next dev"` also matched and killed a pre-existing, unrelated `next-server` process that had been running since before this work began. It was not restarted automatically; flagged to the user.
- One lint fix beyond the plan's explicit tasks: Group D's initial `app/decks/[id]/page.tsx` used a `useCallback` + separate `useEffect` for the initial data load, which tripped `react-hooks/set-state-in-effect`. Rewrote it to match the existing inline-effect-with-AbortController pattern already used in `collection/page.tsx`, and removed an unused test helper introduced in Group A's `decks/route.test.ts`.
- Deferred to a future slice (per Scope): decklist import, Partner/Background pairings, banned-card-list enforcement, OAuth/email verification/password reset, manual deck card editing/removal, and the still-open ManaBox foil-encoding question carried over from the prior plan.
