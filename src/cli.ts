#!/usr/bin/env node
import { Command } from "commander";
import gradient from "gradient-string";
import pc from "picocolors";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { describeApiKey, resolveConfig } from "./config.js";
import { createMcpServer } from "./mcp/server.js";

const program = new Command();

// Same blue→purple family as the console's accent colors and the
// interactive menu's intro banner (src/interactive.ts) — one consistent
// visual identity across CLI, console, and interactive mode. Curator is a
// companion layer, not a fork or a competing product, so the banner always
// names Supermemory Local explicitly rather than standing alone.
const brandGradient = gradient("#3b82f6", "#a855f7");
function brandBanner(): string {
  return `${brandGradient("Curator")} ${pc.dim("— a companion layer for Supermemory Local (localhost:6767)")}`;
}

program.name("curator").description("MCP server, governance console, and agentic sources for Supermemory Local");
program.addHelpText("beforeAll", `${brandBanner()}\n`);

program
  .command("mcp")
  .description("Run the stdio MCP server exposing remember/recall/forget/get_profile")
  .action(async () => {
    try {
      const config = resolveConfig();
      const server = createMcpServer(config);
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("status")
  .description("Print resolved (redacted) configuration and probe the Supermemory Local server")
  .action(async () => {
    try {
      console.log(brandBanner());
      const config = resolveConfig();
      console.log(`Supermemory base URL: ${config.baseUrl}`);
      console.log(`API key: ${describeApiKey(config.apiKey)}`);

      const { checkHealth } = await import("./supermemory/ops.js");
      const health = await checkHealth(config);
      if (health.reachable) {
        console.log(`Server: reachable (${health.detail})`);
      } else {
        console.log(`Server: NOT reachable — ${health.detail}`);
        console.log("Is supermemory-server running? (WSL users: see docs/linux-test-checklist.md Part 0)");
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("sync")
  .description("Sync data from connected agentic sources into Supermemory Local")
  .option("--raw", "Deterministic sync: fixed Coral SQL query, no agent in the loop")
  .option(
    "--agent <runtime>",
    "Headless agent runtime to drive: claude (Claude Code) or agy (Antigravity CLI). Falls back to CURATOR_AGENT, then claude",
  )
  .option(
    "--instruction <text>",
    "Free-text focus for the agent: what kind of data to pull and prioritize. Falls back to CURATOR_INSTRUCTION",
  )
  .option(
    "--container <tag>",
    "Override the default per-source containerTag (src_{source}) so every memory this run stores lands in one fixed container. Falls back to CURATOR_CONTAINER",
  )
  .option(
    "--timeout <minutes>",
    "Override the 5-minute agent timeout — large/active repos can need longer. Falls back to CURATOR_TIMEOUT_MINUTES",
  )
  .option(
    "--review",
    "Stage the agent's proposed memories for human review instead of writing them; preview, then `curator sync --commit`",
  )
  .option("--commit", "Write memories previously staged via --review into Supermemory Local")
  .action(async (opts: {
    raw?: boolean;
    agent?: string;
    instruction?: string;
    container?: string;
    timeout?: string;
    review?: boolean;
    commit?: boolean;
  }) => {
    try {
      if (opts.commit) {
        const { runCommit } = await import("./sync/agent.js");
        await runCommit();
        return;
      }

      if (opts.raw) {
        if (opts.review) {
          throw new Error("--review applies to agentic sync only and can't be combined with --raw.");
        }
        if (opts.instruction) {
          console.warn("--instruction is ignored with --raw (raw sync runs a fixed query).");
        }
        if (opts.container) {
          console.warn("--container is ignored with --raw (raw sync uses the fixed src_{source} tag).");
        }
        const { runRawSync } = await import("./sync/raw.js");
        await runRawSync();
        return;
      }

      const { runAgentSync } = await import("./sync/agent.js");
      await runAgentSync({
        runtime: opts.agent,
        instruction: opts.instruction,
        container: opts.container,
        timeoutMinutes: opts.timeout ? Number(opts.timeout) : undefined,
        review: opts.review,
      });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("connect")
  .argument("<sources...>", "Coral source(s) to connect, e.g. github linear slack")
  .description("Wraps `coral source add --interactive <source>` for each source in turn")
  .action(async (sources: string[]) => {
    try {
      const { connectSources } = await import("./connect.js");
      await connectSources(sources);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("ui")
  .description("Serve the governance console")
  .option("--port <port>", "Port to listen on", "4141")
  .action(async (opts: { port: string }) => {
    try {
      const { startUiServer } = await import("./ui/server.js");
      await startUiServer(Number(opts.port));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("tags")
  .description("List container tags found in Supermemory Local (derived from the documents list — there is no native list-tags endpoint)")
  .action(async () => {
    try {
      const config = resolveConfig();
      const { listContainerTags } = await import("./supermemory/ops.js");
      const { formatTagsTable } = await import("./cli-format.js");
      const result = await listContainerTags(config);
      console.log(formatTagsTable(result.tags));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

if (process.argv.length <= 2) {
  // Interactive menu only makes sense on a real terminal. In a pipe/CI (no
  // TTY), a prompt would hang forever with nothing to answer it, so show help.
  if (process.stdin.isTTY) {
    const { runInteractiveMenu } = await import("./interactive.js");
    await runInteractiveMenu();
  } else {
    program.help();
  }
} else {
  program.parseAsync(process.argv);
}
