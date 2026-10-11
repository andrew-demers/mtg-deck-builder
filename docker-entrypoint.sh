#!/bin/sh
set -e

# Apply pending Prisma migrations before the server starts. Invoked via a
# direct relative path since node_modules/.bin isn't on PATH by default.
echo "[entrypoint] Running database migrations..."
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting MTG Deck Builder..."
exec "$@"
