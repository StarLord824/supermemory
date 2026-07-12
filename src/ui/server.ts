import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type Supermemory from "supermemory";
import { resolveConfig, type CuratorConfig } from "../config.js";
import { createClient } from "../supermemory/client.js";
import {
  forgetById,
  forgetByPrompt,
  listEntriesWithHistory,
  listInferred,
  reviewInferred,
  type ReviewAction,
} from "../supermemory/ops.js";

const DEFAULT_CONTAINER_TAG = "curator_default";

export interface UiServerDeps {
  config: CuratorConfig;
  client: Supermemory;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Builds the request handler for `curator ui`'s JSON API. All Supermemory
 * access goes through src/supermemory/ops.ts — the key never reaches the
 * browser since this handler runs server-side and the SPA only talks to
 * these routes.
 */
export function createUiRequestHandler(deps: UiServerDeps) {
  return async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");

    try {
      if (req.method === "GET" && url.pathname === "/api/memories") {
        const tag = url.searchParams.get("tag") ?? DEFAULT_CONTAINER_TAG;
        const result = await listEntriesWithHistory(deps.client, [tag]);
        return sendJson(res, 200, result);
      }

      if (req.method === "GET" && url.pathname === "/api/review") {
        const tag = url.searchParams.get("tag") ?? DEFAULT_CONTAINER_TAG;
        try {
          const result = await listInferred(deps.config, tag);
          return sendJson(res, 200, { supported: true, ...result });
        } catch {
          // Per docs/implementation-plan.md §6: render only if Local supports
          // this endpoint; otherwise the console omits the tab rather than
          // showing dead UI.
          return sendJson(res, 200, { supported: false, memories: [], total: 0 });
        }
      }

      if (req.method === "POST" && url.pathname.startsWith("/api/review/")) {
        const id = decodeURIComponent(url.pathname.slice("/api/review/".length));
        const tag = url.searchParams.get("tag") ?? DEFAULT_CONTAINER_TAG;
        const body = await readJsonBody(req);
        const action = body.action as ReviewAction;
        if (!["approve", "decline", "undo"].includes(action)) {
          return sendJson(res, 400, { error: "action must be one of approve|decline|undo" });
        }
        const result = await reviewInferred(deps.config, tag, id, action);
        return sendJson(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/api/forget") {
        const body = await readJsonBody(req);
        const target = body.target as string;
        const mode = body.mode as "id" | "prompt";
        const containerTag = (body.containerTag as string) ?? DEFAULT_CONTAINER_TAG;
        // Curator-level safety default: dryRun defaults TRUE unless the
        // caller explicitly sends dryRun:false (mirrors the MCP forget tool).
        const dryRun = body.dryRun !== false;

        if (mode === "id") {
          if (dryRun) {
            return sendJson(res, 200, {
              dryRun: true,
              note: "dryRun:true with mode:'id' previews nothing extra — send dryRun:false to delete.",
              id: target,
            });
          }
          const result = await forgetById(deps.client, { id: target, containerTag });
          return sendJson(res, 200, result);
        }

        const result = await forgetByPrompt(deps.config, { query: target, containerTag, dryRun });
        return sendJson(res, 200, result);
      }

      sendJson(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
  };
}

export async function startUiServer(port: number): Promise<void> {
  const config = resolveConfig();
  const client = createClient(config);
  const handler = createUiRequestHandler({ config, client });
  const server = createServer((req, res) => {
    void handler(req, res);
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  console.log(`Curator console listening on http://localhost:${port}`);
}
