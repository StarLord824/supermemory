import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CuratorConfig } from "../config.js";
import {
  forgetById,
  forgetByPrompt,
  getProfile,
  recall,
  remember,
} from "../supermemory/ops.js";
import { stageMemory } from "../sync/staging.js";

const DEFAULT_CONTAINER_TAG = "curator_default";

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

/** Wraps a tool handler so failures surface as actionable MCP tool errors, never stack traces. */
function withErrorHandling<T>(fn: () => Promise<T>) {
  return fn().then(textResult).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    return errorResult(
      `${message}\n\nIs Supermemory Local running on ${process.env.SUPERMEMORY_BASE_URL ?? "http://localhost:6767"}?`,
    );
  });
}

export function createMcpServer(config: CuratorConfig): McpServer {
  const server = new McpServer({ name: "curator", version: "0.1.0" });

  server.registerTool(
    "remember",
    {
      description:
        "Save durable facts, decisions, and context the user or a source provides. Use this when the user shares information worth recalling later, not for transient conversational filler.",
      inputSchema: {
        content: z.string().describe("The fact or context to remember"),
        containerTag: z
          .string()
          .optional()
          .describe(`Project/scope tag to store under (default '${DEFAULT_CONTAINER_TAG}')`),
        customId: z
          .string()
          .optional()
          .describe("Stable external id to enable dedup/update-in-place"),
        metadata: z.record(z.unknown()).optional().describe("Optional structured metadata"),
      },
    },
    async ({ content, containerTag, customId, metadata }) =>
      withErrorHandling<unknown>(() => {
        // Review mode (set by `curator sync --review` via the spawned agent's
        // mcp-config env): stage the proposed memory to a local file instead
        // of writing to Supermemory, so a human can preview before committing.
        if (process.env.CURATOR_REMEMBER_MODE === "stage") {
          const staged = stageMemory(
            { content, containerTag, customId, metadata },
            process.env.CURATOR_STAGE_FILE,
          );
          return Promise.resolve({ staged: true, ...staged });
        }
        return remember(config, { content, containerTag, customId, metadata });
      }),
  );

  server.registerTool(
    "recall",
    {
      description:
        "Search stored memories for information relevant to the current conversation. Use this before assuming you don't know something the user may have told you before.",
      inputSchema: {
        query: z.string().describe("What to search for"),
        containerTag: z.string().optional().describe("Project/scope tag to search within"),
        includeProfile: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to also fetch and include the user profile summary"),
        limit: z.number().optional().default(10).describe("Max results to return"),
      },
    },
    async ({ query, containerTag, includeProfile, limit }) =>
      withErrorHandling(async () => {
        const searchResult = await recall(config, { query, containerTag, limit });
        if (!includeProfile) return searchResult;
        const profile = await getProfile(config, containerTag).catch(() => null);
        return { ...searchResult, profile };
      }),
  );

  server.registerTool(
    "forget",
    {
      description:
        "Delete a memory by id, or agentically forget everything matching a natural-language prompt. ALWAYS defaults to a dry-run preview — you must pass dryRun:false explicitly to actually delete anything.",
      inputSchema: {
        target: z.string().describe("A memory id (mode:'id') or a natural-language description of what to forget (mode:'prompt')"),
        mode: z.enum(["id", "prompt"]).describe("Whether target is a memory id or a natural-language prompt"),
        containerTag: z
          .string()
          .optional()
          .default(DEFAULT_CONTAINER_TAG)
          .describe("Project/scope tag to operate within"),
        dryRun: z
          .boolean()
          .optional()
          .default(true)
          .describe("Preview only by default. Must be explicitly false to delete anything."),
      },
    },
    async ({ target, mode, containerTag, dryRun }) =>
      withErrorHandling(async () => {
        if (mode === "id") {
          if (dryRun) {
            return { dryRun: true, note: "dryRun:true with mode:'id' previews nothing extra — pass dryRun:false to delete.", id: target };
          }
          return forgetById(config, { id: target, containerTag: containerTag ?? DEFAULT_CONTAINER_TAG });
        }
        return forgetByPrompt(config, {
          query: target,
          containerTag: containerTag ?? DEFAULT_CONTAINER_TAG,
          dryRun,
        });
      }),
  );

  server.registerTool(
    "get_profile",
    {
      description: "Fetch the user/context profile summary for a given project scope.",
      inputSchema: {
        containerTag: z.string().optional().describe("Project/scope tag to fetch the profile for"),
      },
    },
    async ({ containerTag }) => withErrorHandling(() => getProfile(config, containerTag)),
  );

  return server;
}
