# ponytail: this host's docker bridge network is flaky under parallel TLS
# connections (npm ci hangs/resets); capping concurrency + retries works
# around it. Also works around a Node 24/OpenSSL 3 AVX512-GCM cipher bug
# on some Intel CPUs during npm/prisma TLS fetches.
FROM node:24-alpine AS deps
ENV OPENSSL_ia32cap='~0x200000200000000'
RUN npm config set maxsockets 3 fetch-retries 5 fetch-retry-mintimeout 20000 fetch-timeout 120000
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS builder
ENV OPENSSL_ia32cap='~0x200000200000000'
RUN npm config set maxsockets 3 fetch-retries 5 fetch-retry-mintimeout 20000 fetch-timeout 120000
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:24-alpine
ENV OPENSSL_ia32cap='~0x200000200000000'
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
