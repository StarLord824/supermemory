import { rawRequest } from "./client.js";
import type { CuratorConfig } from "../config.js";

/**
 * Every Supermemory Local endpoint Curator depends on is called from exactly
 * this file, via raw fetch against paths confirmed live on server-v0.0.5's
 * own OpenAPI spec (`GET /v4/openapi` on the running server) — not the
 * `supermemory` npm SDK, which targets the hosted platform. See
 * docs/api-verification.md §12 for the full verified contract of each call.
 */

export interface HealthResult {
  reachable: boolean;
  detail: string;
}

// SOURCE: live GET / on server-v0.0.5 (2026-07-16) — confirmed 200, serves an
// HTML landing page. There is no dedicated /health path on Local (confirmed
// absent from the live OpenAPI spec) — root is the best available liveness
// signal. See docs/api-verification.md §12.
export async function checkHealth(config: CuratorConfig): Promise<HealthResult> {
  try {
    const res = await fetch(config.baseUrl, { signal: AbortSignal.timeout(3000) });
    return res.ok
      ? { reachable: true, detail: `HTTP ${res.status}` }
      : { reachable: false, detail: `HTTP ${res.status}` };
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

const CUSTOM_ID_INVALID_CHARS = /[^a-zA-Z0-9_:-]/g;

/**
 * Supermemory Local rejects customId values containing anything outside
 * `[a-zA-Z0-9_:-]` (CONFIRMED live 2026-07-16 — a real sync run produced
 * `github:pr:medullabs-code/Medullabs#188`, which 400'd on the `/` and `#`).
 * Sources like GitHub PR/issue identifiers naturally contain `/` and `#`, so
 * rather than trust every caller (agent prompts, raw sync mapping) to avoid
 * them, remember() sanitizes defensively here — one bad id from an agent
 * should never fail a whole batch commit.
 */
export function sanitizeCustomId(customId: string): string {
  return customId.replace(CUSTOM_ID_INVALID_CHARS, "-");
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST /v3/documents
// (operationId postV3Documents) — CONFIRMED 2026-07-16, exact match to the
// original hosted-doc guess. See docs/api-verification.md §12.
export async function remember(
  config: CuratorConfig,
  input: RememberInput,
): Promise<RememberResult> {
  return rawRequest<RememberResult>(config, "/v3/documents", {
    method: "POST",
    body: {
      content: input.content,
      containerTag: input.containerTag ?? "curator_default",
      customId: input.customId ? sanitizeCustomId(input.customId) : undefined,
      metadata: input.metadata,
    },
  });
}

export interface RecallInput {
  query: string;
  containerTag?: string;
  limit?: number;
}

export interface RecallResultItem {
  id: string;
  memory?: string;
  chunk?: string;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
  similarity: number;
  version: number | null;
  context?: Record<string, unknown>;
}

export interface RecallResult {
  results: RecallResultItem[];
  total: number;
  timing: number;
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST /v4/search
// ("Search memory entries - Low latency for conversational", operationId
// postV4Search) — CONFIRMED 2026-07-16. Corrects the earlier guess: /v3/search
// is document-chunk search, NOT memory search — /v4/search is the real one.
// Query field is `q`. See docs/api-verification.md §12.
export async function recall(config: CuratorConfig, input: RecallInput): Promise<RecallResult> {
  return rawRequest<RecallResult>(config, "/v4/search", {
    method: "POST",
    body: {
      q: input.query,
      containerTag: input.containerTag,
      limit: input.limit,
    },
  });
}

export interface ProfileResult {
  profile: {
    static: string[];
    dynamic: string[];
    buckets: Record<string, string[]>;
  };
  searchResults?: {
    results: unknown[];
    total: number;
    timing: number;
  };
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST /v4/profile
// (operationId postV4Profile) — CONFIRMED 2026-07-16, exact match to the
// original hosted-doc guess (POST, containerTag required). See
// docs/api-verification.md §12.
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

// SOURCE: live GET /v4/openapi on server-v0.0.5, path DELETE /v4/memories
// (operationId deleteV4Memories, "Forget a memory") — CONFIRMED 2026-07-16.
// Body: {id?, content?, containerTag(required), reason?}. See
// docs/api-verification.md §12.
export async function forgetById(
  config: CuratorConfig,
  input: { id: string; containerTag: string; reason?: string },
): Promise<ForgetByIdResult> {
  return rawRequest<ForgetByIdResult>(config, "/v4/memories", {
    method: "DELETE",
    body: { id: input.id, containerTag: input.containerTag, reason: input.reason },
  });
}

export interface ForgetByPromptInput {
  query: string;
  containerTag: string;
  /**
   * Curator-level safety default: TRUE unless the caller explicitly passes
   * false. The server's own confirmed default is false — Curator never
   * forwards an absence of this flag as false. See docs/api-verification.md §12.
   */
  dryRun?: boolean;
  reason?: string;
}

export interface ForgetCandidate {
  id: string;
  memory: string;
  score: number;
}

export interface ForgetByPromptResult {
  dryRun: boolean;
  count: number;
  forgetBatchId: string | null;
  summary: string;
  candidates?: ForgetCandidate[];
  forgotten?: ForgetCandidate[];
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST
// /v4/memories/forget-matching (operationId postV4MemoriesForgetMatching) —
// CONFIRMED 2026-07-16, exact match to the original hosted-doc guess
// including the unsafe server-side dryRun default of false. See
// docs/api-verification.md §12.
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

export interface MemoryHistoryEntry {
  id: string;
  memory: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  parentMemoryId: string | null;
  rootMemoryId: string | null;
  isLatest: boolean;
  isForgotten: boolean;
}

export interface MemoryEntryWithHistory {
  id: string;
  memory: string;
  version: number;
  isLatest: boolean;
  isForgotten: boolean;
  isStatic: boolean;
  isInference: boolean | null;
  createdAt: string;
  updatedAt: string;
  spaceId: string;
  orgId: string;
  sourceCount: number;
  parentMemoryId: string | null;
  rootMemoryId: string | null;
  forgetAfter: string | null;
  forgetReason: string | null;
  metadata: Record<string, unknown> | null;
  /** Relation labels (updates/extends/derives) keyed by related memory id. */
  memoryRelations: Record<string, "updates" | "extends" | "derives"> | null;
  temporalContext: Record<string, unknown> | null;
  history: MemoryHistoryEntry[];
  documentIds: string[];
}

export interface ListEntriesWithHistoryResult {
  memoryEntries: MemoryEntryWithHistory[];
  pagination: {
    currentPage: number;
    totalItems: number;
    totalPages: number;
    limit?: number;
  };
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST /v4/memories/list
// (operationId postV4MemoriesList, "List memory entries with history") —
// CONFIRMED 2026-07-16, exact path match to the original guess. CORRECTION:
// the response key is `memoryEntries`, not `memories` as originally assumed.
// Version-chain fields (isLatest, isForgotten, memoryRelations with
// updates/extends/derives, history[]) are all present as hoped. See
// docs/api-verification.md §12.
export async function listEntriesWithHistory(
  config: CuratorConfig,
  containerTags: string[],
): Promise<ListEntriesWithHistoryResult> {
  return rawRequest<ListEntriesWithHistoryResult>(config, "/v4/memories/list", {
    method: "POST",
    body: { containerTags },
  });
}

/** A document record as returned by /v3/documents/list. */
export interface DocumentRecord {
  id: string;
  title: string | null;
  summary: string | null;
  status: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  customId?: string | null;
  url?: string | null;
  connectionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListDocumentsResult {
  /**
   * NOTE: the response key really is `memories`, even though these are
   * documents — confirmed from the live server's own OpenAPI spec, not a typo.
   */
  memories: DocumentRecord[];
  pagination: {
    currentPage: number;
    totalItems: number;
    totalPages: number;
    limit?: number;
  };
}

// SOURCE: live GET /v4/openapi on server-v0.0.5, path POST /v3/documents/list
// (operationId postV3DocumentsList, "List documents") — path/response CONFIRMED
// 2026-07-17. The `containerTags` request param is marked deprecated/hidden on
// THIS endpoint (unlike /v4/memories/list) — STATUS: UNVERIFIED whether it
// actually filters; Task 2's join is defensive either way. See
// docs/api-verification.md §14.
export async function listDocuments(
  config: CuratorConfig,
  containerTag: string,
): Promise<ListDocumentsResult> {
  return rawRequest<ListDocumentsResult>(config, "/v3/documents/list", {
    method: "POST",
    body: { containerTags: [containerTag], limit: 200 },
  });
}

export interface InferredMemory {
  id: string;
  memory: string;
  parentCount: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown> | null;
}

// SOURCE: https://supermemory.ai/docs/memory-review.md — STATUS: CONFIRMED
// ABSENT from the live OpenAPI spec on server-v0.0.5 (2026-07-16): no
// /v3/container-tags/{tag}/inferred path exists. This function will always
// fail; callers must treat that as "review queue unsupported on Local", which
// src/ui/server.ts already does (degrades to {supported:false}). See
// docs/api-verification.md §12 and §7.
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

// SOURCE: https://supermemory.ai/docs/memory-review.md — STATUS: CONFIRMED
// ABSENT from the live OpenAPI spec on server-v0.0.5, same as listInferred
// above. See docs/api-verification.md §12 and §8.
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
