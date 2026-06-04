# Dockerfile for the EigenWork Cloud Run worker service.
#
# Build context: REPO ROOT (so the image can include ../lib/).
# Build via: gcloud run deploy --source . --dockerfile worker/Dockerfile

FROM node:20-slim

WORKDIR /app

# Install worker dependencies first (better layer caching)
COPY worker/package.json worker/tsconfig.json ./worker/
WORKDIR /app/worker
RUN npm install --no-audit --no-fund

# Copy shared lib (lifted into the same parent so @/ aliases resolve)
WORKDIR /app
COPY lib ./lib

# Copy worker source last (changes most often)
COPY worker/index.ts ./worker/

# Cloud Run health probe + traffic
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Drop privileges for runtime
USER node

# Run TypeScript directly via tsx (handles tsconfig @/ paths at runtime).
# Cold start: ~200ms tsx init + ~500ms server bootstrap. Acceptable for a worker.
WORKDIR /app/worker
CMD ["npx", "tsx", "index.ts"]
