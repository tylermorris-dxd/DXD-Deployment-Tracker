# Container image for the weekly FCC ingest.
#
# Sized for the ULS pull, which is the demanding one: ~700 MB of downloads and
# an 8 GB Node heap. It cannot run on the app's B1 App Service plan (1.75 GB,
# one core) without taking the app down with it, which is why this exists as a
# separate job rather than a task inside the web process.
#
# Build and push:
#   docker build -t <registry>/dxd-fcc-ingest:latest scripts/ingest-fcc
#   docker push <registry>/dxd-fcc-ingest:latest
#
# Run:
#   docker run --rm -e DATABASE_URL=postgres://... <registry>/dxd-fcc-ingest:latest
#   docker run --rm -e DATABASE_URL=... <image> asr          # one source
#   docker run --rm <image> asr --dry-run                    # no database needed

FROM node:22-slim

WORKDIR /app

# Dependencies first so a change to the script alone reuses this layer. tsx is
# a devDependency, so dev deps are needed at runtime here.
COPY package.json package-lock.json ./
RUN npm ci

COPY fcc-ingest.ts ./

# Matches the npm scripts. The ULS pass holds the active-licence and location
# maps for l_LMpriv, which does not fit in the default heap.
ENV NODE_OPTIONS=--max-old-space-size=8192

# Roughly 5 GB of archives and extracted .dat files at peak.
VOLUME ["/tmp"]

ENTRYPOINT ["npx", "tsx", "fcc-ingest.ts"]
