# Holly Bot (hunt-bot-v1)

## Design

### Architecture

- **Next.js 15** (App Router) – frontend and API routes
- **Orchestrator** – backend calls a remote API for answers (`stream-answer`) and feedback

### Components

| Component | Purpose |
|-----------|---------|
| `app/chat/page.tsx` | Chat UI with message list, streaming, and feedback |
| `app/api/chat/route.ts` | Proxies to orchestrator `stream-answer`, forwards SSE to client |
| `app/api/feedback/route.ts` | Proxies to orchestrator `feedback` |
| `app/lib/config.ts` | `ORCHESTRATOR_URL` (default: dev) |

## Workflow

1. **User sends message** → `POST /api/chat` with `{ message }`.
2. **Backend** → POSTs to `ORCHESTRATOR_URL/orchestrator/stream-answer` with `{ session_id, request_id, question }`.
3. **Response** → Orchestrator stream is parsed and forwarded as SSE (`status`, `result`, `error`).
4. **Client** → Consumes SSE and updates the chat UI.
5. **Feedback** → User thumbs up/down → `POST /api/feedback` → orchestrator `feedback`.

## Local run

```bash
pnpm install
pnpm test
pnpm dev
```

Production build:

```bash
pnpm build
pnpm start
```

## Docker

```bash
pnpm docker:build
pnpm docker:run
```

Or: `docker build -t holly-bot .` then `docker run -p 3000:3000 --env-file .env.local holly-bot`. App listens on port 3000.

## Fly.io

This repo deploys **hunt-bot** (see `fly.toml`). The orchestrator is a separate service (e.g. `mcp-orchestrator-v1-dev.fly.dev`). CI deploys: `main` → prod, `qa` → qa, `feature/*` → dev.

```bash
brew install flyctl   # once
fly auth login
fly auth token       # → GitHub secret FLY_API_TOKEN for CI
fly deploy --app hunt-bot-v1-<env>   # dev, qa, or prod
```

Optional: set orchestrator per app (default is dev):

```bash
fly secrets set ORCHESTRATOR_URL="https://mcp-orchestrator-v1-dev.fly.dev" --app hunt-bot-v1-dev
```

## Orchestrator API (reference)

These examples call the **orchestrator** directly (not this app). Default dev: `https://mcp-orchestrator-v1-dev.fly.dev`.

**Stream answer**

```bash
curl -s -X POST https://mcp-orchestrator-v1-dev.fly.dev/orchestrator/stream-answer \
  -H "Content-Type: application/json" \
  -d '{"session_id":"123456","request_id":"12345678","question":"List 5 job titles in Ventura"}'
```

**Feedback (thumbs up)**

```bash
curl -s -X POST https://mcp-orchestrator-v1-dev.fly.dev/feedback \
  -H "Content-Type: application/json" \
  -d '{"agent_graph_run_id":"c111d890-55c2-40ec-ba23-84a18ffa91f1","rating":"thumbs_up"}'
```

**Feedback (thumbs down)**

```bash
curl -s -X POST https://mcp-orchestrator-v1-dev.fly.dev/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "agent_graph_run_id": "019c6812-8428-7102-a8f0-1dddbe8373a9",
    "rating": "thumbs_down",
    "feedback_type": "not_factual",
    "comment": "Only returned 3 titles"
  }'
```
