# Curator — Feature & Usage Guide

Complete reference for every shipped feature. For the why, see `docs/context.md`; for build
status and what's verified live vs. still assumed, see `docs/progress.md` and
`docs/api-verification.md`.

Curator is one CLI with three faces on top of Supermemory Local (`localhost:6767`):
**an MCP server** so any MCP client gets persistent memory, **agentic sources** that pull data in
via Coral under human control, and **a governance console** to browse, review, and forget what
agents have stored. Unifying idea: *agents ingest autonomously, humans supervise.*

---

## 1. Install & build

```bash
pnpm install
pnpm build        # CLI + backend → dist/
pnpm run build:ui # governance console SPA → dist/ui/app
pnpm test         # 109 tests, no external services needed
```

Requirements: Node 20+. For the full loop: a running `supermemory-server` (see
`docs/linux-test-checklist.md` Part 0 for the WSL route), the Coral binary, and at least one
headless agent CLI (`claude` or `agy`).

## 2. Configuration

Resolution order for Supermemory credentials (see `src/config.ts`):

| Setting | 1st: env var | 2nd: file | Default |
|---|---|---|---|
| API key | `SUPERMEMORY_API_KEY` | `~/.supermemory/env` | — (required; actionable error if missing) |
| Base URL | `SUPERMEMORY_BASE_URL` | `~/.supermemory/env` | `http://localhost:6767` |

Curator's own knobs:

| Env var | Used by | Meaning |
|---|---|---|
| `CURATOR_SOURCES` | `sync` (agentic) | Comma-separated Coral sources to sync (default `github`) |
| `CURATOR_AGENT` | `sync` (agentic) | Agent runtime when `--agent` isn't passed (`claude` \| `agy`) |
| `CURATOR_INSTRUCTION` | `sync` (agentic) | Fetch focus when `--instruction` isn't passed |
| `GITHUB_OWNER` / `GITHUB_REPO` | `sync --raw` | Repo targeted by the deterministic sync query |
| `CURATOR_REMEMBER_MODE` / `CURATOR_STAGE_FILE` | internal | Set automatically on the spawned agent's curator MCP server by `--review`; not for manual use |

Local state (never in the repo):

| Path | Contents |
|---|---|
| `~/.curator/state.json` | Sync cursors: `agent-sync` (live), `agent-sync-pending` (parked by `--review`), `github` (raw sync) |
| `~/.curator/mcp-config.json` | Generated two-server MCP config handed to `claude` per run |
| `~/.curator/staged.jsonl` | Memories proposed by a `--review` run, awaiting `--commit` |
| `~/.gemini/antigravity-cli/mcp_config.json` | agy's own MCP config; Curator merges itself in (your entries preserved) |

## 2b. Interactive mode (run `curator` with no arguments)

Running `curator` with no command launches an arrow-key menu (`@clack/prompts`) covering
**Status Check, Sync Data, Connect Sources, and Start UI** — it walks you through the same inputs
the flags take (sync type, agent runtime, instruction, review toggle, port). It's a convenience
layer over the exact same code the flags call; every flag-based command below still works
unchanged for scripting and for MCP clients.

Two deliberate exclusions:
- **"Start MCP Server" is not in the menu.** The stdio MCP transport uses stdout as its JSON-RPC
  wire, and the menu writes styled banners to stdout — starting the server interactively would
  corrupt the protocol. MCP servers are spawned by clients via `curator mcp`, never by a human.
- **Only verified agent runtimes appear** in the runtime picker (`claude`, `agy`) — the same set
  `--agent` accepts. Nothing speculative is offered.

This adds `@clack/prompts`, `picocolors`, and `gradient-string` — a knowing exception to the
"plain commander, no CLI framework" guideline in CLAUDE.md, scoped to the interactive entry point
only; the flag surface stays framework-free.

## 3. `curator status` — config + server probe

```bash
curator status
```

Prints the resolved base URL, the API key redacted to its first 4 characters, then probes the
server root (`GET /`, 3-second timeout — Local has no dedicated `/health` path, confirmed live
against server-v0.0.5):

```
Supermemory base URL: http://localhost:6767
API key: sm_b****
Server: reachable (HTTP 200)
```

Exit code 1 (with a pointer to the WSL guide) when the server is down. Use this as the first
diagnostic for any "nothing works" situation.

## 4. `curator mcp` — the MCP server (Component A)

