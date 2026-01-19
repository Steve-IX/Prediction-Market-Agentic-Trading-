# Multi-stage build for Railway deployment
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS build
COPY . .
RUN pnpm build

# Production stage
FROM base AS production

# Copy built files
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

# Expose ports
EXPOSE 3000 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["pnpm", "start"]
