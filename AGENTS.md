# Project AGENTS.md

> Project-specific instructions. Inherits global behavior from `~/.codex/AGENTS.md`.

## Project Info

### Purpose

> Local stdio MCP server that exposes YouTube Data API v3 and YouTube Analytics API v2 data (channel, health, audience, discovery, retention, engagement) as MCP tools and prompts, authenticated with the channel owner's own Google OAuth credentials.

### Language / Framework

> TypeScript (strict, ESM, `module`/`moduleResolution: Node16`, target ES2022) on Node.js. `@modelcontextprotocol/sdk` (stdio transport), `googleapis`, `@google-cloud/local-auth`, `zod` v4. No database; OAuth state lives in local JSON files.

### Key Entry Points

> `src/index.ts` (server bootstrap and tool/prompt registration), `src/tool-configs.ts` (tool aggregator), `src/prompt-configs.ts` (MCP prompts), `src/types.ts` (`ToolConfig`, `ToolContext`, `ToolResult`), `src/youtube/youtube-client.ts` (all Google API calls), `src/auth/auth-manager.ts` (OAuth), `src/youtube/tools/*-configs.ts` (tool definitions), `build/index.js` (compiled `bin`)

---

## Commands

| Task | Command |
|------|---------|
| **Build** | `npm run build` (`tsc` into `build/`, then `chmod 755 build/index.js`) |
| **Test** | `npm run build && ./test_all_tools.sh` (live smoke test, see Testing). `npm test` does the same and then opens the MCP Inspector, which blocks |
| **Format** | None configured (no Prettier or other formatter) |
| **Lint / Typecheck** | `npx tsc --noEmit` (no linter configured) |
| **Run** | `npm run dev` (`tsx src/index.ts`, stdio, no host/port). `npm run inspect` opens the MCP Inspector UI against the dev server. Run from the repo root (see Coding Style & Architecture) |

> **Known issue (2026-11-19):** `tsc` reports TS2353 at `src/index.ts:14`: `capabilities` is not a valid property in the `McpServer` constructor's first argument in the installed SDK version. `tsc` still writes `build/`, but `npm run build` exits non-zero and skips the `chmod`. Treat this error as pre-existing when you check for new type errors.

### Required Verification Flow

After editing files:

```text
1. Run the project-native formatter for changed files, if configured.
2. Run the project-native lint or typecheck command, if configured.
3. Run the relevant tests.
4. Review the diff.
5. Declare completion only after verification passes or clearly report failures.
```

If the project has no formatter, linter, or tests yet, state that explicitly and
verify with the best available command.

---

## Conventions

### Testing

> No unit-test framework and no coverage. Tests are shell smoke scripts in the repo root (`test_all_tools.sh`, `test_health_tools.sh`, `test_video_tools.sh`). Each pipes a JSON-RPC `tools/call` message into `node build/index.js` and greps the output for `"result"`.
>
> - The scripts call the real Google APIs. They need a valid `src/auth/token.json` and use hardcoded 2025 date ranges.
> - Build before running them, because they execute `build/`, not `src/`.
> - Single tool: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_engagement_metrics","arguments":{"startDate":"2025-01-01","endDate":"2025-01-15"}}}' | node build/index.js`
> - For interactive checks, use `npm run inspect`.

### Coding Style & Architecture

> **Config-driven tools.** Every MCP tool is a `ToolConfig` object (`name`, `description`, zod `schema`, `handler(params, context)`) exported in a per-category array from `src/youtube/tools/<category>-configs.ts`, `src/auth/tool-configs.ts`, or `src/server/info-configs.ts`.
>
> - `src/tool-configs.ts` spreads those arrays into `allTools`.
> - `src/index.ts` loops over `allTools` and calls `server.registerTool`. It never registers tools by hand.
> - Prompts follow the same pattern via `allPrompts` in `src/prompt-configs.ts`.
>
> To add a tool:
>
> 1. Add a config to the right category file, or create a new file.
> 2. If you created a file, spread its array into `allTools`.
> 3. Add any new Google API call as a method on `YouTubeClient`.
>
> `schema` must be a `z.object(...)`, because `index.ts` passes `schema.shape` as the input schema.
>
> **Handler data flow (separation of concerns):**
>
> 1. `getYouTubeClient()` returns the cached `YouTubeClient`.
> 2. A `YouTubeClient` method returns the raw API response. This class is the only place that calls `googleapis`.
> 3. `src/utils/parsers/` turns analytics rows and column headers into objects.
> 4. `src/utils/transformers/` computes derived statistics.
> 5. `src/utils/formatters/<category>.ts` analyzes the data and renders the text.
> 6. The handler returns `{ content: [{ type: "text", text }] }`.
>
> Handlers catch their own errors and return `isError: true`. `index.ts` also wraps every handler as a fallback.
>
> **Context injection.** Handlers receive `{ authManager, getYouTubeClient, clearYouTubeClientCache }` from `index.ts`, which caches a single `YouTubeClient` and clears it when an auth error occurs.
>
> **Auth.**
>
> - `AuthManager` reads `src/auth/credentials.json` and reads/writes `src/auth/token.json`. It resolves both paths against `process.cwd()`, so the server must be started from the repo root, and MCP client configs must set `cwd` to it.
> - Credentials can be either Web or Desktop OAuth clients.
> - If no valid token exists, it opens the browser OAuth flow via `@google-cloud/local-auth`. It then copies the tokens into a `googleapis` `OAuth2Client`, because `googleapis` silently drops auth clients built by other `google-auth-library` versions.
> - It refreshes access tokens within 5 minutes of expiry.
> - Both auth files are gitignored. Never read or commit them.
>
> **Stdout is the JSON-RPC channel.** Log with `console.error` only. `auth-manager.ts` still uses `console.log` in places, which writes to stdout and can corrupt the protocol stream.
>
> **ESM imports.** Relative imports must use the `.js` extension (`./types.js`), as required by Node16 module resolution.
>
> **Docs drift.** The README's registration example (`server.tool`, `allToolConfigs`) and its tool list are out of date. Treat `src/index.ts` and `src/tool-configs.ts` as the source of truth.
>
> **Task docs.** Planned work goes in `docs/tasks/backlog/NNNN-*.md` and moves to `docs/tasks/finished/` when done. The `.claude/agents/task-planner.md` agent creates these files.

