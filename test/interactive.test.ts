import { describe, expect, it } from "vitest";
import { formatAgent } from "../src/interactive.js";
import { AGENT_RUNTIMES } from "../src/sync/agent.js";

// Importing interactive.ts pulls in @clack/prompts / gradient-string; this
// also serves as a smoke test that those imports don't blow up at load time.
describe("formatAgent", () => {
  it("includes the runtime name for every verified runtime", () => {
    for (const runtime of AGENT_RUNTIMES) {
      expect(formatAgent(runtime)).toContain(runtime);
    }
  });

  it("returns the raw name for an unknown runtime (no crash)", () => {
    expect(formatAgent("mystery")).toBe("mystery");
  });
});
