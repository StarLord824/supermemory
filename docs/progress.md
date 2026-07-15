# Curator — Progress

Snapshot of what's been built since `git init`, for anyone (including future-us) picking this up
mid-stream. Read `docs/context.md` → `docs/plan.md` → `docs/roadmap.md` →
`docs/implementation-plan.md` for the why/what/when/how; this file is "where are we right now."

**Current status: blind build phase complete; Coral + both agent runtimes verified LIVE on Windows
(2026-07-12, see `docs/api-verification.md` §11), and the new instruction/review-staging layer
verified LIVE end-to-end (real Coral data, real claude, real scoped output, real staged file — see
the `feat: instruction + review-staging` row below). Supermemory Local remains unverified — no
binary on this machine.** See "What's NOT done" at the bottom before assuming the write path works
end-to-end.

---

## Commit-by-commit

| Commit | What it added |
|---|---|
| `chore: scaffold repo` | `git init`, MIT `LICENSE`, `.gitignore`, `package.json`, `tsconfig.json`, `vitest.config.ts`. Two Phase-0 docs written blind: `docs/api-verification.md` (best-guess endpoint paths, all marked UNVERIFIED) and `docs/linux-test-checklist.md` (the ordered live-verification steps deferred to Linux). |
| `feat: config + state with tests` | `src/config.ts` (resolves `SUPERMEMORY_API_KEY`/`SUPERMEMORY_BASE_URL` from env → `~/.supermemory/env`), `src/state.ts` (`~/.curator/state.json` cursor storage). 8 tests. |
| `feat: supermemory ops layer` | `src/supermemory/client.ts` + `src/supermemory/ops.ts` — the single isolation boundary for every Supermemory Local call. Inspecting the real installed SDK's type defs corrected earlier doc-based guesses (search field is `q` not `query`; no SDK coverage for profile/review/mass-forget, so those go through raw `fetch`). 11 tests. |
| `feat: mcp server with 4 tools + cli entry` | `src/mcp/server.ts` (remember/recall/forget/get_profile via `@modelcontextprotocol/sdk`, dry-run forced true unless explicitly `false`), `src/cli.ts` (commander: `mcp`/`status`/`sync`/`connect`/`ui`). Verified via an in-memory MCP Client↔Server handshake — real tool listing and invocation, no live server needed. 5 tests. |
| `feat: raw sync + mapping with fixture tests` | `src/sync/mapping.ts` (pure row→memory mapper) + `src/sync/raw.ts` (deterministic `sync --raw`: cursor → Coral SQL → map → remember → advance cursor). Idempotency proven against fixture rows with Coral/Supermemory both mocked. 8 tests. |
| `feat: agent sync scaffolding` | `src/sync/prompt.ts` (sync-agent prompt template + `CURSOR=` parser) + `src/sync/agent.ts` (mcp-config generation, spawn wrapper, timeout). Cursor-advance/keep-old logic tested against a fake child process; the real binary invocation is UNVERIFIED. 10 tests. |
| `feat: connect command` | `src/connect.ts` — thin wrapper around `coral source add --interactive <source>`, stdio inherited so Coral's own wizard reaches the terminal. 4 tests. |
| `feat: ui backend proxy` | `src/ui/server.ts` — plain `node:http` handler: `GET /api/memories`, `GET /api/review` (degrades to `{supported:false}` instead of 500), `POST /api/review/:id`, `POST /api/forget` (dry-run forced true unless explicit `false`). Real HTTP round-trip tests against an ephemeral port. 7 tests. |
| `feat: console frontend` | `src/ui/app/` — Vite + React SPA: `MemoryBrowser`, `ForgetConsole` (preview-then-confirm), `ReviewQueue` (renders nothing when unsupported). Tested via `react-dom/server`'s `renderToStaticMarkup` against fixture JSON — no jsdom/testing-library dependency needed. `ui/server.ts` extended to serve the built SPA as a static fallback with SPA-route fallback to `index.html`. 12 tests (9 component + 3 static-serving). |
| `feat: dual agent runtimes (claude -p / agy) + multi-source connect` | `src/sync/agent.ts` extended with an `AgentRuntime` type (`claude` \| `agy`), `buildAgentArgs` centralizing both invocations, `--agent`/`CURATOR_AGENT` selection. `src/connect.ts` extended with `connectSources()` for multi-source `curator connect github linear slack` (sequential, stops at first failure). `buildMcpConfig` now resolves the CLI path to absolute. 10 new tests. |
| `feat: verified agent runtimes live against coral, claude, and agy` | Coral/claude/agy found installed on Windows after all — whole tooling layer verified live. Corrections: claude dropped `--max-turns` (replaced with `--strict-mcp-config` + server-scoped `--allowedTools`); new `extractAgentText` unwraps claude's JSON `result` envelope; agy has no `--mcp-config`/`--output-format`, so new `writeAgyMcpConfig` merges Curator into `~/.gemini/antigravity-cli/mcp_config.json` (user entries preserved). Both runtimes pulled identical real GitHub PRs via Coral MCP and emitted parseable `CURSOR=` trailers. Curator's MCP passes A1 over real stdio. 6 new tests. |
| `feat: sync --instruction + human review staging (--review / --commit)` | Operator steering + pre-ingestion governance for agentic sync. `buildSyncPrompt` gains an optional FOCUS block (`--instruction` / `CURATOR_INSTRUCTION`). New `src/sync/staging.ts` (JSONL stage/read/clear); the MCP `remember` tool stages to `~/.curator/staged.jsonl` instead of writing when the spawned agent's mcp-config sets `CURATOR_REMEMBER_MODE=stage` (per-server `env` injection in `buildMcpConfig`, both runtimes). `curator sync --review` clears stale stagings, runs the agent in stage mode, parks the reported cursor as `agent-sync-pending` (live cursor untouched); `curator sync --commit` (`runCommit`) flushes staged memories through `ops.remember`, promotes the pending cursor, clears the stage file. Flag guards: `--review` rejects `--raw`; `--instruction` warned-ignored with `--raw`. **Verified live:** real `claude` + Coral run with an instruction stored exactly 1 scoped memory into the real stage file, skipped 49 out-of-scope PRs, and wrote nothing to Supermemory. 18 new tests. |
| `feat: status health probe + staged preview + WSL test guide` | Prep for the live-Supermemory phase (server itself deliberately NOT installed yet — user runs that on WSL per the guide). `ops.checkHealth` (3s-timeout GET `/health`, never throws) wired into `curator status`, which now reports `Server: reachable/NOT reachable` and exits 1 when down. Review runs now print each staged memory (customId, tag, content) — no manual JSONL reading. New **Part 0 — WSL quickstart** in `docs/linux-test-checklist.md`: install in WSL2 Ubuntu (verified running on this machine), start server, bridge `~/.supermemory/env` from WSL to the Windows home dir, verify with `curator status`, then run Part A from Windows (WSL2 forwards localhost). 3 new tests. |
| `feat: suggestion layer + docs/usage.md feature guide` | New `src/sync/suggestions.ts`: curated per-source instruction suggestions (github/linear/slack/sentry/datadog/stripe + generic fallback), rendered as a dimmed ("translucent") ANSI block before any agentic sync run without `--instruction` and after `curator connect`. Deliberately hardcoded, not live-generated (deterministic-before-agentic); `getSuggestions()` is the single upgrade point for catalog-derived or LLM-generated tiers later. Plus `docs/usage.md`: the full feature & usage reference — config resolution, state files, every command and flag, MCP tool table, review workflow, runtime differences, verification-status pointers. 7 new tests. |

