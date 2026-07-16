Interactive CLI Interface for Curator
This plan details the addition of a visually stunning interactive CLI menu to Curator. This feature will make the CLI more accessible to users by offering an interactive menu with toggles and prompts when the CLI is run without arguments, while still preserving the existing flag-based commands.

User Review Required
IMPORTANT

The current project guidelines specify "no framework for the CLI (plain commander)". Adding an interactive menu will require adding a new dependency (@clack/prompts and picocolors). Please confirm if you approve adding these dependencies to enhance the CLI experience.

Open Questions
Should we make the interactive menu the default when curator is run without any arguments, or would you prefer a specific command for it like curator interactive? (The plan currently assumes making it the default when no arguments are provided).
Should the interactive flow encompass all commands (sync, connect, ui, status, mcp), or should some (like mcp which is mostly used programmatically by clients) be hidden from the interactive menu?
Proposed Changes
Package Dependencies
[MODIFY] 
package.json
Add @clack/prompts and picocolors to dependencies to build the interactive CLI interface.
Core Implementation
[NEW] 
interactive.ts
Create the main interactive flow using @clack/prompts.
Expose a runInteractiveMenu() function that:
Displays a stylized intro banner.
Presents a select menu for the user to choose an action: "Status Check", "Run Sync", "Connect Sources", "Start UI", or "Start MCP Server".
Based on the action, walks the user through additional prompts (e.g., selecting sync mode, entering a port for the UI, choosing sources to connect).
Delegates execution to the underlying modules (src/sync/agent.ts, src/ui/server.ts, etc.) just like cli.ts does.
[MODIFY] 
cli.ts
Update the default action of the commander program so that if no command is matched (i.e. running curator with no arguments), it imports and runs runInteractiveMenu().
Ensure all existing command-line arguments and flags remain functional for programmatic or advanced usage.
Verification Plan
Automated Tests
vitest run will be executed to ensure existing tests are not broken.
Due to the interactive nature of CLI prompts which rely on TTY, automated tests for @clack/prompts are complex. The verification will be primarily manual.
Manual Verification
Run node dist/cli.js without arguments and verify the interactive menu appears.
Walk through the "Start UI" flow and verify the UI starts on the requested port.
Walk through the "Status Check" flow and verify the status probe prints correctly.
Ensure that passing arguments directly (e.g., node dist/cli.js status) still bypasses the menu and executes the command directly.
