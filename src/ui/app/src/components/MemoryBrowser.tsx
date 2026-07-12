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
          {memory.isLatest === false ? <span data-testid="memory-not-latest">superseded</span> : null}
          <p>{memory.content ?? memory.summary ?? memory.title ?? "(no content)"}</p>
          {memory.customId ? <code>{memory.customId}</code> : null}
        </li>
      ))}
    </ul>
  );
}