**Total: 14 commits, 109 passing tests across 13 test files, clean `tsc --noEmit` and `vite build`.**

---

## What works right now (verifiable without any external service)

- `pnpm build` — compiles the CLI/backend cleanly.
- `pnpm run build:ui` — builds the console SPA into `dist/ui/app`.
- `pnpm test` — 99 tests green.
- `node dist/cli.js --help` / `status` / `mcp` / `sync --raw` / `sync --agent <bad>` / `sync --raw --review` / `connect --help` — all fail or succeed with clean, actionable one-line messages, never a raw stack trace.
- The full review loop minus the final write: `curator sync --review --instruction "<focus>"` runs a real agent against real Coral data, stages scoped proposals to `~/.curator/staged.jsonl`, and leaves the live cursor untouched; `curator sync --commit` is the only step that needs Supermemory.
- The MCP server's tool surface (4 tools, dry-run-by-default forget) is verified via a real in-process MCP handshake.
- The UI backend's routes are verified via real HTTP requests against an ephemeral port.
- The console components render correctly against fixture data shaped like the (unverified) API responses.

## What's NOT done — do not assume these work

- **No real Supermemory Local has ever been reached.** Every endpoint path and payload shape in
  `src/supermemory/ops.ts` is a best guess, marked `STATUS: UNVERIFIED` in
  `docs/api-verification.md` §1–§9. (Coral, `claude`, and `agy` ARE now verified live — §11.)
- The full write path (agent → curator `remember` → Supermemory Local) and acceptance tests A2–S1
  (`docs/implementation-plan.md` §7) have **not** been run — they require the live memory engine.
  A1 (MCP handshake, 4 tools) HAS passed over real stdio. `curator sync --commit` (the staged-flush
  write path) fails with a clean connection error here, as expected with no server.
- The memory-graph embed (`@supermemory/memory-graph`) is deferred — cut line 1, never started.
- GitHub is the only wired-up Coral source for `sync --raw`; Linear/Slack/etc. are documented but not implemented in the mapping/raw-sync path.
- The exact env var name Supermemory Local's installer writes (`SUPERMEMORY_API_KEY` is a guess) is unconfirmed.

## Next step

Follow `docs/linux-test-checklist.md` **Part 0** (WSL quickstart) to install and start
`supermemory-server` inside WSL2 Ubuntu, bridge the env file to Windows, and confirm with
`node dist/cli.js status`. Then run Part A steps 1–5 (the Supermemory endpoint probes — steps 6–7
are already verified). Corrections land in exactly one file: `src/supermemory/ops.ts`. Then proceed
to acceptance tests A2 → S1 in order (A1 already passes).
