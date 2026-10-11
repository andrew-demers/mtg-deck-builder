#!/bin/sh
set -e

# Apply pending Prisma migrations before the server starts. Invoked via a
# direct relative path since node_modules/.bin isn't on PATH by default.
echo "[entrypoint] Running database migrations..."
node_modules/.bin/prisma migrate deploy

# First run: load the card catalog in the background so the server comes up
# immediately (imports made before it finishes will show cards as unmatched).
# A failure here (e.g. no internet) is logged but never blocks startup. Set
# AUTO_SYNC_CARDS=false to disable.
if [ "${AUTO_SYNC_CARDS:-true}" = "true" ]; then
  (node_modules/.bin/tsx scripts/ensure-cards.ts || echo "[entrypoint] Card auto-sync failed - run 'npm run sync-cards' manually.") &
fi

echo "[entrypoint] Starting MTG Deck Builder..."
exec "$@"
