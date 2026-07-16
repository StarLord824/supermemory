export interface MemoryEntry {
  id: string;
  memory: string;
  isLatest: boolean;
  isForgotten: boolean;
  updatedAt: string;
  /** Relation labels (updates/extends/derives) keyed by related memory id. */
  memoryRelations: Record<string, "updates" | "extends" | "derives"> | null;
}

export interface MemoriesResponse {
  memoryEntries: MemoryEntry[];
  pagination?: Record<string, unknown>;
}

export interface InferredMemory {
  id: string;
  memory: string;
  parentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewResponse {
  supported: boolean;
  memories: InferredMemory[];
  total: number;
}

export interface ForgetPreview {
  dryRun: true;
  count?: number;
  summary?: string;
  candidates?: Array<{ id: string; memory: string; score: number }>;
  note?: string;
  id?: string;
}

export type ReviewAction = "approve" | "decline" | "undo";

export async function fetchMemories(tag: string): Promise<MemoriesResponse> {
  const res = await fetch(`/api/memories?tag=${encodeURIComponent(tag)}`);
  if (!res.ok) throw new Error(`Failed to load memories (${res.status})`);
  return res.json();
}

export async function fetchReview(tag: string): Promise<ReviewResponse> {
  const res = await fetch(`/api/review?tag=${encodeURIComponent(tag)}`);
  if (!res.ok) throw new Error(`Failed to load review queue (${res.status})`);
  return res.json();
}

export async function postReviewAction(tag: string, id: string, action: ReviewAction): Promise<void> {
  const res = await fetch(`/api/review/${encodeURIComponent(id)}?tag=${encodeURIComponent(tag)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(`Failed to ${action} memory (${res.status})`);
}

export async function previewForget(target: string, containerTag: string): Promise<ForgetPreview> {
  const res = await fetch("/api/forget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, mode: "prompt", containerTag, dryRun: true }),
  });
  if (!res.ok) throw new Error(`Failed to preview forget (${res.status})`);
  return res.json();
}

export async function confirmForget(target: string, containerTag: string): Promise<unknown> {
  const res = await fetch("/api/forget", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, mode: "prompt", containerTag, dryRun: false }),
  });
  if (!res.ok) throw new Error(`Failed to confirm forget (${res.status})`);
  return res.json();
}
