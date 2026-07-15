import type Supermemory from "supermemory";
import { rawRequest } from "./client.js";
import type { CuratorConfig } from "../config.js";

/**
 * Every Supermemory Local endpoint Curator depends on is called from exactly
 * this file. See docs/api-verification.md for the source of each path/payload
 * and its verification status (all UNVERIFIED against the real Local binary
 * until confirmed on Linux — see docs/linux-test-checklist.md).
 */

export interface HealthResult {
  reachable: boolean;
  detail: string;
}

// SOURCE: docs/implementation-plan.md §1 step 1 (`curl http://localhost:6767/health`)
// STATUS: UNVERIFIED — exact health path/response unconfirmed on Local; see docs/api-verification.md
export async function checkHealth(config: CuratorConfig): Promise<HealthResult> {
  try {
    const res = await fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.text().catch(() => "");
    return res.ok
      ? { reachable: true, detail: body.slice(0, 200) || `HTTP ${res.status}` }
      : { reachable: false, detail: `HTTP ${res.status} ${body.slice(0, 200)}` };
  } catch (err) {
    return {
      reachable: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface RememberInput {
  content: string;
  containerTag?: string;
  customId?: string;
  metadata?: Record<string, unknown>;
}

export interface RememberResult {
  id: string;
  status: string;
}

// SOURCE: node_modules/supermemory/resources/documents.d.ts (client.documents.add)
// matches docs/plan.md §6 "POST /v3/documents" — STATUS: UNVERIFIED, see docs/api-verification.md §1
export async function remember(
  client: Supermemory,
  input: RememberInput,
): Promise<RememberResult> {
  const result = await client.documents.add({
    content: input.content,
    containerTag: input.containerTag ?? "curator_default",
    customId: input.customId,
    metadata: input.metadata as never,
  });
  return { id: result.id, status: result.status };
}

export interface RecallInput {
  query: string;
  containerTag?: string;
  limit?: number;
}

export interface RecallResult {
  results: Array<{ documentId: string; score: number; title: string | null; content?: string | null }>;
  total: number;
}

// SOURCE: node_modules/supermemory/resources/search.d.ts (client.search.memories)
// confirms query field name is `q` — STATUS: UNVERIFIED response shape on Local, see docs/api-verification.md §2, §10
export async function recall(client: Supermemory, input: RecallInput): Promise<RecallResult> {
  const result = await client.search.memories({
    q: input.query,
    containerTag: input.containerTag,
    limit: input.limit,
  } as never);
  return result as unknown as RecallResult;
}

export interface ProfileResult {
  [key: string]: unknown;
}

// SOURCE: https://supermemory.ai/docs/api-reference/profiles/get-user-profile.md
// NOT covered by the installed SDK — raw fetch. STATUS: UNVERIFIED, see docs/api-verification.md §3, §10
export async function getProfile(
  config: CuratorConfig,
  containerTag?: string,
): Promise<ProfileResult> {
  return rawRequest<ProfileResult>(config, "/v4/profile", {
    method: "POST",
    body: { containerTag },
  });
}

export interface ForgetByIdResult {
  id: string;
  forgotten: boolean;
}

// SOURCE: node_modules/supermemory/resources/memories.d.ts (client.memories.forget)
// STATUS: UNVERIFIED, see docs/api-verification.md §5, §10
export async function forgetById(
  client: Supermemory,
  input: { id: string; containerTag: string; reason?: string },
): Promise<ForgetByIdResult> {
  const result = await client.memories.forget({
    id: input.id,
    containerTag: input.containerTag,
    reason: input.reason,
  });
  return result as unknown as ForgetByIdResult;
}

export interface ForgetByPromptInput {
  query: string;
  containerTag: string;
  /**
   * Curator-level safety default: TRUE unless the caller explicitly passes
   * false. The server's own documented default is false — Curator never
   * forwards an absence of this flag as false. See docs/api-verification.md §6.
   */
  dryRun?: boolean;
  reason?: string;
}

export interface ForgetByPromptResult {
  dryRun: boolean;
  count: number;
  forgetBatchId: string | null;
  summary: string;
  candidates: Array<{ id: string; memory: string; score: number }>;
}

// SOURCE: https://supermemory.ai/docs/api-reference/content-management/forget-memories-matching-a-promptquery.md
// NOT covered by the installed SDK — raw fetch. STATUS: UNVERIFIED, see docs/api-verification.md §6, §10
export async function forgetByPrompt(
  config: CuratorConfig,
  input: ForgetByPromptInput,
): Promise<ForgetByPromptResult> {
  const dryRun = input.dryRun !== false; // default TRUE — see interface doc above
  return rawRequest<ForgetByPromptResult>(config, "/v4/memories/forget-matching", {
    method: "POST",
    body: {
      query: input.query,
      containerTag: input.containerTag,
      dryRun,
      reason: input.reason,
    },
  });
}

export interface ListEntriesWithHistoryResult {
  memories: Array<Record<string, unknown>>;
  pagination?: Record<string, unknown>;
}

// SOURCE: node_modules/supermemory/resources/memories.d.ts (client.memories.list)
// STATUS: UNVERIFIED whether version-chain fields are present, see docs/api-verification.md §4, §10
export async function listEntriesWithHistory(
  client: Supermemory,
  containerTags: string[],
): Promise<ListEntriesWithHistoryResult> {
  const result = await client.memories.list({ containerTags });
  return result as unknown as ListEntriesWithHistoryResult;
}

export interface InferredMemory {
  id: string;
  memory: string;
  parentCount: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

// SOURCE: https://supermemory.ai/docs/memory-review.md
// NOT covered by the installed SDK — raw fetch. STATUS: UNVERIFIED, see docs/api-verification.md §7, §10
export async function listInferred(
  config: CuratorConfig,
  containerTag: string,
): Promise<{ memories: InferredMemory[]; total: number }> {
  return rawRequest(config, `/v3/container-tags/${encodeURIComponent(containerTag)}/inferred`, {
    method: "GET",
  });
}

export type ReviewAction = "approve" | "decline" | "undo";

export interface ReviewInferredResult {
  id: string;
  isInference: boolean;
  isForgotten: boolean;
  reviewStatus: "approved" | "declined" | null;
}

// SOURCE: https://supermemory.ai/docs/memory-review.md
// NOT covered by the installed SDK — raw fetch. STATUS: UNVERIFIED, see docs/api-verification.md §8, §10
export async function reviewInferred(
  config: CuratorConfig,
  containerTag: string,
  memoryId: string,
  action: ReviewAction,
): Promise<ReviewInferredResult> {
  return rawRequest(
    config,
    `/v3/container-tags/${encodeURIComponent(containerTag)}/inferred/${encodeURIComponent(memoryId)}/review`,
    { method: "POST", body: { action } },
  );
}
