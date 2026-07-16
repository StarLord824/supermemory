import * as p from "@clack/prompts";
import pc from "picocolors";
import gradient from "gradient-string";

import { describeApiKey, resolveConfig } from "./config.js";
import { runAgentSync, AGENT_RUNTIMES } from "./sync/agent.js";
import { runRawSync } from "./sync/raw.js";
import { connectSources } from "./connect.js";
import { startUiServer } from "./ui/server.js";
import { checkHealth } from "./supermemory/ops.js";
import { getSuggestions } from "./sync/suggestions.js";

// Brand-family gradients for the two VERIFIED agent runtimes only. Anything
// added here must be a runtime that actually exists in AGENT_RUNTIMES and has
// been live-verified (see docs/api-verification.md) — no speculative CLIs.
const claudeColor = gradient("#D97757", "#C96442"); // Claude's terracotta
const agyColor = gradient("#6366f1", "#a855f7", "#ec4899"); // Antigravity blue→pink

export function formatAgent(agent: string): string {
  switch (agent) {
    case "claude":
      return claudeColor("claude (Claude Code)");
    case "agy":
      return agyColor("agy (Antigravity CLI)");
    default:
      return agent;
  }
}

/** Consistent cancel handling: every prompt that returns a cancel symbol ends here. */
function bail(): never {
  p.cancel("Operation cancelled.");
  process.exit(0);
}

export async function runInteractiveMenu(): Promise<void> {
  console.clear();
  p.intro(gradient("#a855f7", "#ec4899")(" Curator — Interactive Mode "));

  // Note: "Start MCP Server" is intentionally NOT offered here. The stdio MCP
  // transport uses stdout as the JSON-RPC wire, and this menu writes styled
  // banners to stdout — starting the server from here would corrupt the
  // protocol. MCP servers are spawned by clients via `curator mcp`, never
  // interactively.
  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "status", label: "Status Check", hint: "Probe the Supermemory server" },
      { value: "sync", label: "Sync Data", hint: "Run agentic or raw sync" },
      { value: "connect", label: "Connect Sources", hint: "Configure Coral integrations" },
      { value: "ui", label: "Start UI", hint: "Launch the governance console" },
    ],
  });
  if (p.isCancel(action)) bail();

  try {
    switch (action) {
      case "status": {
        const config = resolveConfig();
        const health = await checkHealth(config);
        const redacted = describeApiKey(config.apiKey);
        const lines = [
          `Supermemory base URL: ${pc.cyan(config.baseUrl)}`,
          `API key: ${pc.cyan(redacted)}`,
          health.reachable
            ? `Server: ${pc.green("reachable")} (${health.detail})`
            : `Server: ${pc.red("NOT reachable")} — ${health.detail}`,
        ];
        p.note(lines.join("\n"), "Status");
        if (!health.reachable) {
          p.outro(pc.yellow("Is supermemory-server running?"));
        } else {
          p.outro("Done.");
        }
        break;
      }

      case "sync": {
        const syncType = await p.select({
          message: "Which sync type?",
          options: [
            { value: "agent", label: "Agentic Sync", hint: "An agent curates memory" },
            { value: "raw", label: "Raw Sync", hint: "Deterministic, no agent" },
            { value: "commit", label: "Commit Staged", hint: "Write memories staged via review" },
          ],
        });
        if (p.isCancel(syncType)) bail();

        if (syncType === "commit") {
          p.outro("Committing staged memories…");
          const { runCommit } = await import("./sync/agent.js");
          await runCommit();
          break;
        }

        if (syncType === "raw") {
          p.outro("Running raw sync…");
          await runRawSync();
          break;
        }

        const agent = await p.select({
          message: "Select agent runtime:",
          options: AGENT_RUNTIMES.map((a) => ({ value: a, label: formatAgent(a) })),
        });
        if (p.isCancel(agent)) bail();

        // Show instruction ideas BEFORE prompting, so they're actionable —
        // the whole point of the suggestion layer. runAgentSync is told to
        // suppress its own (post-decision) print to avoid duplication.
        const sources = (process.env.CURATOR_SOURCES ?? "github").split(",").map((s) => s.trim());
        p.note(
          getSuggestions(sources)
            .map((s) => `• "${s}"`)
            .join("\n"),
          "Instruction ideas",
        );

        const instruction = await p.text({
          message: "Provide an instruction/focus for the agent (optional):",
          placeholder: "e.g. only merged PRs",
        });
        if (p.isCancel(instruction)) bail();

        const review = await p.confirm({
          message: "Stage for human review instead of writing directly?",
          initialValue: true,
        });
        if (p.isCancel(review)) bail();

        p.outro("Starting agentic sync…");
        await runAgentSync({
          runtime: agent,
          instruction: (instruction as string).trim() || undefined,
          review,
          suppressSuggestions: true,
        });
        break;
      }

      case "connect": {
        const sourcesStr = await p.text({
          message: "Enter sources to connect (comma or space separated):",
          placeholder: "github linear slack",
        });
        if (p.isCancel(sourcesStr)) bail();

        const sources = (sourcesStr as string)
          .split(/[ ,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (sources.length === 0) {
          p.cancel("No sources provided.");
          process.exit(0);
        }

        p.outro(`Connecting to: ${sources.join(", ")}…`);
        await connectSources(sources);
        break;
      }

      case "ui": {
        const portStr = await p.text({
          message: "Enter port to listen on:",
          initialValue: "4141",
          validate: (val) => {
            const n = Number(val);
            if (!Number.isInteger(n) || n < 1 || n > 65535) {
              return "Enter a valid port (1–65535).";
            }
            return undefined;
          },
        });
        if (p.isCancel(portStr)) bail();

        p.outro(`Starting UI on port ${portStr}…`);
        await startUiServer(Number(portStr));
        break;
      }
    }
  } catch (err) {
    p.cancel(pc.red(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  }
}
