# ── build stage ────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ── runtime stage ──────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/assets ./assets
COPY drizzle.config.ts ./
# миграции прогоняются перед стартом
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
