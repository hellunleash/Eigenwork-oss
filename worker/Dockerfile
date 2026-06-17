# Dockerfile for the EigenWork Cloud Run worker service.
#
# Build context: REPO ROOT (so the image can include ../lib/).
# Build via: gcloud builds submit --config cloudbuild.yaml
#
# Layout strategy:
#   Node module resolution walks UP from a file's directory looking for
#   node_modules. Our lib/ files live at /app/lib and import packages like
#   `firebase-admin` and `openai`. If we install deps inside /app/worker/
#   node_modules, lib/ can't find them (Node won't look sideways).
#
#   So we install at /app level — package.json at /app/, node_modules at
#   /app/node_modules — which is the parent of both lib/ and worker/.
#   Both directories resolve modules correctly via standard walk-up.
#
#   tsconfig.json stays inside /app/worker/ so its `paths: @/* -> ../*`
#   keeps resolving to /app/lib/* unchanged.

FROM node:20-slim

WORKDIR /app

# Install at /app level so both lib/ and worker/ can resolve.
COPY worker/package.json ./package.json
RUN npm install --no-audit --no-fund

# Shared lib (imported by worker/index.ts via @/ alias).
COPY lib ./lib

# Worker source + tsconfig (tsconfig must stay alongside index.ts so its
# relative `paths: @/* -> ../*` resolves to /app/lib). Copy ALL worker *.ts
# (index.ts + kpi-bigquery.ts + any future modules) so a new worker file is
# never silently left out of the image.
COPY worker/tsconfig.json ./worker/
COPY worker/*.ts ./worker/

# Cloud Run health probe + traffic
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Drop privileges
USER node

# Run TypeScript directly via tsx. tsx finds tsconfig.json by walking up
# from cwd; setting WORKDIR to /app/worker ensures /app/worker/tsconfig.json
# is the one used.
WORKDIR /app/worker
CMD ["npx", "tsx", "index.ts"]
