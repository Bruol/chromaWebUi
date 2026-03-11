# Chroma Web UI (TanStack Start)

Reactive web UI for ChromaDB, built with TanStack Start and styled with a Convex-inspired developer console aesthetic.

## Features

- Lists all collections from Chroma.
- Shows paginated documents for the selected collection.
- Polling refresh for near-live updates.
- Works against Chroma API v2 with v1 fallback support.
- Docker-ready for side-by-side deployment with Chroma.

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Required:

- `CHROMA_HOST` (for example `localhost` or the Docker service name)
- `CHROMA_PORT` (for example `8000`)

Configurable with defaults:

- `CHROMA_TENANT` (default: `default_tenant`)
- `CHROMA_DATABASE` (default: `default_database`)

Optional:

- `CHROMA_PROTOCOL` (default: `http`)
- `PORT` (default: `3000`)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production Build

```bash
npm run build
node .output/server/index.mjs
```

## Docker

Build image:

```bash
docker build -t chroma-ui:latest .
```

Run container next to Chroma:

```bash
docker run --rm -p 3000:3000 \
  -e CHROMA_HOST=host.docker.internal \
  -e CHROMA_PORT=8000 \
  -e CHROMA_TENANT=default_tenant \
  -e CHROMA_DATABASE=default_database \
  chroma-ui:latest
```

## Docker Compose (UI + Chroma)

```bash
docker compose up --build
```

This project ships a `docker-compose.yml` that starts:

- `chroma` on port `8000`
- `chroma-ui` on port `3000`

## Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run lint` - lint code
- `npm run test` - run tests
