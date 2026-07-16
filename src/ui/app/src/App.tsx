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

const DEFAULT_TAG = "curator_default";

export function App() {
  const [tag, setTag] = useState(DEFAULT_TAG);
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

  return (
    <main>
      <h1>Curator — Governance Console</h1>

      <label>
        Container tag:{" "}
        <input value={tag} onChange={(e) => setTag(e.target.value)} data-testid="tag-input" />
      </label>

      <section>
        <h2>Memories</h2>
        <MemoryBrowser tag={tag} memories={memories} loading={loadingMemories} />
      </section>

      <section>
        <h2>Review queue</h2>
        <ReviewQueue supported={reviewSupported} items={reviewItems} onAction={handleReviewAction} />
      </section>

      <section>
        <h2>Forget</h2>
        <ForgetConsole
          query={forgetQuery}
          onQueryChange={setForgetQuery}
          onPreview={handlePreview}
          preview={forgetPreview}
          onConfirm={handleConfirm}
          actionLog={actionLog}
          previewing={previewing}
        />
      </section>
    </main>
  );
}
