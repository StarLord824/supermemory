import type { MemoryEntry } from "../api.js";

export interface MemoryBrowserProps {
  tag: string;
  memories: MemoryEntry[];
  loading?: boolean;
}

export function MemoryBrowser({ tag, memories, loading }: MemoryBrowserProps) {
  if (loading) {
    return <p data-testid="memory-browser-loading">Loading memories for {tag}…</p>;
  }

  if (memories.length === 0) {
    return <p data-testid="memory-browser-empty">No memories stored under &quot;{tag}&quot; yet.</p>;
  }

  return (
    <ul data-testid="memory-browser-list">
      {memories.map((memory) => (
        <li key={memory.id} data-testid="memory-entry">
          {!memory.isLatest ? <span data-testid="memory-not-latest">superseded</span> : null}
          <p>{memory.memory}</p>
          {memory.memoryRelations && Object.keys(memory.memoryRelations).length > 0 ? (
            <ul data-testid="memory-relations">
              {Object.entries(memory.memoryRelations).map(([relatedId, relation]) => (
                <li key={relatedId}>
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
