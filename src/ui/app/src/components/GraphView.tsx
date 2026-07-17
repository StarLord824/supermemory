import { useEffect, useState } from "react";
import { MemoryGraph } from "@supermemory/memory-graph";
import { fetchGraph, type GraphApiDocument } from "../api.js";

export function GraphView({ tag }: { tag: string }) {
  const [documents, setDocuments] = useState<GraphApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGraph(tag)
      .then((res) => {
        if (cancelled) return;
        setDocuments(res.documents);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tag]);

  return (
    <div data-testid="graph-view" className="h-[70vh] overflow-hidden rounded-xl border border-hairline bg-surface">
      <MemoryGraph documents={documents} isLoading={loading} error={error} variant="console">
        <p className="p-6 text-sm text-ink-muted">No memories to graph under &quot;{tag}&quot; yet.</p>
      </MemoryGraph>
    </div>
  );
}
