# Curator — Context Document

**Purpose of this doc:** everything an incoming teammate or build agent needs to understand *what we're doing and why* before opening `ROADMAP.md` or `IMPLEMENTATION.md`. Read this first.

---

## 1. What this project is

**Curator** is a 3-day hackathon submission for the **Supermemory Local "localhost:6767"** hackathon. It is a single CLI + local web console that gives the Supermemory Local binary the three things that only exist on Supermemory's hosted platform today:

1. **An MCP interface** so any MCP-capable AI client (Claude Desktop, Cursor, Windsurf, etc.) can use the local memory engine.
2. **A governance console** where a human can browse, review, and forget memories that agents have written.
3. **Agentic sources** — a headless agent uses **Coral** (a local-first SQL-over-APIs runtime) to pull data from developer tools like GitHub, Linear, and Slack, and stores curated memories via Curator's own MCP server.

The unifying idea: **agents ingest autonomously, humans supervise.** Nothing leaves the machine.

See `PROJECT.md` for the full spec, verified gap analysis, and positioning nuances.

## 2. The hackathon we're building for

Extracted from the official brief (Notion + Discord):

- **Name:** Supermemory Local Hackathon (a.k.a. `localhost:6767`).
- **Format:** 5-day async online hackathon, run through the Supermemory Discord.
- **Build window:** July 9–13, 2025.
- **Hard deadline:** **Sunday, July 13 · 23:59 PST**, "anywhere on earth" clock.
- **Team size:** 1–4. **We are going solo.**
- **Prizes:** 🥇 $500 · 🥈 $100 · 🥉 $50 · ⭐ People's Choice $50. All winners also get $1,000 in Supermemory credits for 3 months.
- **Voting:** community reacts 🏆 on projects in `#project-showcase`; the People's Choice prize is community-decided.

### Rules that constrain us

1. Project must **meaningfully use Supermemory Local.** (Curator uses it as the memory engine and exercises breadth of its API — see `PROJECT.md` §6.)
2. **Fresh work only** — code must be written during the build window. Boilerplate and existing libraries are fine; pre-built products rebadged are not. **They check commit history**, so we commit early and often from Day 1.
3. **Public GitHub repo** required.
4. **Demo video** required, **max 3 minutes**.
5. **One submission per team.**
6. Supermemory employees/contractors are ineligible (not relevant to us).
7. By submitting, we grant Supermemory the right to feature the project on their socials and showcase page with credit.

### Submission checklist (both mandatory, both by the deadline)

- [ ] **Google Form** (this is the official entry judges score from — no form, no entry).
- [ ] **`#project-showcase` post** on Discord using the pinned template: project name, one-line pitch, team, repo link, demo video link, and "how it uses Supermemory Local" in 3–5 sentences.

## 3. What Supermemory Local is (for anyone who hasn't used it)

A single self-contained binary (`supermemory-server`) that runs the same memory engine as Supermemory's hosted platform — ingestion, memory extraction, hybrid semantic search, user profiles, container tags, agentic mass-forget with dry-run — on your machine at `http://localhost:6767`. Install: `curl -fsSL https://supermemory.ai/install | bash`, run: `supermemory-server`. Embeddings are local; you bring an LLM (any OpenAI-compatible endpoint — cloud or Ollama). It's open source.

**Documented gaps vs. the hosted platform** (from Supermemory's own Local-vs-Platform table, both marked "—" for self-hosted):
- **MCP server** — hosted-only.
- **Connectors** (Drive, Gmail, Notion, OneDrive, GitHub, Granola, web crawler) — hosted-only.

These two gaps are our project's reason for existing.

## 4. Our intentions and goals

**Primary goal:** win a prize by shipping a polished, focused, well-demoed project that fills real gaps in the sponsor's own product.

**Prize-specific strategy:**
- **1st place** ($500) needs a strong, novel, judge-legible contribution. Curator's edge is the *integrated stack* (MCP + governance + agentic sources), not any single component.
- **People's Choice** ($50 + reputation) needs a demo people re-share. The "ask Claude → agent remembered → decline a wrong memory → forget everything about X → Claude no longer knows" loop is our shareable moment.
- **Supermemory credits** are a nice consolation regardless of placement.

**Secondary goals** (only if they don't cost primary goal work):
- Ship something we'd actually use after the hackathon.
- Get a Supermemory-team retweet by giving them a project that flatters their product strategy.
- Publish clean code Coral's maintainers might notice.

## 5. Positioning (do not skip — this is delicate)

Two framing choices we've made deliberately:

**a) Call the ingestion component "agentic sources," not "connectors."** Connectors are a paid, flagship, monetized platform feature for Supermemory. Pitching a free clone of their premium capability reads badly to their own judges. Curator's design is genuinely different — developer/enterprise sources rather than office/consumer, agent-driven pull rather than webhook push — and the framing should make that difference obvious.

**b) Position Curator as filling gaps *in* Supermemory Local, not competing with the hosted platform.** Every claim in the README and demo should be traceable to the sponsor's own comparison table. We are helping their story, not undercutting it.

