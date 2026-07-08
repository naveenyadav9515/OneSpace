# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy application source code
COPY . .

# Accept build environment (release or staging)
ARG BUILD_ENV=release
# Run the specific build
RUN npm run build:${BUILD_ENV}

# Stage 2: Runner
FROM node:24-alpine AS runner

WORKDIR /app

# Copy package files and install production-only dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy build artifacts from the builder stage
COPY --from=builder /app/dist ./dist

# Expose port 4000
EXPOSE 4000

# Set production environment variables
ENV PORT=4000
ENV NODE_ENV=production

# Run the Angular SSR server
CMD ["node", "dist/onespace/server/server.mjs"]
