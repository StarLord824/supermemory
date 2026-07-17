import { useEffect, useState } from "react";
import {
  confirmForget,
  fetchMemories,
  fetchReview,
  fetchTags,
  postReviewAction,
  previewForget,
  type ForgetPreview,
  type MemoryEntry,
  type ReviewAction,
  type InferredMemory,
  type TagInfo,
} from "./api.js";
import { MemoryBrowser } from "./components/MemoryBrowser.js";
import { ForgetConsole } from "./components/ForgetConsole.js";
import { ReviewQueue } from "./components/ReviewQueue.js";
import { GraphView } from "./components/GraphView.js";
import { HomeView } from "./components/HomeView.js";
import { DocsView } from "./components/DocsView.js";
import { Card, TabBar, TagPicker } from "./components/ui.js";

const DEFAULT_TAG = "curator_default";

export function App() {
  const [tag, setTag] = useState(DEFAULT_TAG);
  const [activeTab, setActiveTab] = useState("home");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(true);
  const [reviewSupported, setReviewSupported] = useState(false);
  const [reviewItems, setReviewItems] = useState<InferredMemory[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);

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

  useEffect(() => {
    fetchTags()
      .then((res) => setTags(res.tags))
      .catch(() => setTags([]))
      .finally(() => setLoadingTags(false));
  }, []);

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
    { id: "home", label: "Home" },
    { id: "memories", label: "Memories" },
    ...(reviewSupported ? [{ id: "review", label: "Review" }] : []),
    { id: "forget", label: "Forget" },
    { id: "graph", label: "Graph" },
    { id: "docs", label: "Docs" },
  ];

  // Changing the tag can retract review support out from under an open Review
  // tab; fall back rather than strand a panel with no corresponding tab.
  const active = tabs.some((t) => t.id === activeTab) ? activeTab : "home";

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Curator</h1>
        <TagPicker value={tag} tags={tags} onChange={setTag} />
      </header>

      <div className="mb-6">
        <TabBar tabs={tabs} active={active} onChange={setActiveTab} />
      </div>

      {active === "home" ? (
        <Card title="Overview">
          <HomeView
            tag={tag}
            tags={tags}
            loadingTags={loadingTags}
            memoryCount={memories.length}
            reviewSupported={reviewSupported}
          />
        </Card>
      ) : null}

      {active === "memories" ? (
        <Card title="Memories">
          <MemoryBrowser tag={tag} memories={memories} loading={loadingMemories} />
        </Card>
      ) : null}

      {active === "review" ? (
        <Card title="Review queue">
          <ReviewQueue supported={reviewSupported} items={reviewItems} onAction={handleReviewAction} />
        </Card>
      ) : null}

      {active === "forget" ? (
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

      {active === "graph" ? <GraphView tag={tag} /> : null}

      {active === "docs" ? (
        <Card title="Docs">
          <DocsView />
        </Card>
      ) : null}
    </main>
  );
}