### 🤖 Model Routing & Token Enforcement

- **Spec Writers & Architecture Reviewers:**
  - **Model:** `GPT-5.5`
  - **Reasoning Tier:** `High` (or `Medium`)
  - *Use Case:* High-level context synthesis and architectural guardrails.
- **Implementers & TDD Repair Loops:**
  - **Model:** `GPT-5.4-Mini` OR route strictly to the `Speed` profile.
  - **Reasoning Tier:** `Light`
  - *Use Case:* Writing basic unit tests and localized file modifications. This stops execution loops from burning premium limits.
- **Max Iteration Loop Limit:** Subagents are capped at a maximum of **3 regression/repair loops** per task. If a test fails 3 times sequentially, the agent **MUST halt**, save an error state, and hand execution back to the human.
- **Tool-Call Hard Cap:** Hard-cap tool calls at a maximum of **12,000 input tokens** to prevent context blowout from massive files.
---

## Token-Saver File Boundaries

- Keep generated files, secrets, logs, coverage reports, dependency folders,
  local databases, and binary assets out of agent context by default.
- Projects should maintain:
  - `AGENTS.md` path guidance and LeanCTX path controls for Codex context-budget exclusions.
  - `.codexignore` only when local tooling is verified to consume it.
  - `.claude/settings.json` for Claude Code permissions and tool behavior.

- If this repository requires broader or narrower exclusions, update the local
  settings or context-layer files instead of weakening global behavior.
- Keep `.claude/settings.local.json` for private machine-local Claude settings
  only, and do not commit it.

---

## Development Workflow

This repository inherits the global session requirements:

- Use LeanCTX for AST-aware workspace scoping when available.
- Activate Caveman for conversational efficiency when available.
- Treat Superpowers as optional. Invoke it only when explicitly requested or
  when an active workflow already requires it.

When Superpowers is manually invoked, follow the active Superpowers skill
workflow, including its spec, plan, worktree, and verification requirements.

When Superpowers is not in use, follow this repository's normal development and
verification rules.

### 1. Planning And Subagents

Use subagents only when persistent task state, parallel investigation,
isolation, or review checkpoints materially help.

Do not spawn additional agents for docs-only edits, one-file fixes, simple
config changes, command output checks, formatting, linting, or tasks where all
steps must be performed sequentially.

Default flow:

```text
1. Clarify the goal or use the active Superpowers plan when one exists.
2. Split the work into atomic tasks with clear file ownership and verification.
3. Keep sequential or tightly coupled work in the main agent.
4. Use focused subagents only for independent tasks.
5. Use the main agent as supervisor and final reviewer.
```

### 2. Test-Driven Development

This repository prefers TDD by default for non-trivial code changes.

Follow the Red, Green, Refactor cycle when practical:

1. Write a failing test.
2. Verify the test fails with the project-native test command.
3. Implement the minimum code required.
4. Refactor while keeping tests green.

For trivial changes, documentation-only edits, or config-only changes, use the
most relevant verification command instead.

### 3. Code Review And Branch Completion

Workflow:

```text
Request code review
        |
Address feedback
        |
Run verification
        |
Merge or create PR
        |
Clean up branch
```

---

## Instruction Precedence

Instruction precedence is:

```text
Local AGENTS.md
        |
Applicable skills, including Superpowers when invoked
        |
Global ~/.codex/AGENTS.md
```

Project-specific overrides should be placed under the **Conventions** section
whenever possible.

---

## Memory Management

### Context & Active Knowledge
- State tracking, temporal facts, and session discoveries are managed natively by LeanCTX via `ctx_knowledge`.
- Do not attempt to automatically write correction logs, session journals, or lessons learned to an external Obsidian vault or personal notes.
- If high-leverage architectural changes or unique domain patterns are established, focus entirely on the engineering execution loop. 
- Provide a clean, markdown-formatted technical summary of the session *only* if explicitly requested by the human for manual curation.
