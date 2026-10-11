# syntax=docker/dockerfile:1

# Multi-stage build: deps -> build -> runtime. Targets a single self-hosted
# stack (e.g. Unraid) alongside a Postgres container - see docker-compose.yml.

# ---- base: shared setup for stages that hit the network (apk/npm) ----
FROM node:22-alpine AS base
WORKDIR /app
# Optional corporate/proxy root CA for TLS-inspecting networks - drop a
# .crt/.pem file in certs/ and it's trusted here before any apk/npm network
# call runs. No-op if certs/ is empty (just the tracked README.md). See
# certs/README.md.
COPY certs/ /usr/local/share/ca-certificates/
RUN for f in /usr/local/share/ca-certificates/*.crt /usr/local/share/ca-certificates/*.pem; do \
      [ -f "$f" ] && cat "$f" >> /etc/ssl/certs/ca-certificates.crt; \
    done; true
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# ---- deps: install all dependencies (dev included - the build needs them,
#             and the runtime image reuses them for prisma/tsx) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate the Prisma client and build the Next.js app ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN npm run build

# ---- runner: production image ----
# Based on `base` (not a fresh node image) so the certs/ CA applies to apk too.
FROM base AS runner

# tzdata: makes the TZ env var actually take effect.
# xz: `npm run sync-cards` shells out to `xz` to decompress the MTGJSON download.
RUN apk add --no-cache tzdata xz

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone server + static assets.
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# The standalone output only traces runtime deps the server bundle requires,
# which misses the prisma and tsx CLIs the entrypoint and sync scripts use.
# Overlaying the full node_modules from the builder is simpler and more
# robust than hand-picking packages, at the cost of a larger image.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Prisma schema/migrations + config (entrypoint), and the sources the
# `sync-cards` / `sync-prices` scripts import via tsx (`@/` alias -> src/).
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/src ./src

COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER node
EXPOSE 3000

# Uses 127.0.0.1 rather than localhost - HOSTNAME=0.0.0.0 only binds the IPv4
# wildcard, and Alpine resolves "localhost" to IPv6 loopback first.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
