# Holly Bot

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

**Apps:** `mcp-orchestrator-v1-{dev|qa|prod}` · **URLs:** `https://mcp-orchestrator-v1-{env}.fly.dev`

CI deploys: `main` → prod, `qa` → qa, `feature/**` → dev.

### One-time setup
```bash
brew install flyctl
fly auth login
fly auth token   # → set as GitHub secret FLY_API_TOKEN for CI
```

### Create apps (once per env)
```bash
fly launch --name hunt-bot-v1-dev
fly launch --name hunt-bot-v1-qa
fly launch --name hunt-bot-v1-prod
```

### Set secrets
Sync `.env` to an app:
```bash
fly secrets set OPENAI_API_KEY=xxx MCP_TOOL_SQL_URL=xxx MCP_TOOL_RAG_URL=xxx ... --app hunt-bot-v1-dev
```

### Deploy
```bash
fly deploy --app hunt-bot-v1-dev
fly deploy --app hunt-bot-v1-qa
fly deploy --app hunt-bot-v1-prod
```
Pushes to `main`, `qa`, or `feature/**` auto-deploy via GitHub Actions when `FLY_API_TOKEN` is set.


Set `ORCHESTRATOR_URL` to point to dev, qa, or prod as needed.

## Orchestrator API (reference)

These examples call the **orchestrator** directly. Replace `$ORCHESTRATOR_URL` with your orchestrator base URL (e.g. `http://localhost:8000` or `https://mcp-orchestrator-v1-dev.fly.dev`).

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
    "agent_graph_run_id": "019c5f54-0667-7531-9b48-62a65710fd2c",
    "rating": "thumbs_down",
    "feedback_type": "not_factual",
    "question": "List 5 job titles in Ventura",
    "comment": "Only returned 3 titles"
  }'
```


