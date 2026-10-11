FROM node:22-slim

# xz-utils: sync-cards shells out to `xz` to decompress the MTGJSON download.
# openssl: required by Prisma's engines on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends xz-utils openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start -- -H 0.0.0.0 -p 3000"]
