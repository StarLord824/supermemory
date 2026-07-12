# Curator — Implementation Plan (Agent Dispatch Document)

This document instructs a coding agent (Claude Code or equivalent) to build **Curator**: a CLI that gives Supermemory Local an MCP server, a governance console, and Coral-powered agentic sources. Read `PROJECT.md` for the why; this file is the how. Follow phases in order; each ends with acceptance tests that MUST pass before proceeding.

---

## 0. Operating instructions for the build agent

- **Language/runtime:** TypeScript, Node 20+ (ESM). Package manager: pnpm (fall back to npm if unavailable).
- **Verify, don't assume:** exact Supermemory Local endpoint paths and payloads MUST be confirmed against the live local server and the OpenAPI spec (`https://api.supermemory.ai/v3/openapi`) before use. Docs are written for the hosted platform; the local binary may differ. Record findings in `docs/api-verification.md`.
- **Commit discipline:** small conventional commits (`feat:`, `fix:`, `docs:`, `chore:`) after every passing acceptance test. Never squash away history — the hackathon audits commit history for fresh work.
- **Secrets:** never write API keys, tokens, or `~/.supermemory/env` contents into the repo, logs, or commits. `.gitignore` must cover `.env*`, `~/.curator` is outside the repo.
- **Scope control:** do not add features not listed here. If blocked >30 min on a stretch item, apply the cut lines in `ROADMAP.md` and continue.
- **Style:** minimal dependencies; no framework for the CLI (plain `commander`); no ORM; no test framework heavier than `vitest`.

## 1. Prerequisites (verify before coding)

Run and record results:

```bash
# 1. Supermemory Local up
curl -s http://localhost:6767/health || echo "START supermemory-server FIRST"

# 2. Credentials present (installer writes these)
cat ~/.supermemory/env   # expect SUPERMEMORY_API_KEY / related vars — inspect actual names

# 3. Store + search one memory (adjust auth header to actual key)
curl -s http://localhost:6767/v3/documents -H "Authorization: Bearer $SM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"Curator bootstrap test memory","containerTag":"curator_test"}'
curl -s http://localhost:6767/v3/search -H "Authorization: Bearer $SM_KEY" \
  -H "Content-Type: application/json" \
  -d '{"q":"bootstrap test","containerTag":"curator_test"}'

# 4. Gap + capability probe (record status codes + bodies in docs/api-verification.md)
#    a. /v3/connections            → expect unimplemented on Local (this is the gap Curator fills)
#    b. memory entries w/ history  → find exact path in OpenAPI spec; test locally
#    c. review inferred memories   → find exact path; test locally (approve/decline/undo)
#    d. forget by prompt (dryRun)  → find exact path; test locally with dryRun:true
#    e. /v4/profile                → test locally

# 5. Coral
brew install withcoral/tap/coral || curl -fsSL https://withcoral.com/install.sh | sh
coral source discover
GITHUB_TOKEN=<PAT> coral source add github
coral sql "SELECT number,title,state,updated_at FROM github.issues WHERE owner='<user>' AND repo='<repo>' AND state='open' LIMIT 5"

# 6. Headless Claude
claude -p "reply with the word ok" --output-format json
```

**Gate:** if probe (c) fails on Local → build Console without the review queue and note the limitation in README. If (b) fails → memory browser lists latest entries only, no version chains. Everything else is required.

## 2. Repository structure

