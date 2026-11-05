# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
FROM deps AS build
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build
FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
# `prisma generate` writes its generated client to node_modules/.prisma in the
# build stage. Copy it alongside the dependencies used by the runtime image.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./package.json
RUN chown -R app:app /app
USER app
EXPOSE 4000
CMD ["node","dist/main.js"]
