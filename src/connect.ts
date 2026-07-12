import { spawn } from "node:child_process";

/**
 * Coral sources Curator's docs and demo target (docs/plan.md §3 Component C).
 * Coral supports more; unknown names are passed through to Coral's wizard,
 * which is the authority — this list only powers the hint message.
 */
export const KNOWN_CORAL_SOURCES = [
  "github",
  "linear",
  "slack",
  "sentry",
  "datadog",
  "stripe",
] as const;

/**
 * Thin wrapper around `coral source add --interactive <source>`. Coral's own
 * wizard collects and stores credentials; Curator never touches secrets here.
 * Inherits stdio so the interactive prompts reach the user's terminal.
 */
export function connectSource(
  source: string,
  spawnFn: typeof spawn = spawn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnFn("coral", ["source", "add", "--interactive", source], { stdio: "inherit" });

    child.on("error", (err) => {
      reject(new Error(`Failed to run coral: ${err.message}. Is Coral installed and on PATH?`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`coral source add --interactive ${source} exited with code ${code}`));
      }
    });
  });
}

/**
 * Connects several Coral sources sequentially (the wizard is interactive, so
 * they cannot run in parallel). Stops at the first failure so the user isn't
 * dropped into a second wizard after the first one broke; already-connected
 * sources stay connected in Coral's own store.
 */
export async function connectSources(
  sources: string[],
  spawnFn: typeof spawn = spawn,
): Promise<void> {
  for (const source of sources) {
    if (!(KNOWN_CORAL_SOURCES as readonly string[]).includes(source)) {
      console.warn(
        `"${source}" is not one of Curator's documented sources (${KNOWN_CORAL_SOURCES.join(", ")}); ` +
          `passing it through to Coral's wizard anyway.`,
      );
    }
    console.log(`Connecting ${source} via Coral's interactive wizard…`);
    await connectSource(source, spawnFn);
    console.log(`${source} connected. Add it to CURATOR_SOURCES to include it in \`curator sync\`.`);
  }
}