```
curator/
├── package.json              # bin: { "curator": "dist/cli.js" }
├── tsconfig.json
├── LICENSE                   # MIT
├── README.md
├── PROJECT.md                # copy in the spec doc
├── ROADMAP.md
├── docs/
│   └── api-verification.md   # Phase 0 findings: exact paths, payloads, local support matrix
├── src/
│   ├── cli.ts                # commander entry: mcp | sync [--raw] | connect <source> | ui | status
│   ├── config.ts             # resolve SM key/url: env vars → ~/.supermemory/env parse; Curator state dir ~/.curator
│   ├── state.ts              # read/write ~/.curator/state.json {cursors:{[source]:iso}, settings}
│   ├── supermemory/
│   │   ├── client.ts         # thin wrapper over `supermemory` SDK, baseURL localhost:6767
│   │   └── ops.ts            # remember(), recall(), forgetById(), forgetByPrompt({dryRun}), getProfile(),
│   │                         # listEntriesWithHistory(), reviewQueue list/approve/decline  ← paths from api-verification.md
│   ├── mcp/
│   │   └── server.ts         # @modelcontextprotocol/sdk stdio server exposing 4 tools (schemas §3)
│   ├── sync/
│   │   ├── raw.ts            # deterministic: coral sql → map rows → ops.remember with customId
│   │   ├── agent.ts          # spawn `claude -p` with mcp-config (Coral + Curator), prompt from prompt.ts
│   │   ├── prompt.ts         # the sync agent prompt template (§5)
│   │   └── mapping.ts        # row → {content, customId, containerTag, metadata}; customId = `${source}:${type}:${nativeId}`
│   └── ui/
│       ├── server.ts         # small http server: serves built SPA + JSON API proxying ops.ts (key never reaches browser)
│       └── app/              # Vite + React SPA: MemoryBrowser | ReviewQueue | ForgetConsole | (stretch) GraphView
└── test/
    ├── mapping.test.ts
    ├── config.test.ts
    └── smoke.md              # manual acceptance checklist mirroring §7
```

## 3. Component A — MCP server (`src/mcp/server.ts`)

Use `@modelcontextprotocol/sdk` `McpServer` + `StdioServerTransport`. Register exactly four tools:

| Tool | Input schema (zod) | Behavior |
|---|---|---|
| `remember` | `{content: string, containerTag?: string, customId?: string, metadata?: record}` | `ops.remember`; default tag `curator_default`; return stored id + tag |
| `recall` | `{query: string, containerTag?: string, includeProfile?: boolean=true, limit?: number=10}` | hybrid search; if `includeProfile`, append profile summary block |
| `forget` | `{target: string, mode: 'id'\|'prompt', dryRun?: boolean=true}` | id → forget single; prompt → agentic mass-forget. **dryRun defaults TRUE; deletion requires explicit `dryRun:false`.** Dry-run returns the preview list |
| `get_profile` | `{containerTag?: string}` | `/v4/profile` summary |

Tool descriptions must tell the calling model *when* to use each (e.g., remember: "save durable facts, decisions, and context the user or a source provides"). Errors: return MCP tool errors with actionable text ("Supermemory Local not reachable on :6767 — is supermemory-server running?"), never stack traces.

Client config to document in README (and use for testing):

```json
{ "mcpServers": { "curator": { "command": "npx", "args": ["-y", "curator", "mcp"] } } }
```

(While unpublished: `"command":"node","args":["/abs/path/dist/cli.js","mcp"]`.)

## 4. Component C-raw — deterministic sync (`src/sync/raw.ts`)

