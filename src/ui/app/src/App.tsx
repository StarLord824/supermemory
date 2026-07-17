import { useEffect, useState } from "react";
import {
  confirmForget,
  fetchMemories,
  fetchReview,
  postReviewAction,
  previewForget,
  type ForgetPreview,
  type MemoryEntry,
  type ReviewAction,
  type InferredMemory,
} from "./api.js";
import { MemoryBrowser } from "./components/MemoryBrowser.js";
import { ForgetConsole } from "./components/ForgetConsole.js";
import { ReviewQueue } from "./components/ReviewQueue.js";
import { GraphView } from "./components/GraphView.js";
import { Card, TabBar } from "./components/ui.js";

const DEFAULT_TAG = "curator_default";

export function App() {
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [activeTab, setActiveTab] = useState("memories");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(true);
  const [reviewSupported, setReviewSupported] = useState(false);
  const [reviewItems, setReviewItems] = useState<InferredMemory[]>([]);

  const [forgetQuery, setForgetQuery] = useState("");
  const [forgetPreview, setForgetPreview] = useState<ForgetPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);

  useEffect(() => {
    setLoadingMemories(true);
    fetchMemories(tag)
      .then((res) => setMemories(res.memoryEntries))
      .catch(() => setMemories([]))
      .finally(() => setLoadingMemories(false));

    fetchReview(tag)
      .then((res) => {
        setReviewSupported(res.supported);
        setReviewItems(res.memories);
      })
      .catch(() => setReviewSupported(false));
  }, [tag]);

  async function handleReviewAction(id: string, action: ReviewAction) {
    await postReviewAction(tag, id, action);
    setReviewItems((items) => items.filter((item) => item.id !== id));
    setActionLog((log) => [`${action} reviewed memory ${id}`, ...log]);
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const preview = await previewForget(forgetQuery, tag);
      setForgetPreview(preview);
    } finally {
      setPreviewing(false);
    }
  }

  async function handleConfirm() {
    await confirmForget(forgetQuery, tag);
    setActionLog((log) => [`forgot memories matching "${forgetQuery}"`, ...log]);
    setForgetPreview(null);
    setForgetQuery("");
  }

  // The Review tab only exists if the server actually supports the
  // inferred-memories endpoint — no dead tab. See docs/api-verification.md §7.
  const tabs = [
    { id: "memories", label: "Memories" },
    ...(reviewSupported ? [{ id: "review", label: "Review" }] : []),
    { id: "forget", label: "Forget" },
    { id: "graph", label: "Graph" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Curator</h1>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          Container tag
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            data-testid="tag-input"
            className="rounded-lg border border-hairline bg-elevated px-3 py-1.5 font-mono text-sm text-ink focus:border-accent-blue focus:outline-none"
          />
        </label>
      </header>

      <div className="mb-6">
        <TabBar tabs={tabs} active={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === "memories" ? (
        <Card title="Memories">
          <MemoryBrowser tag={tag} memories={memories} loading={loadingMemories} />
        </Card>
      ) : null}

      {activeTab === "review" ? (
        <Card title="Review queue">
          <ReviewQueue supported={reviewSupported} items={reviewItems} onAction={handleReviewAction} />
        </Card>
      ) : null}

      {activeTab === "forget" ? (
        <Card title="Forget">
          <ForgetConsole
            query={forgetQuery}
            onQueryChange={setForgetQuery}
            onPreview={handlePreview}
            preview={forgetPreview}
            onConfirm={handleConfirm}
            actionLog={actionLog}
            previewing={previewing}
          />
        </Card>
      ) : null}

      {activeTab === "graph" ? <GraphView tag={tag} /> : null}
    </main>
  );
}
