# Plan: Manual deck editing
Date: 2026-09-09
Status: COMPLETED

## Problem

`plans/2026-09-07-llm-deck-features-slice.md` shipped LLM-driven deck construction, critique, and card suggestions, but explicitly deferred manual editing: today the only ways a card enters a `Deck` are the `build` endpoint (which regenerates and overwrites the whole 99-card body) and the suggestion "Add" action (`POST /api/decks/[id]/cards`, which can only add, never remove or adjust). A user has no way to remove a card they don't want, correct a bad LLM pick, or change how many of a basic land they're running, without rebuilding the entire deck. This slice closes that gap: remove a card from a deck, adjust a basic land's quantity, and add any owned, legal card directly (not just from the suggestion list) - all through the deck detail page.

## Scope

**In scope:**
- `DELETE /api/decks/[id]/cards/[cardId]` - remove a non-commander card from a deck the caller owns.
- `PATCH /api/decks/[id]/cards/[cardId]` - set a basic land's quantity in a deck the caller owns (nonland quantity is fixed at 1 by the singleton rule and isn't editable this way).
- Deck detail page (`app/decks/[id]/page.tsx`): a "Remove" control per non-commander row, and a quantity control on basic-land rows, wired to the two endpoints above.
- Deck detail page: an "add from collection" search section that lists the user's owned cards not yet in the deck (filtered client-side to the commander's color identity), with an "Add" action reusing the existing `POST /api/decks/[id]/cards`.

