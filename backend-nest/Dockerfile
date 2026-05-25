# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests + Prisma schema (see prisma.config.ts — not ./prisma/)
COPY package*.json ./
COPY prisma.config.ts ./
COPY src/database/prisma ./src/database/prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client & build
RUN npx prisma generate
RUN npm run build

# Stage 2: Production image (smaller)
FROM node:20-alpine AS production

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/database/prisma ./src/database/prisma
# Copy generated Prisma client runtime artifacts from builder.
# Production install does not always generate these files automatically.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001
USER nestjs

# Expose port (default for NestJS)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { if (r.statusCode !== 200) throw new Error('Unhealthy') })"

# Start command (apply pending migrations before boot — matches npm run start:prod)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