## 6. Constraints (build against these, not around them)

**Time.** Effectively ~3 working days including recording and submission. Any hour lost to yak-shaving is not recovered. Cut lines are pre-committed in `ROADMAP.md` §Guiding constraints.

**Solo.** One person, one head, no parallelism. Everything scoped to what one developer can ship and demo confidently.

**Non-determinism budget.** The demo depends on an LLM-driven curation agent. Every agentic path must have a deterministic `--raw` fallback so the demo never depends on a lucky sampling.

**Local-first.** No hosted services in the critical path. Cloud LLMs for extraction are acceptable (Supermemory Local requires one), but everything else — memory storage, embeddings, sources, credentials — runs on the machine.

**Commit history.** Judges audit it. Every meaningful change is a small, conventional-format commit, from Phase 0 onward.

**Secrets discipline.** No API keys, tokens, or `~/.supermemory/env` contents in the repo, in logs, or in screen recordings. `.gitignore` covers `.env*`; the demo video is checked before upload.

**Fresh code rule.** Curator's original contribution is the CLI, MCP server, governance console, agent orchestration, and glue. Supermemory (SDKs, memory-graph component), Coral, and the MCP TypeScript SDK are dependencies, credited explicitly. Rebadging any of them would be disqualifying.

## 7. Success criteria

**Minimum shippable** (must be true by end of Day 3 afternoon):
- Google Form submitted; #showcase post published; both before 18:00 local, not at 23:58.
- Repo public, README quickstart reproducible on a fresh machine.
- Demo video ≤3 minutes shows: Claude Desktop remembering via Curator's MCP → GitHub data flowing in via `sync --raw` → console browsing memories → forget with dry-run preview → confirmed deletion → Claude no longer knows.

**Prize-competitive** (target — everything above plus):
- Agentic sync (`curator sync` without `--raw`) works reliably enough to headline the demo.
- Review queue for low-confidence inferred memories in the console (only if Phase 0 confirms local support).
- Memory-graph visualization embedded.
- README clearly credits Supermemory Local, Coral, and memory-graph, with the sponsor-facing framing from §5.

## 8. What we are explicitly NOT doing

- Not competing with SMFS (Supermemory's grep-able memory filesystem — different paradigm).
- Not rebuilding hosted connectors (Drive/Gmail/Notion) — see §5.
- Not shipping OAuth, multi-user auth, cloud deployment, Windows support, or a scheduler UI.
- Not competing with the official coding-plugin ecosystem (Claude Code, Codex, OpenCode) — Curator serves the *other* clients (Claude Desktop, Cursor, Windsurf).
- Not publishing to npm before the deadline (avoids account/publish yak-shaving).

## 9. How the three docs relate

- **CONTEXT.md** (this file) — *why* we're doing this and under what constraints. Read once.
- **PROJECT.md** — the full spec: verified gap analysis, three components, architecture, tech stack, APIs used, pre-existence analysis, demo script, risk register. The design authority.
- **ROADMAP.md** — the *when*: phased milestones with acceptance gates and pre-committed cut lines.
- **IMPLEMENTATION.md** — the *how*: agent-executable build instructions with repo tree, module specs, tool schemas, the sync-agent prompt template, and ordered acceptance tests.

**Reading order for a build agent:** CONTEXT → PROJECT §1-3 (pitch + gaps + solution) → ROADMAP → IMPLEMENTATION, then execute.

## 10. Key resources

- Supermemory Local install & docs: `https://supermemory.ai/docs/self-hosting/overview`, `.../quickstart`
- Local-vs-Platform table (the source of our gap claims): same overview page
- Full docs index: `https://supermemory.ai/docs/llms.txt`
- OpenAPI spec (verify actual endpoints against this): `https://api.supermemory.ai/v3/openapi`
- Supermemory GitHub (memory engine + hosted MCP source): `https://github.com/supermemoryai/supermemory`
- Memory-graph React component (may embed in console): `https://www.npmjs.com/package/@supermemory/memory-graph`
- Coral (agentic sources layer): `https://github.com/withcoral/coral`, `https://withcoral.com/docs`
- Supermemory Discord (announcements, showcase, office hours): `https://discord.com/invite/WtkvM62fHK`
- Google Form (submission — mandatory): from Discord `#announcements` (the brief lists two form URLs; use the one in the pinned #announcements message as authoritative)