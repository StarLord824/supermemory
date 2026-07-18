# Curator

**A companion layer for [Supermemory Local](https://supermemory.ai/docs/self-hosting/overview)** — the self-hosted `supermemory-server` binary that runs the same memory engine as Supermemory's hosted platform, entirely on your machine (`http://localhost:6767`).

Supermemory Local's own docs list two capabilities as **hosted-platform-only**: an MCP server, and connectors that pull data in from external tools. Curator fills exactly those two gaps — nothing else. It doesn't compete with Local or reimplement it; it's a small CLI + local web console + agent orchestration layer that sits on top of the binary you already run.

> Built for the Supermemory Local hackathon (`localhost:6767`).

<!-- demo video: add link here once recorded -->
<!-- screenshots: add console screenshots here (Home / Memories / Graph / Docs tabs) -->

## What Curator adds

| Gap in Supermemory Local | What Curator adds |
|---|---|
| No MCP server | `curator mcp` — a stdio MCP server exposing exactly four tools (`remember`, `recall`, `forget`, `get_profile`) to any MCP-capable client (Claude Desktop, Cursor, Windsurf, Claude Code, ...) |
| No governance UI | `curator ui` — a local web console: browse memories, review low-confidence inferred ones, forget with a mandatory dry-run preview, and a live memory graph |
| No connectors | `curator sync` — a headless agent (Claude Code or Antigravity CLI) uses [Coral](https://github.com/withcoral/coral) to pull real data from developer tools (GitHub today; Linear/Slack documented) and writes curated memories through Curator's own MCP server |

We call this third piece **agentic sources**, deliberately not "connectors" — Supermemory's hosted connectors are a paid platform feature pulling from office/consumer tools (Drive, Gmail, Notion) via webhooks. Curator's sources are developer/enterprise tools, pulled by an agent that *decides* what's worth remembering, not a push-everything sync.

The unifying idea: **agents ingest autonomously, humans supervise.** Nothing leaves your machine except calls to whatever LLM you configure for extraction (Supermemory Local requires one) and the agent's own reasoning calls.

## Quickstart

**Requirements:**
- Node.js ≥ 20
- A running [Supermemory Local](https://supermemory.ai/docs/self-hosting/quickstart) server (`supermemory-server`, default `http://localhost:6767`)
- Optional, only for `curator sync`: [Coral](https://github.com/withcoral/coral) with at least one source connected, and either the `claude` (Claude Code) or `agy` (Antigravity CLI) headless runtime installed

```bash
git clone <this-repo-url>
cd supermemory
pnpm install       # npm install also works
pnpm build         # compiles the CLI
pnpm run build:ui  # builds the governance console (needed for `curator ui`)
```

**Install the `curator` command globally** (this project isn't published to npm — link it locally instead):

```bash
npm link
```

Now `curator` is a real command on your PATH, backed by this checkout:

```bash
curator status
```
```
Curator — a companion layer for Supermemory Local (localhost:6767)
Supermemory base URL: http://localhost:6767
API key: sm_b****
Server: reachable (HTTP 200)
```

If you'd rather not link globally, every command also works as `node dist/cli.js <command>`.

### Credentials — zero-config on localhost

If `SUPERMEMORY_API_KEY` isn't set anywhere, Curator checks whether `baseUrl` is strict localhost (`localhost`/`127.0.0.1`/`[::1]`, never a substring match) and, if so, sends no `Authorization` header at all — matching Supermemory Local's own documented behavior of auto-accepting unauthenticated localhost requests. For anything else (non-localhost `baseUrl`, or if you prefer an explicit key), set `SUPERMEMORY_API_KEY=<key>` — the key is printed in the server's own boot banner.

`~/.supermemory/env` (if present) is read as a fallback, but note it typically holds your **LLM provider key** (`OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`), not a Supermemory key — the server generates its own key at first boot.

## Commands

| Command | What it does |
|---|---|
| `curator mcp` | Runs the stdio MCP server (see [MCP tools](#mcp-tools) below). |
| `curator status` | Prints resolved config and probes the server. First thing to run if anything else fails. |
| `curator tags` | Lists every container tag found in Supermemory Local, with a document count each. There's no native "list tags" endpoint — this derives the set by paging the documents list. |
| `curator sync [flags]` | Pulls data from connected agentic sources into Supermemory Local. See below. |
| `curator connect <source...>` | Wraps `coral source add --interactive <source>` for one or more Coral sources (e.g. `curator connect github linear slack`). |
| `curator ui [--port]` | Serves the governance console (default port 4141). |

Run `curator` with no arguments in an interactive terminal for an arrow-key menu covering the common commands.

### `curator sync` — agentic sources

```bash
curator sync                          # agentic sync, writes directly
curator sync --review                 # stage proposals for human review first
curator sync --commit                 # write what --review staged
curator sync --raw                    # deterministic fallback, no agent/LLM in the loop
```

Flags:
- `--agent <runtime>` — `claude` or `agy`. Falls back to `CURATOR_AGENT`, then `claude`.
- `--instruction <text>` — free-text steer for what the agent should prioritize. Falls back to `CURATOR_INSTRUCTION`.
- `--container <tag>` — override the default per-source container tag (`src_{source}`) so everything this run stores lands in one fixed container — e.g. separating issues from PRs. Falls back to `CURATOR_CONTAINER`.
- `--timeout <minutes>` — override the 5-minute agent timeout; large/active repos can need longer. Falls back to `CURATOR_TIMEOUT_MINUTES`.

**Deterministic before agentic:** `--raw` runs a fixed Coral query with no LLM involved — the reliable fallback if the agentic path isn't available or predictable output matters more than curation quality.

**Review before write, when you want it:** `--review` stages the agent's proposed memories to a local file instead of writing them; inspect the printed preview, then `curator sync --commit` to write them for real (or just don't, and nothing is stored). Without `--review`, a run writes directly — reasonable once you trust the agent's judgment for a given source/container.

### MCP tools

| Tool | Inputs | Behavior |
|---|---|---|
| `remember` | `content` (required), `containerTag`, `customId`, `metadata` | Stores a memory. Same `customId` updates in place rather than duplicating. |
| `recall` | `query` (required), `containerTag`, `includeProfile`, `limit` | Hybrid semantic search, optionally appending the user profile. |
| `forget` | `target` (required), `mode: 'id' \| 'prompt'`, `containerTag`, `dryRun` (**default `true`**) | Deletes matching memories. **Nothing is ever deleted unless the caller explicitly passes `dryRun:false`** — this is a Curator-level safety default; the underlying server's own default is unsafe. |
| `get_profile` | `containerTag` | Returns the static/dynamic user/context profile. |

Add to any MCP-capable client's config:
```json
{ "mcpServers": { "curator": { "command": "node", "args": ["<absolute-path>/dist/cli.js", "mcp"] } } }
```
(Or `"command": "curator", "args": ["mcp"]` once linked globally.)

## The governance console

```bash
curator ui --port 4141
```

A dark, tabbed local web console (self-hosted fonts, works fully offline) serving a JSON API that proxies Supermemory server-side — **the API key never reaches the browser.**

- **Home** — overview stats: container tags found, memory count for the active tag, whether the review queue is supported on this server. Default tab.
- **Memories** — browse memories per container tag, with `isLatest`/superseded badges and real version-chain relations where available.
- **Review** — approve/decline/undo low-confidence inferred memories. Only shown if the backend actually supports it — no dead UI.
- **Forget** — natural-language target → **mandatory dry-run preview** → explicit confirm → action log.
- **Graph** — the official [`@supermemory/memory-graph`](https://www.npmjs.com/package/@supermemory/memory-graph) component, rendering real documents and their memories as an interactive force-directed graph.
- **Docs** — an in-app quick reference for the CLI commands and MCP tools above.

The container-tag field is a search+dropdown: it suggests tags that actually exist (via `curator tags`' same underlying lookup) but still accepts typing an arbitrary tag, so a fresh install with no data yet isn't locked out.

## Architecture

Three entry points, one shared path into Supermemory Local:

- **MCP clients** (Claude Desktop, Cursor, Claude Code, ...) → stdio → `curator mcp` (4 tools)
- **Browser** → HTTP/JSON → `curator ui`'s backend, which proxies server-side (the API key never reaches the browser)
- **Headless agent** (`claude` or `agy`) → reads via Coral's MCP server, writes via `curator mcp`'s own `remember` tool (staged first if `--review` is used)

All three converge on `src/supermemory/ops.ts` — the *only* file in this codebase allowed to name a Supermemory Local endpoint path. The MCP server, sync agent, and console backend all delegate to it rather than calling the HTTP API directly. This kept the whole endpoint contract correctable in one place when live verification against the real binary corrected several assumptions from the hosted docs (see `docs/api-verification.md`).

## What I built vs. what I used

**Original work (this repo, MIT-licensed):** the CLI, the MCP server and its four tools, the governance console (backend proxy + React frontend), the agentic sync orchestration (prompt template, cursor tracking, review/commit staging, dual-runtime support), and all glue code.

**Dependencies, credited:**
- **[Supermemory Local](https://github.com/supermemoryai/supermemory)** — the memory engine this entire project sits on top of. Sponsor of the hackathon this was built for.
- **[`@supermemory/memory-graph`](https://www.npmjs.com/package/@supermemory/memory-graph)** (MIT) — Supermemory's own React component, rendering the console's Graph tab. Used as-is, not reimplemented.
- **[Coral](https://github.com/withcoral/coral)** (Apache-2.0) — the local-first SQL-over-APIs runtime powering `curator connect`/`curator sync`'s source access.
- **[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)** — the MCP server/client protocol implementation.

## Development

```bash
pnpm test              # full test suite (vitest)
pnpm vitest run test/<name>.test.ts   # a single test file
npx tsc --noEmit -p tsconfig.json              # backend/CLI typecheck
npx tsc --noEmit -p src/ui/app/tsconfig.json   # console frontend typecheck
```

More detail on every command, flag, and verified API contract lives in `docs/`:
- `docs/usage.md` — the full command/flag/MCP-tool reference.
- `docs/api-verification.md` — every Supermemory Local endpoint Curator calls, confirmed live against a real running server, with the exact request/response shapes.
- `docs/progress.md` — a running log of what's built and verified, commit by commit.

## License

MIT — see [LICENSE](LICENSE).
