# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Mailspring plugin that runs an MCP (Model Context Protocol) server inside the Mailspring email client, exposing **read-only** access to email data (threads, messages, contacts, folders, labels) over Streamable HTTP at `http://127.0.0.1:2525/mcp`. It queries Mailspring's own `DatabaseStore` directly — there is no separate backend.

The original Mailspring source is cloned at [`../Mailspring`](../Mailspring) (absolute path: `/Users/deepakp/Documents/obisidian-vault/Mailspring`) for reference. Use it to verify `mailspring-exports` APIs — e.g. `app/src/flux/stores/database-store.ts`, `app/src/flux/models/`, and `PLUGIN_SYSTEM_ARCHITECTURE.md`. Note: from a git worktree of this repo, `../Mailspring` does not resolve — use the absolute path.

## Commands

```bash
npm install
npm run build     # tsc — compiles src/ → lib/ (gitignored; Mailspring loads lib/main)
./install.sh      # symlink this repo into Mailspring's packages dir (macOS/Linux/Flatpak)
./uninstall.sh    # remove the symlink
```

There are no tests and no linter. The only verification is `npm run build` plus restarting Mailspring and exercising the tools (MCP client config: `{"url": "http://127.0.0.1:2525/mcp"}`, see `.vscode/`).

Mailspring does **not** hot-reload plugins — after any rebuild, restart Mailspring to pick up changes.

## Architecture

- `src/main.ts` — plugin entry (`package.json` `main` → `./lib/main`). Exports the Mailspring plugin lifecycle hooks `activate()` / `serialize()` / `deactivate()`. `activate()` creates the `McpServer`, registers tools, and starts a Node `http.Server` on port 2525 with `StreamableHTTPServerTransport`.
- `src/tools/` — one file per MCP tool (`registerXTool.ts`), all wired up in `src/tools/index.ts`. Each file follows the same pattern: a description string, a zod raw-shape input schema, a handler, and a `registerXTool(server)` export that calls `server.registerTool(name, {description, inputSchema}, handler)`.
- `src/helpers.ts` — shared query/formatting logic: `buildThreadMatchers()` (translates filter params to `DatabaseStore` matchers), `enrichThread()`, `formatThread/Message/File/Contact()`, `json()`/`text()` (MCP response wrappers), and `sanitizeHtml()`/`stripHtml()` (sanitize-html configs for thread bodies).
- `src/types.ts` — tool param interfaces. `ToolServer` is deliberately `any`.
- `types/mailspring-exports.d.ts` — **hand-written** declarations for the `mailspring-exports` module, which is injected by the Mailspring runtime at plugin load time and does not exist in `node_modules`. When using a Mailspring API not yet declared here, add it to this file and verify the real signature against `../Mailspring/app/src`.

## Gotchas

- Every Mailspring window loads the plugin (`windowTypes.default: true`), so a second window's server hits `EADDRINUSE` on port 2525. `main.ts` deliberately swallows that error — it means the server is already running in another window; don't "fix" it.
- Filters that `DatabaseStore` can't express (`from`/`to` participant match, `hasAttachment`) are applied in JS **after** `limit`/`offset` run in SQL, so a page can return fewer results than `limit` even when more matches exist. Known trade-off, not a bug — but keep it in mind when adding filters.
- `folder`/`label` filters do a case-insensitive substring match against category paths and silently skip the matcher when nothing matches (returning unfiltered results) — see `buildThreadMatchers()`.
- The MCP server has no authentication **by design** — it binds only to `127.0.0.1`, so access is limited to local processes. Don't add auth layers, and don't change the bind address to a non-loopback interface.
- The plugin is read-only by design. Do not add tools that send, modify, or delete mail.
- Message/thread bodies must go through `sanitizeHtml()` (for `bodyHtml`) or `stripHtml()` (for plain text) before being returned to the MCP client.
- `styles/main.less` is an intentionally empty placeholder required by the plugin layout.

## Code style

- Allman braces (opening brace on its own line) and tab indentation, matching the existing files.
- No abbreviations in identifiers; each tool file stays self-contained with shared logic living in `helpers.ts`.
