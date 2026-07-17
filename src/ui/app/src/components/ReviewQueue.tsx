import type { InferredMemory, ReviewAction } from "../api.js";

export interface ReviewQueueProps {
  supported: boolean;
  items: InferredMemory[];
  onAction: (id: string, action: ReviewAction) => void;
}

/**
 * Renders nothing when the backend reports the review-queue endpoint is
 * unsupported on this Supermemory Local instance, per
 * docs/implementation-plan.md §6 — no dead UI for a capability Local may
 * not have. (Confirmed present on server-v0.0.5; see docs/api-verification.md §7.)
 */
export function ReviewQueue({ supported, items, onAction }: ReviewQueueProps) {
  if (!supported) return null;

  if (items.length === 0) {
    return (
      <p data-testid="review-queue-empty" className="text-sm text-ink-muted">
        No inferred memories awaiting review.
      </p>
    );
  }

  return (
    <ul data-testid="review-queue-list" className="divide-y divide-hairline">
      {items.map((item) => (
        <li key={item.id} data-testid="review-item" className="flex items-start justify-between gap-4 py-3">
          <p className="text-sm leading-relaxed text-ink">{item.memory}</p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => onAction(item.id, "approve")}
              className="rounded-lg border border-hairline px-3 py-1 text-xs font-medium text-accent-green hover:bg-white/5"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onAction(item.id, "decline")}
              className="rounded-lg border border-hairline px-3 py-1 text-xs font-medium text-accent-red hover:bg-white/5"
            >
              Decline
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
