vi.mock("@supermemory/memory-graph", () => ({
  MemoryGraph: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="mock-memory-graph">{children}</div>
  ),
}));

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoryBrowser } from "../src/ui/app/src/components/MemoryBrowser.js";
import { ReviewQueue } from "../src/ui/app/src/components/ReviewQueue.js";
import { ForgetConsole } from "../src/ui/app/src/components/ForgetConsole.js";
import { GraphView } from "../src/ui/app/src/components/GraphView.js";
import { Badge, Card, TabBar } from "../src/ui/app/src/components/ui.js";

function loadFixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`../src/ui/app/src/fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("MemoryBrowser", () => {
  it("renders each memory's content, relations, and marks superseded entries", () => {
    const fixture = loadFixture<{ memoryEntries: Array<Record<string, unknown>> }>("memories.json");
    const html = renderToStaticMarkup(
      <MemoryBrowser tag="curator_default" memories={fixture.memoryEntries as never} />,
    );

    expect(html).toContain("Fix flaky sync test");
    expect(html).toContain("updates");
    expect(html).toContain("mem_3");
    expect(html).toContain("superseded"); // mem_2 has isLatest:false
  });

  it("renders an empty-state message when there are no memories", () => {
    const html = renderToStaticMarkup(<MemoryBrowser tag="curator_default" memories={[]} />);
    expect(html).toContain("No memories stored");
  });

  it("renders a loading message when loading", () => {
    const html = renderToStaticMarkup(<MemoryBrowser tag="curator_default" memories={[]} loading />);
    expect(html).toContain("Loading memories");
  });
});

describe("ReviewQueue", () => {
  it("renders nothing when the backend reports review is unsupported", () => {
    const fixture = loadFixture<{ supported: boolean; memories: unknown[] }>("review-unsupported.json");
    const html = renderToStaticMarkup(
      <ReviewQueue supported={fixture.supported} items={fixture.memories as never} onAction={() => {}} />,
    );
    expect(html).toBe("");
  });

  it("renders pending inferred memories with approve/decline actions when supported", () => {
    const fixture = loadFixture<{ supported: boolean; memories: unknown[] }>("review-supported.json");
    const html = renderToStaticMarkup(
      <ReviewQueue supported={fixture.supported} items={fixture.memories as never} onAction={() => {}} />,
    );
    expect(html).toContain("User prefers dark mode");
    expect(html).toContain("Approve");
    expect(html).toContain("Decline");
  });
});

describe("ForgetConsole", () => {
  it("does not render a preview panel until a preview exists", () => {
    const html = renderToStaticMarkup(
      <ForgetConsole
        query=""
        onQueryChange={() => {}}
        onPreview={() => {}}
        preview={null}
        onConfirm={() => {}}
        actionLog={[]}
      />,
    );
    expect(html).not.toContain("Confirm deletion");
  });

  it("renders the preview summary and candidates plus a confirm button once a dry-run preview exists", () => {
    const preview = loadFixture<Record<string, unknown>>("forget-preview.json");
    const html = renderToStaticMarkup(
      <ForgetConsole
        query="everything about client X"
        onQueryChange={() => {}}
        onPreview={() => {}}
        preview={preview as never}
        onConfirm={() => {}}
        actionLog={[]}
      />,
    );
    expect(html).toContain("2 memories match");
    expect(html).toContain("Client X wants the report by Friday");
    expect(html).toContain("Confirm deletion");
  });

  it("disables the preview button until a query is entered", () => {
    const html = renderToStaticMarkup(
      <ForgetConsole
        query=""
        onQueryChange={() => {}}
        onPreview={() => {}}
        preview={null}
        onConfirm={() => {}}
        actionLog={[]}
      />,
    );
    expect(html).toContain("disabled");
  });

  it("renders the action log", () => {
    const html = renderToStaticMarkup(
      <ForgetConsole
        query=""
        onQueryChange={() => {}}
        onPreview={() => {}}
        preview={null}
        onConfirm={() => {}}
        actionLog={['forgot memories matching "client X"']}
      />,
    );
    expect(html).toContain("forgot memories matching");
  });
});

describe("ui primitives", () => {
  it("Card renders its title and children", () => {
    const html = renderToStaticMarkup(<Card title="Memories">content here</Card>);
    expect(html).toContain("Memories");
    expect(html).toContain("content here");
  });

  it("Badge renders its children", () => {
    const html = renderToStaticMarkup(<Badge tone="green">done</Badge>);
    expect(html).toContain("done");
  });

  it("TabBar renders every tab and marks the active one", () => {
    const html = renderToStaticMarkup(
      <TabBar
        tabs={[{ id: "memories", label: "Memories" }, { id: "graph", label: "Graph" }]}
        active="graph"
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain('aria-selected="true"');
  });
});

describe("GraphView", () => {
  it("renders its container and passes an empty-state child to the graph", () => {
    const html = renderToStaticMarkup(<GraphView tag="src_github" />);

    expect(html).toContain("graph-view");
    expect(html).toContain("mock-memory-graph");
    expect(html).toContain("No memories to graph");
  });
});

import { App } from "../src/ui/app/src/App.js";

describe("App tab shell", () => {
  it("renders the tab bar with Memories and Graph tabs", () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain("Memories");
    expect(html).toContain("Graph");
    expect(html).toContain("Forget");
  });

  it("does not render a Review tab before the backend confirms support", () => {
    // Initial render: reviewSupported starts false, so the tab must be absent —
    // no dead tab for a capability the server may not have.
    const html = renderToStaticMarkup(<App />);
    expect(html).not.toContain(">Review<");
  });
});