Stdio MCP server exposing exactly four tools, targeting the local binary directly — no cloud, no
OAuth. Credentials auto-discovered per §2, so client config needs no secrets:

```json
{ "mcpServers": { "curator": { "command": "node", "args": ["<abs path>/dist/cli.js", "mcp"] } } }
```

(Once published: `"command": "npx", "args": ["-y", "curator", "mcp"]`.)

| Tool | Inputs | Behavior |
|---|---|---|
| `remember` | `content` (req), `containerTag`, `customId`, `metadata` | Stores a memory. Default tag `curator_default`. Same `customId` → update-in-place, not a duplicate. In review mode (see §7) it stages instead of storing |
| `recall` | `query` (req), `containerTag`, `includeProfile` (default true), `limit` (default 10) | Hybrid search; appends the user profile unless `includeProfile:false` |
| `forget` | `target` (req), `mode: 'id'\|'prompt'` (req), `containerTag`, `dryRun` (**default true**) | `id` → forget one memory; `prompt` → agentic mass-forget ("everything about client X"). **Nothing is deleted unless the caller explicitly passes `dryRun:false`** — a Curator-level safety default; the server's own default is unsafe (false). Dry-run returns the candidate list |
| `get_profile` | `containerTag` | User/context profile summary |

Container tags scope everything — one server cleanly serves work, personal, and per-repo memory
spaces. Errors come back as actionable one-liners ("Is Supermemory Local running on :6767?"),
never stack traces.

## 5. `curator connect` — wire up Coral sources

```bash
curator connect github
curator connect github linear slack   # sequential wizards, stops at first failure
```

Thin wrapper over `coral source add --interactive <source>` — Coral's own wizard collects and
stores credentials in its keychain; **Curator never touches source secrets**. Documented sources:
`github`, `linear`, `slack`, `sentry`, `datadog`, `stripe` (anything else is passed through to
Coral with a warning — Coral is the authority). Non-interactive alternative: Coral reads matching
env vars, e.g. `GITHUB_TOKEN=$(gh auth token) coral source add github`.

After connecting, a dimmed suggestion list (§8) shows example `--instruction` values for the
sources you just wired.

## 6. `curator sync` — agentic sources (Component C)

### 6.1 Deterministic baseline: `sync --raw`

```bash
GITHUB_OWNER=you GITHUB_REPO=yourrepo curator sync --raw
```

No agent in the loop: runs a fixed Coral SQL query (GitHub issues/PRs where
`updated_at > cursor`), maps rows to memories with `customId = github:issue:<n>` (idempotent —
running twice stores nothing new), ingests, advances the `github` cursor. This is the demo safety
net and proves the pipeline independent of agent behavior. `--instruction` is ignored here (with a
warning) and `--review` is rejected — raw's "what to pull" *is* its SQL query.

### 6.2 Agentic sync

```bash
curator sync                          # claude runtime, sources from CURATOR_SOURCES
curator sync --agent agy              # drive the Antigravity CLI instead
CURATOR_SOURCES=github,linear curator sync
```

Spawns a headless agent armed with **two MCP servers**: Coral's (read: `sql`, `list_catalog`,
`search_catalog`, `describe_table`, `list_columns`) and Curator's own (write: the §4 tools). The
prompt protocol makes it: discover schema → fetch changes since the cursor → judge what's durable
(decisions, status changes, ownership, deadlines; skip bot noise) → `remember` each keeper with a
mandatory `customId` → report and emit a final `CURSOR=<iso>` line, which advances the cursor.
Malformed/missing cursor line → old cursor kept, warning printed. 5-minute timeout.

Runtime differences (both verified live — `docs/api-verification.md` §11):

| | `claude` (default) | `agy` |
|---|---|---|
| Invocation | `-p <prompt> --mcp-config <file> --strict-mcp-config --allowedTools mcp__coral mcp__curator --output-format json` | `-p <prompt> --dangerously-skip-permissions` |
| MCP config | Per-run file `~/.curator/mcp-config.json` | Merged into agy's own `mcp_config.json` |
| Output | JSON envelope (unwrapped automatically) | Plain text |

### 6.3 Steering the fetch: `--instruction`

```bash
curator sync --instruction "only merged PRs touching auth, and any issue with a deadline"
```

Injects a FOCUS block into the agent's protocol: prioritize matching items, and when the
instruction narrows scope, skip out-of-scope items even if otherwise memorable. Verified live: an
instruction to describe one recent PR made the agent store exactly 1 memory and skip 49.