1. Read cursor for source (default epoch) from state.
2. Execute: `coral sql "<query>" --format json` (verify Coral's actual JSON output flag via `coral sql --help`; adapt).
   Default query (github): issues + PRs where `updated_at > cursor`, columns: number, title, state, body (truncate 2000 chars), html_url, updated_at.
3. Map each row via `mapping.ts` → `content` (compact readable summary: `[GitHub issue #N] title — state\nbody…\nurl`), `customId`, `containerTag: 'src_github'`, `metadata {source, type, url, updatedAt}`.
4. `ops.remember` each (customId gives idempotent update-in-place). 5. Advance cursor to max(updated_at). 6. Print table of what was stored.

## 5. Component C-agent — agentic sync (`src/sync/agent.ts` + `prompt.ts`)

Write `~/.curator/mcp-config.json` at runtime:

```json
{ "mcpServers": {
    "coral":   { "command": "coral",  "args": ["mcp-stdio"] },
    "curator": { "command": "node",   "args": ["<abs dist>/cli.js", "mcp"] } } }
```

Spawn: `claude -p "<PROMPT>" --mcp-config ~/.curator/mcp-config.json --output-format json --max-turns 25` (verify flag names against installed claude CLI; adjust).

Prompt template (fill `{cursor}`, `{sources}`):

```
You are Curator's sync agent. Your job: pull what changed in connected sources and store ONLY durable, useful memories in Supermemory Local.

PROTOCOL — follow exactly:
1. Discover schema: query coral tables (coral.tables) for sources: {sources}.
2. Fetch changes since {cursor} using SQL. Select minimal columns. LIMIT 50.
3. For each item, decide: is this worth remembering long-term (decisions, status changes, new issues/PRs, ownership, deadlines)? Skip noise (bot comments, CI chatter, trivial edits).
4. Store each keeper with the curator `remember` tool:
   - customId: "{source}:{type}:{native_id}"  (MANDATORY — prevents duplicates)
   - containerTag: "src_{source}"
   - content: 1–3 sentence self-contained summary a future agent can use without the original.
5. Do NOT call forget. Do NOT store secrets, tokens, or emails.
6. Finish with a report: items scanned, stored (with customIds), skipped and why, and the new cursor value = max updated_at you saw, ISO format, on its own final line as: CURSOR=<iso>.
```

Parse the trailing `CURSOR=` line to advance state; if absent or malformed, keep old cursor and warn. Timeout the child process (5 min) and surface partial output.

## 6. Component B — governance console (`src/ui/`)

Backend (`server.ts`): `curator ui [--port 4141]` serves the built SPA and a JSON API — `GET /api/memories?tag=`, `GET /api/history/:id` (if supported), `GET /api/review`, `POST /api/review/:id {action}`, `POST /api/forget {target, mode, dryRun}` — all delegating to `ops.ts`. The Supermemory key stays server-side.

Frontend (Vite + React, keep dependencies minimal):
- **MemoryBrowser:** tag selector, list with content/summary, `isLatest` badge, expandable version chain (relation labels: updates/extends/derives) when the local API supports history.
- **ReviewQueue:** pending inferred memories, Approve/Decline buttons, undo toast. Render only if Phase 0 verified support; otherwise omit the tab entirely (no dead UI).
- **ForgetConsole:** text input → always dry-run first → render preview list → "Confirm deletion" button triggers `dryRun:false` → append to an in-memory action log shown below.
- *(Stretch only)* GraphView embedding `@supermemory/memory-graph`, fed by the documents-list endpoint.

## 7. Acceptance tests (must pass, in order)

1. **A1:** `node dist/cli.js mcp` handshakes with MCP Inspector (`npx @modelcontextprotocol/inspector`) listing 4 tools.
2. **A2:** In Claude Desktop with curator configured: say "remember my hackathon deadline is July 13" → new session → "when is my deadline?" → correct recall.
3. **A3:** `forget` with default dryRun returns preview, deletes nothing (verify via recall); with `dryRun:false` deletes (recall no longer returns it).
4. **C1:** `curator sync --raw` twice in a row → second run stores 0 new documents (idempotency).
5. **C2:** Create a GitHub issue → `sync --raw` → Claude Desktop recalls it.
6. **B1:** Console lists the synced memories; forget flow (preview → confirm) removes one; Claude no longer recalls it.
7. **B2 (conditional):** decline an item in review queue → it never surfaces in recall.
8. **C3 (agentic):** `curator sync` end-to-end stores curated memories with correct customIds and advances cursor. If flaky after 2h tuning → cut per ROADMAP, keep `--raw` for demo.
9. **S1:** Fresh-machine README walkthrough (or clean clone) reaches A2 in under 10 minutes.

## 8. README skeleton (write during Phase 5)

Pitch line → 30-sec architecture diagram (from PROJECT.md §4) → Quickstart (install supermemory-server → install coral → `curator connect github` → `curator sync` → MCP config snippet → `curator ui`) → "What I built vs what I used" (explicit: MCP server, console, agent orchestration are original; Supermemory Local = engine, Coral = source layer, memory-graph = viz component; all credited) → demo video link → hackathon note.

## 9. Out of scope (do not build)

Auth/multi-user, hosted deployment, OAuth connectors, webhook receivers, scheduler/cron UI, publishing to npm before the deadline, Windows support, any write-path into Coral sources, competing with SMFS.