import type { MemoryEntry } from "../api.js";
import { Badge } from "./ui.js";

export interface MemoryBrowserProps {
  tag: string;
  memories: MemoryEntry[];
  loading?: boolean;
}

export function MemoryBrowser({ tag, memories, loading }: MemoryBrowserProps) {
  if (loading) {
    return (
      <p data-testid="memory-browser-loading" className="text-sm text-ink-muted">
        Loading memories for {tag}…
      </p>
    );
  }

  if (memories.length === 0) {
    return (
      <p data-testid="memory-browser-empty" className="text-sm text-ink-muted">
        No memories stored under &quot;{tag}&quot; yet.
      </p>
    );
  }

  return (
    <ul data-testid="memory-browser-list" className="divide-y divide-hairline">
      {memories.map((memory) => (
        <li key={memory.id} data-testid="memory-entry" className="py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed text-ink">{memory.memory}</p>
            {!memory.isLatest ? (
              <span data-testid="memory-not-latest">
                <Badge tone="neutral">superseded</Badge>
              </span>
            ) : null}
          </div>
          {memory.memoryRelations && Object.keys(memory.memoryRelations).length > 0 ? (
            <ul data-testid="memory-relations" className="mt-2 flex flex-wrap gap-2">
              {Object.entries(memory.memoryRelations).map(([relatedId, relation]) => (
                <li key={relatedId} className="font-mono text-xs text-ink-faint">
                  {relation} → {relatedId}
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
