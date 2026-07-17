import type { TagInfo } from "../api.js";

export function HomeView({
  tag,
  tags,
  loadingTags,
  memoryCount,
  reviewSupported,
}: {
  tag: string;
  tags: TagInfo[];
  loadingTags: boolean;
  memoryCount: number;
  reviewSupported: boolean;
}) {
  return (
    <div data-testid="home-view" className="space-y-6">
      <p className="text-sm text-ink-muted">
        Curator is a local governance console for Supermemory Local — browse memories, review
        what was inferred, forget on request, and see how everything under a container tag
        connects.
      </p>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div data-testid="stat-tags" className="rounded-xl border border-hairline bg-surface p-4">
          <dt className="text-xs text-ink-faint">Container tags found</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{loadingTags ? "…" : tags.length}</dd>
        </div>
        <div data-testid="stat-memories" className="rounded-xl border border-hairline bg-surface p-4">
          <dt className="text-xs text-ink-faint">Memories under &quot;{tag}&quot;</dt>
          <dd className="mt-1 font-display text-2xl text-ink">{memoryCount}</dd>
        </div>
        <div data-testid="stat-review" className="rounded-xl border border-hairline bg-surface p-4">
          <dt className="text-xs text-ink-faint">Review queue</dt>
          <dd className="mt-1 font-display text-2xl text-ink">
            {reviewSupported ? "Supported" : "Not available"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