**Out of scope:**
- Changing or removing the commander itself (that's a "start a new deck" operation, not an edit).
- Enforcing the 100-card total on every manual edit - a deck is allowed to sit away from 100 cards mid-edit; `critique` already independently rejects a deck that isn't exactly 100 (`src/app/api/decks/[id]/critique/route.ts`), and that gate is untouched.
- A dedicated server-side search/filter endpoint for "owned cards not in this deck" - reuses the existing `GET /api/collection` and filters client-side, consistent with this slice's UI-only scope.
- Banned-card-list enforcement, Partner/Background pairings, decklist import, OAuth/email/password-reset - all still deferred from the prior plan, untouched here.

## Success criteria

1. `npm test` passes with no failing tests, and `npm run build` succeeds.
2. Removing a non-commander card from a deck via the API deletes its `DeckCard` row and the response no longer includes it; attempting to remove the commander returns 400.
3. Setting a basic land's quantity via the API updates that `DeckCard.quantity`; attempting to set quantity on a nonland card, or setting quantity to 0 or negative, returns 400.
4. Both new endpoints return 401 with no session, 404 for a deck that doesn't exist, and 403 for a deck belonging to another user - matching every existing `decks/[id]/*` route.
5. On the deck detail page: a non-commander row has a working "Remove" button; a basic-land row has a working quantity control; the commander row has neither.
6. On the deck detail page: the "add from collection" section only shows owned cards that are within the commander's color identity and not already in the deck, and its "Add" action updates the visible card list and total count.

## Context to load

Before starting, read:
- `src/app/api/decks/[id]/cards/route.ts` - the existing "add a card" POST handler (auth/ownership checks, ownership-of-card check, color-identity check, singleton/basic-land branching on `DeckCard` upsert) - the new DELETE/PATCH handlers in this slice go in a sibling `[cardId]` route file and must match this file's checks and response shape exactly.
- `src/app/api/decks/[id]/cards/route.test.ts` - the mocking pattern (`vi.mock("@/auth")`, `vi.mock("@/lib/prisma")`) to reuse for the new route's tests.
- `src/app/api/decks/[id]/critique/route.ts` - shows the existing 401/404/403/400 status-code convention this slice must keep consistent.
- `src/lib/commander-legality.ts` - `isBasicLand`, `validateColorIdentity` - reused as-is, not modified, by both the new PATCH handler and the client-side color-identity filter in the add-from-collection UI.
- `src/app/decks/[id]/page.tsx` - current deck detail page (state shape, `sortDeckCards`, existing `handleAddCard`/fetch patterns) that the new remove/quantity/add-search UI extends.
- `src/app/api/collection/route.ts` - the existing `GET /api/collection` response shape (`{ id, quantity, foil, card: {...} }[]`) that the add-from-collection UI fetches and filters client-side; note it returns one row per (card, foil) combination, so the UI must dedupe by `cardId` before listing "owned cards not yet in the deck".
- `prisma/schema.prisma` - `DeckCard` model (`@@unique([deckId, cardId])`, `isCommander`) confirming the lookup key the new route uses.

## Tasks

### Group A - Remove & quantity API  [no dependencies, parallel with none]
- [x] Task 1: Add `src/app/api/decks/[id]/cards/[cardId]/route.ts` with a `DELETE` handler: 401 with no session; 404 if the deck doesn't exist; 403 if it belongs to another user; 404 if no `DeckCard` exists for that `(deckId, cardId)`; 400 if the matched `DeckCard.isCommander` is true ("Cannot remove the deck's commander"); otherwise delete the `DeckCard` row and return the updated deck (`commanderCard` + `cards.card` included), matching the response shape of `POST /api/decks/[id]/cards`. Add `src/app/api/decks/[id]/cards/[cardId]/route.test.ts` covering each of the above cases plus the success path.
  verify: `npm test -- 'decks/\[id\]/cards/\[cardId\]/route'` passes.
- [x] Task 2: Add a `PATCH` handler to the same route file: reads `{ quantity: number }` from the body; same 401/404/403/404-DeckCard-not-found checks as Task 1; 400 if the matched card is not a basic land (per `isBasicLand` from `src/lib/commander-legality.ts`); 400 if `quantity` is missing, not an integer, or less than 1; otherwise updates `DeckCard.quantity` and returns the updated deck in the same shape. Extend `route.test.ts` with cases: success (basic land quantity updated), 400 for a nonland card, 400 for quantity 0.
  verify: `npm test -- 'decks/\[id\]/cards/\[cardId\]/route'` passes (full file, both handlers).

### Group B - Deck detail page editing UI  [depends on A]
- [x] Task 3: In `src/app/decks/[id]/page.tsx`, add a "Remove" button to each non-commander row in the card table (hidden/absent for the commander row) that calls `DELETE /api/decks/${deckId}/cards/${cardId}`, and add a quantity control (numeric input or +/- buttons) to basic-land rows only (detect via `deckCard.card.type.includes("Basic Land")`, mirroring `isBasicLand`) that calls `PATCH /api/decks/${deckId}/cards/${cardId}` with the new quantity; both update `deck` state from the response, following the existing `handleBuildDeck`/`handleAddCard` fetch-and-setError pattern.
  verify: manual - `npm run dev`, build a deck, remove a nonland card and confirm it disappears and the total count drops by 1, adjust a basic land's quantity up and down and confirm the table and total count reflect it, confirm the commander row shows neither control.
- [x] Task 4: In the same file, add an "Add from collection" section: on mount (or on demand via a button, matching the existing suggestions section's pattern), fetch `GET /api/collection`, dedupe the results by `card.id`, filter out cards already present in `deck.cards` and cards outside `deck.commanderCard.colorIdentity` (using `validateColorIdentity`-equivalent client-side logic: every color in the card's `colorIdentity` must be in the commander's), render the remainder with a search-by-name text input filtering the visible list, and an "Add" button per row calling the existing `POST /api/decks/${deckId}/cards` (same call as `handleAddCard`, reusable as-is).
  verify: manual - `npm run dev`, open a built deck, confirm the add-from-collection list excludes cards already in the deck and any off-color owned cards, type a partial name into the search box and confirm the list narrows, add a listed card and confirm it appears in the deck table and disappears from the add list.

## Self-review

- File paths are explicit (`src/app/api/decks/[id]/cards/[cardId]/route.ts`, `src/app/decks/[id]/page.tsx`) and the new route's response shape is pinned to match the existing `POST /api/decks/[id]/cards` handler, so Group B can wire against a known contract without re-deriving it.
- Group A has no dependency and Group B explicitly depends on it, since the UI calls the new endpoints directly - no parallel groups here, this slice is small enough to stay sequential.
- Both new task-1/2 checks (404 on missing DeckCard, 400 on commander removal, 400 on nonland quantity edit, 400 on quantity < 1) were derived from the explicit business rules already encoded in `commander-legality.ts` and the existing `cards/route.ts`, not invented fresh - singleton means nonland quantity is always 1, so "adjust quantity" only ever makes sense for basic lands.
- The add-from-collection UI reuses `GET /api/collection` rather than adding a new query endpoint, per the prior plan's convention of preferring existing routes/patterns over new abstractions when the shape already fits; the one caveat (one row per foil variant) is called out explicitly in Context to load and Task 4 so it isn't missed.
- Manual-only verify steps for Group B match this project's existing convention (every prior UI task, e.g. Tasks 9/12/14/16 in the prior plan, verifies manually - there are no page-component tests anywhere in `src/app`).
