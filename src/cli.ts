#!/usr/bin/env node
import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveConfig } from "./config.js";
import { createClient } from "./supermemory/client.js";
import { createMcpServer } from "./mcp/server.js";

const program = new Command();

program.name("curator").description("MCP server, governance console, and agentic sources for Supermemory Local");

program
  .command("mcp")
  .description("Run the stdio MCP server exposing remember/recall/forget/get_profile")
  .action(async () => {
    try {
      const config = resolveConfig();
      const client = createClient(config);
      const server = createMcpServer(client, config);
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("status")
  .description("Print resolved (redacted) configuration")
  .action(() => {
    try {
      const config = resolveConfig();
      console.log(`Supermemory base URL: ${config.baseUrl}`);
      console.log(`API key: ${config.apiKey.slice(0, 4)}${"*".repeat(Math.max(config.apiKey.length - 4, 0))}`);
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
    "--review",
    "Stage the agent's proposed memories for human review instead of writing them; preview, then `curator sync --commit`",
  )
  .option("--commit", "Write memories previously staged via --review into Supermemory Local")
  .action(async (opts: {
    raw?: boolean;
    agent?: string;
    instruction?: string;
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
        const { runRawSync } = await import("./sync/raw.js");
        await runRawSync();
        return;
      }

      const { runAgentSync } = await import("./sync/agent.js");
      await runAgentSync({
        runtime: opts.agent,
        instruction: opts.instruction,
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

program.parseAsync(process.argv);
