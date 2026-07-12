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
  .action(async (opts: { raw?: boolean }) => {
    try {
      if (opts.raw) {
        const { runRawSync } = await import("./sync/raw.js");
        await runRawSync();
      } else {
        const { runAgentSync } = await import("./sync/agent.js");
        await runAgentSync();
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("connect")
  .argument("<source>", "Coral source to connect, e.g. github")
  .description("Wraps `coral source add --interactive <source>`")
  .action(async (source: string) => {
    try {
      const { connectSource } = await import("./connect.js");
      await connectSource(source);
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
