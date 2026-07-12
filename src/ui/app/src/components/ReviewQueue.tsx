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
 * not have (see docs/api-verification.md §7).
 */
export function ReviewQueue({ supported, items, onAction }: ReviewQueueProps) {
  if (!supported) return null;

  if (items.length === 0) {
    return <p data-testid="review-queue-empty">No inferred memories awaiting review.</p>;
  }

  return (
    <ul data-testid="review-queue-list">
      {items.map((item) => (
        <li key={item.id} data-testid="review-item">
          <p>{item.memory}</p>
          <button type="button" onClick={() => onAction(item.id, "approve")}>
            Approve
          </button>
          <button type="button" onClick={() => onAction(item.id, "decline")}>
            Decline
          </button>
        </li>
      ))}
    </ul>
  );
}