## 7. The review layer: `--review` / `--commit`

Pre-ingestion human control — nothing reaches Supermemory until you say so:

```bash
curator sync --review --instruction "decisions and deadlines only"
# → agent runs normally, but every remember() is intercepted and staged:
#   Staged for review (3):
#     1. [github:pr:123] (src_github)
#        PR #123 "Rotate signing keys" was merged...
#   Stage file: ~/.curator/staged.jsonl
# → live cursor untouched; agent's reported cursor parked as pending

curator sync --commit
# → flushes staged memories through the real remember(),
#   advances the cursor to the parked value, clears the stage file
```

Mechanics: `--review` launches Curator's MCP server (inside the agent's config) with
`CURATOR_REMEMBER_MODE=stage`, so the *same* `remember` tool appends to the JSONL instead of
writing. Each review run clears stale stagings first. To discard proposals instead of committing,
delete `~/.curator/staged.jsonl`. `--commit` is the only step that touches Supermemory.

This complements the **post-ingestion** review queue in the console (§9): staging catches
everything before it lands; the queue catches what Supermemory itself infers with low confidence
after direct (non-review) syncs.

## 8. Suggestion layer

When you run an agentic sync *without* an instruction (and after `connect`), Curator prints a
dimmed, non-blocking list of per-source instruction ideas:

```
Suggestions — steer this sync with --instruction (or CURATOR_INSTRUCTION):
  · "only merged PRs and the decisions they encode"
  · "new or reopened issues with deadlines or owners"
  ...
```

Design decision — **curated/hardcoded, not live-generated**, on purpose: suggestions must render
instantly and identically every run (the project's deterministic-before-agentic rule), and they're
prompt starters, not answers. The upgrade path is contained in one function
(`getSuggestions` in `src/sync/suggestions.ts`): tier 2 would derive suggestions from Coral's
actual catalog (dynamic yet still no LLM); tier 3 would let an agent sample recent rows and
propose tailored ones. Unknown sources fall back to generic suggestions — the layer never renders
empty.

## 9. `curator ui` — governance console (Component B)

```bash
curator ui --port 4141   # 4141 is the default
```

Serves the built SPA plus a JSON API that proxies Supermemory server-side — **the API key never
reaches the browser**.

Panels:
- **Memory browser** — memories per container tag, `isLatest`/superseded badges, and real
  version-chain relations (`updates`/`extends`/`derives`, confirmed present on Local) where the
  API returns them.
- **Forget console** — natural-language target → **always dry-run preview first** → explicit
  "Confirm deletion" → action log. Doubles as the GDPR right-to-be-forgotten story.
- **Review queue** — approve/decline/undo low-confidence inferred memories. **Confirmed live and
  working** against server-v0.0.5 (`GET /v3/container-tags/{tag}/inferred` returns real `200` data
  — it just isn't documented in the server's own `/v4/openapi` spec, so don't trust that spec's
  absence as proof a route doesn't exist). The tab still renders conditionally on `supported`, so
  it degrades gracefully on any Local build where the endpoint genuinely isn't there. Currently
  empty in practice until Supermemory passively infers a low-confidence memory — everything
  Curator writes via `remember` is explicit, not inferred, so it won't appear in this queue.

API routes (all delegating to `src/supermemory/ops.ts`): `GET /api/memories?tag=` (proxies
`POST /v4/memories/list`, response field `memoryEntries`), `GET /api/review?tag=`,
`POST /api/review/:id {action}`, `POST /api/forget {target, mode, dryRun}` (dry-run defaults true
here too, overriding the server's own unsafe `false` default).

## 10. Verification status — read before trusting

**Everything is now verified live** against `supermemory-server` v0.0.5 (2026-07-16): Coral,
claude, and agy (real data pulls through both runtimes, real staging), and the full Supermemory
contract (`docs/api-verification.md` §12) — confirmed via the server's own live OpenAPI spec
(`GET /v4/openapi`) plus an end-to-end `remember`→`recall`→`forget`(dry-run) run through Curator's
real MCP server. `ops.ts` no longer uses the `supermemory` npm SDK (hosted-platform-only) — every
call is a direct authenticated `fetch` against the confirmed paths. Remaining open items: proving
`dryRun:false` actually deletes, and running acceptance tests C1–S1 end-to-end with Coral writing
through to a real server. All Supermemory calls are confined to `src/supermemory/ops.ts`,
so corrections after live verification are single-file.
