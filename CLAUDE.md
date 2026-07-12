# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repo is in the **planning phase** — it contains only `docs/` with the full spec for **Curator**, a Supermemory Local hackathon project (solo entry, hard deadline July 13, 23:59 PST). No code has been written yet and the directory is not yet a git repository; Phase 0 of the roadmap includes `git init`, first commit, MIT license, and `.gitignore`.

## What Curator is

A single TypeScript CLI (`curator`) that adds three missing layers to the Supermemory Local binary running on `localhost:6767`:

1. **MCP server** (`curator mcp`) — stdio server via `@modelcontextprotocol/sdk` exposing exactly four tools: `remember`, `recall`, `forget` (dry-run defaults to TRUE; deletion requires explicit `dryRun:false`), `get_profile`. Credentials auto-discovered from `~/.supermemory/env`.
2. **Governance console** (`curator ui`) — Vite + React SPA served by a small local HTTP server that proxies the Supermemory API (the key never reaches the browser): memory browser with history, review queue, forget console with dry-run preview.
3. **Agentic sources** (`curator connect` / `curator sync`) — data pulled from GitHub/Linear/Slack via the Coral SQL runtime; `curator sync` spawns headless `claude -p` armed with both Coral's MCP (read) and Curator's own MCP (write). `curator sync --raw` is the deterministic no-agent fallback — **build it first**.

Unifying idea: agents ingest autonomously, humans supervise. Everything stays on the machine.

## The four docs and reading order

Read in this order: `docs/context.md` → `docs/plan.md` → `docs/roadmap.md` → `docs/implementation-plan.md`.

- `docs/context.md` — why, hackathon rules, positioning, success criteria.
- `docs/plan.md` — full spec: gap analysis, architecture, tech stack, demo script, risks. The design authority.
- `docs/roadmap.md` — phased milestones with acceptance gates and pre-committed cut lines.
- `docs/implementation-plan.md` — agent-executable build instructions: repo tree, module specs, tool schemas, sync-agent prompt template, ordered acceptance tests.

Note: the docs cross-reference each other as `PROJECT.md`, `ROADMAP.md`, `IMPLEMENTATION.md`, and `CONTEXT.md` — those names map to `plan.md`, `roadmap.md`, `implementation-plan.md`, and `context.md` respectively.

## Planned stack and commands

TypeScript, Node 20+, ESM, pnpm (npm fallback). CLI via plain `commander` (no framework), tests via `vitest` (nothing heavier), UI via Vite + React with minimal dependencies. No ORM. Supermemory access through the official `supermemory` npm SDK with `baseURL: http://localhost:6767`. Target repo layout is specified in `docs/implementation-plan.md` §2.

Once scaffolded, run a single test with `pnpm vitest run test/<name>.test.ts`.

## Hard rules from the spec

- **Verify, don't assume:** Supermemory Local endpoint paths/payloads MUST be confirmed against the live local server and the OpenAPI spec (`https://api.supermemory.ai/v3/openapi`) before use — docs describe the hosted platform and the local binary may differ. Record findings in `docs/api-verification.md`. Phase 0 gates (review-queue/history endpoint support) decide console scope; do not discover gaps on Day 2.
- **Commit discipline:** small conventional commits (`feat:`, `fix:`, `docs:`, `chore:`) after every passing acceptance test. Never squash — judges audit commit history for fresh work.
- **Scope control:** do not add features beyond the implementation plan. If blocked >30 min on a stretch item, apply the cut lines. Cut order: (1) memory-graph embed, (2) agentic sync (keep `--raw`), (3) second Coral source. **Never cut:** the MCP server, the review queue, dry-run forget.
- **Deterministic before agentic:** `sync --raw` before agent sync; direct API calls before UI. Every phase must end in a demoable state.
- **Out of scope (do not build):** auth/multi-user, hosted deployment, OAuth connectors, webhook receivers, scheduler/cron UI, npm publishing before the deadline, Windows support, write-paths into Coral sources.
- **Positioning:** call the ingestion feature "agentic sources," never "connectors" — connectors are the sponsor's paid platform feature and the framing matters to judges (see `docs/context.md` §5).
- `.gitignore` must cover `.env*`; never write `~/.supermemory/env` contents into the repo or logs.

## Acceptance tests

`docs/implementation-plan.md` §7 defines the ordered acceptance tests (A1–S1) that gate each phase — e.g. A1: MCP handshake via `npx @modelcontextprotocol/inspector` lists 4 tools; C1: `curator sync --raw` twice is idempotent. Each must pass before the next phase begins.
