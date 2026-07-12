import { spawn } from "node:child_process";

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
