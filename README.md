# BajajBot

**A terminal AI coding assistant for any OpenAI-compatible model.**

Bring your own API key, pick your model, and chat with an agent that can read,
write, edit, and run code directly in your project — all from your terminal.
BajajBot supports OpenRouter and custom endpoints such as Ollama, vLLM, and
LM Studio, on macOS, Linux, and Windows.

```sh
npx bajajbot
```

## Features

- Live token streaming in a clean terminal UI (Ink + React)
- **Agent tools** — read/write/edit/delete files, search file contents, run shell commands, fetch web pages, load skills, and maintain a visible task plan
- **Live plan board** — for multi-step tasks the agent shows a ✓/▸/○ checklist above your input, updating in real time
- **Skills** — markdown playbooks from `.bajajbot/skills/`, plus folders installed for other agents (`~/.claude`, `~/.agents`, `~/.codex`)
- **Project instructions** — drop a `BAJAJBOT.md` in your repo (or `~/.bajajbot/BAJAJBOT.md` for global rules); its contents are injected into every system prompt automatically
- **Persistent memory** — the agent saves durable facts (your prefs, project conventions) to `~/.bajajbot/memory.md` and recalls them in every future session; inspect anytime with `/memory`
- **Done notifications** — replies that take 3+ seconds ring the terminal bell and pop a desktop notification (OSC 9/777, tmux-aware), so you can switch windows while it works
- **`/btw` side questions** — ask "btw, why?" mid-task and get an instant aside without derailing the running agent; the status bar teaches context-aware command hints as you go
- **`/compare` A/B** — fire one question at two models, see answers side by side, press 1 or 2 to keep the winner into the chat history
- **`/subagent` parallel research** — fan out background mini-agents (`/subagent summarize TODO.md | check node version | find bugs`) that investigate while you keep chatting; live status chips below the chat, esc cancels the batch, finished reports fold into the chat as boxed blocks
- **File & image mentions** — type `@src/app.ts` to attach code, `@error.png` to attach images for vision models, with Tab autocomplete
- Risky actions require explicit confirmation with a colorized diff preview; nothing runs without your approval
- Any model, switchable mid-chat with `/model`; recently-used models at top of picker; ctrl+f toggles ★ favorites (also settable via config)
- Message queueing while streaming, `/retry`, `/undo`, `/export`, `/search`
- **Git checkpoints** — every reply auto-snapshots the project to a hidden ref (your branch/index/stash untouched); browse and restore with `/checkpoints`
- **`/changes`** — every file the agent created/edited/deleted this session
- **`/theme`** — six UI colorways (ember, ocean, matrix, rose, violet, mono), switchable live and persisted
- **Auto-compaction** — long chats are summarized automatically instead of hitting the model's limit, with a live context meter in the status bar
- **Rate-limit handling** — automatic retries with backoff, honors `Retry-After`, plain-English error messages
- **Non-interactive mode** — `bajajbot -p "prompt"` with piped stdin, for scripts and CI
- `/usage` dashboard + `spendLimitUsd` guardrail — tokens and estimated cost per session and across all chats
- Auto-generated session titles, first-run setup wizard that verifies your endpoint/key/model live, daily update check
- Markdown replies with syntax-highlighted code, mouse-wheel scrolling, drag-to-select copying
- Cross-platform: macOS, Linux, Windows

## Quick start

Run without installing:

```sh
npx bajajbot
```

Or install once:

```sh
npm install -g bajajbot
bajajbot
```

On first launch the setup wizard asks for:

1. Provider — OpenRouter or a custom OpenAI-compatible endpoint
2. Your API key
3. API base URL
4. Default model ID, for example `openai/gpt-oss-20b:free`

It then verifies the endpoint, key and model against the live API before
saving. Configuration lives at `~/.bajajbot/config.json`.

---

# Command reference

## CLI commands

| Command | What it does |
| --- | --- |
| `bajajbot` | Start a new interactive chat |
| `bajajbot "fix the login bug"` | New chat that **auto-sends** your text as the first message |
| `bajajbot -c` | Resume your most recent session instantly |
| `bajajbot -c "run tests now"` | Resume it and auto-send a follow-up message |
| `bajajbot chat --resume <id>` | Resume a specific saved chat |
| `bajajbot sessions` | Pick a saved chat from a terminal picker |
| `bajajbot -p "prompt"` | One-shot: run the prompt with agent tools, print the answer, exit |
| `cat file \| bajajbot -p "explain"` | Pipe stdin into a `-p` prompt |
| `bajajbot usage` | Print token & cost totals across all saved chats |
| `bajajbot config init` | Re-run the setup wizard |
| `bajajbot config show` | Show config (API key stays masked) |
| `bajajbot config set-model <id>` | Change the default model |
| `bajajbot config set <key> <value>` | Set an option (see table below) |
| `bajajbot config unset <key>` | Clear an option |
| `bajajbot profile save <name>` | Save current provider settings as a named profile |
| `bajajbot profile use <name>` | Switch to a saved profile |
| `bajajbot profile list` | List saved profiles |
| `bajajbot profile remove <name>` | Delete a saved profile |
| `bajajbot logout` | Delete config and all sessions |
| `bajajbot --version` / `-h` | Show version / help |

### Launch flags

| Flag | Effect |
| --- | --- |
| (none) | Interactive chat |
| `"text…"` | Interactive chat that immediately sends your text |
| `-c`, `--continue` | Resume the newest session (combine with text to follow up) |
| `-p`, `--print` | Non-interactive one-shot mode; reads stdin when piped |

### `config set` keys

| Key | Value | What it controls |
| --- | --- | --- |
| `temperature` | 0–2 (number) | Generation randomness override |
| `maxTokens` | positive integer | Cap on reply length |
| `systemPrompt` | text | Replace the built-in system prompt entirely |
| `contextTokens` | integer ≥ 1000 | Token budget before auto-compaction triggers (default 12000) |
| `spendLimitUsd` | number > 0 | Warn once when a session's estimated cost crosses this line |
| `favoriteModels` | comma-separated IDs | Models pinned ★ to the top of the `/model` picker |
| `checkpointLimit` | integer ≥ 2 | Max git snapshots kept per project; when full, the chain restarts and old ones are reclaimed by git GC (default 300) |
| `theme` | theme name | UI colorway — one of `ember` (default), `ocean`, `matrix`, `rose`, `violet`, `mono`. Also switchable live with `/theme` |
| `webSearch` | object | Backend for the agent's `web_search` tool: `{ "provider": "duckduckgo" \| "brave" \| "tavily" \| "searxng", "apiKey": "...", "searxUrl": "..." }` — default is keyless DuckDuckGo; Brave/Tavily need a free API key, SearXNG your instance URL |

Example:

```sh
bajajbot config set favoriteModels "openai/gpt-oss-20b:free, anthropic/claude-sonnet-4.5"
bajajbot config set spendLimitUsd 5
bajajbot config set theme ocean
bajajbot config unset temperature
```

## Slash commands (inside chat)

| Command | Argument | What it does |
| --- | --- | --- |
| `/model` | optional `<id>` | With an ID: switch model now. Without: open a searchable picker — type to filter, recently-used models at top, ctrl+f toggles ★ favorites, Enter chooses, or type any unlisted ID into the `+` row |
| `/skills` | — | Browse every installed skill (project + global). `↑↓` select, **Enter runs it immediately**, esc closes |
| `/checkpoints` | — | Browse automatic git snapshots of your project. Enter arms a restore, enter again confirms |
| `/changes` | — | List files the agent created/edited/deleted this session (A/M/D color-coded) |
| `/theme` | — | Pick a UI colorway (arrow keys, live preview swatches); saved to your config |
| `/usage` | — | Requests, tokens and estimated cost across all saved chats, with per-model breakdown |
| `/btw <question>` | required | Instant side question — answered in 1–2 sentences even mid-task, never enters the chat history |
| `/compare <question>` | required | Ask two models the same question side by side — pick the winner to keep (1 = A, 2 = B, esc = discard both) |
| `/subagent <task1>, <task2>, …` | required | Launch parallel background research agents — any number of tasks separated by commas, pipes, or new lines; live chips while they run, single esc cancels, finished reports fold into the chat |
| `/copy` | — | Copy the last assistant reply to the clipboard |
| `/retry` | — | Regenerate the last assistant reply |
| `/undo` | — | Remove the last exchange and revert its file changes |
| `/export` | optional `json` | Save the chat to `bajajbot-<session>.md` (or `.json`) |
| `/search <text>` | required | Find text in this chat and jump between matches |
| `/sessions` | — | Resume a saved chat from an overlay |
| `/profile` | — | Switch a saved provider profile |
| `/new` | — | Start a fresh chat (plan board resets too) |
| `/logout` | — | Delete all config and sessions |
| `/help` | — | Show the command list inside the app |

Tip: type `/` and use **Tab** / arrows — every command autocompletes.

## Keyboard shortcuts

```text
Enter            Send message · confirm · run selected picker row
Esc              Interrupt streaming / close dialogs / deny action / cancel armed restore
↑ / ↓            Input history, or move inside pickers & autocomplete
Tab              Autocomplete slash commands and @file paths
PgUp / PgDn      Scroll chat history (mouse wheel works too)
Home / End       Jump to top / return to latest
Ctrl+C           Exit (shows the resume command for the session)
y / n            Allow / deny a risky tool confirmation
f                Pin or unpin ★ the highlighted model inside /model
```

While the assistant is streaming you can keep typing — press Enter to queue
messages; they send automatically when the reply finishes.

---

# How features work

## Agent tools

The assistant can call these tools on your project:

| Tool | What it does | Confirmation |
| --- | --- | --- |
| `read_file` | Read a text file | No |
| `list_dir` | List a directory | No |
| `search_files` | Regex-search file contents across the tree (skips `node_modules`/`.git`/binaries, smart-case) | No |
| `write_file` | Create or overwrite a file | Yes — diff shown |
| `edit_file` | Replace an exact snippet in a file | Yes — diff shown |
| `delete_path` | Permanently delete a file or directory | Yes |
| `run_command` | Run a shell command (bash/cmd) | Yes |
| `fetch_url` | Fetch a web page or API endpoint | Yes |
| `list_skills` / `load_skill` | Discover and follow skill playbooks | No |
| `set_plan` | Maintain the live task plan board | No |

Every risky action shows a confirmation prompt — `y` allows, `n`/`Esc` denies.
Edits preview a **colorized unified diff** before you approve. Paths accept
relative, absolute, and `~/…` forms; writing outside the project is allowed
but always confirmed. The last exchange's changes can be reverted with
`/undo` (deleted directories up to 500 files / 1 MB restorable).

## Plan board

Ask for anything multi-step ("add dark mode to this app") and the agent calls
`set_plan` with its steps. The board above your input shows:

```text
  plan 1/3
  ✓ inspect current theming
  ▸ add theme toggle state
  ○ wire styles
```

It updates live while streaming, persists with the session (survives resume),
and clears on `/new`. In `-p` print mode plans are simply skipped from output.

## File & image mentions (@path)

Prefix any path with `@` in your message:

```text
explain what @src/tools/fs.ts does
refactor both @src/ui/App.tsx and @bin/bajajbot.ts
what does this error screen show? @error.png
```

- Typing `@` opens a **live path autocomplete** (debounced, cached); Tab completes step by step through folders
- Only tokens resolving to existing files attach — stray `@mentions` are ignored
- Text files travel as fenced code blocks (60k char cap each); the chat display stays short
- Images (`.png` `.jpg` `.jpeg` `.gif` `.webp`) are sent as real vision parts, base64 inline, 4 MB cap each — needs a vision-capable model via `/model`

## Project instructions (`BAJAJBOT.md`)

Teach bajajbot your project's rules once — it applies them to every reply:

```markdown
# BAJAJBOT.md
- Package manager: pnpm only, never npm
- Never edit /legacy — generated code
- Run `pnpm lint` after any edit
- Commit style: conventional commits
```

Save it as `BAJAJBOT.md` in the project root (or `.bajajbot/BAJAJBOT.md`).
Global rules live in `~/.bajajbot/BAJAJBOT.md` and apply everywhere (project
rules are appended after global ones). Contents are re-read on every message,
so edits apply immediately; a startup note confirms when a project file is
picked up. 8k character budget, truncated safely.

## Persistent memory

The agent remembers across sessions. When it learns something durable — your
editor preference, the deploy target, "tests always run with vitest" — it
saves a fact with its `memory` tool, and every future session starts with
those facts already in context. Facts live in `~/.bajajbot/memory.md`
(200-fact cap, newest win, duplicates ignored). Browse what it knows with
`/memory`; the agent can remove entries on request ("forget the fly.io
fact").

## Skills


A skill is a markdown playbook:

```markdown
---
description: Ship the app to production
---
# Deploy
1. Run `npm test`
2. `npm run build`
3. `npm run deploy` and watch the health check
```

Where skills are loaded from (first match wins on name conflicts):

1. `<project>/.bajajbot/skills/*.md` and `<project>/.claude/skills/`
2. `~/.bajajbot/skills/*.md`
3. Agent-standard folders: `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/`, `~/.codex/skills/`

The agent sees names + descriptions in its system prompt and loads full
instructions with `load_skill` when your request matches. Use `/skills` to
browse everything installed and run one immediately.

## Git checkpoints & session changes

After **every reply** BajajBot snapshots the whole working tree to the hidden
ref `refs/bajajbot/checkpoints` using git plumbing only (a temporary index) —
your branch, staging area, stash and commit history are never touched. Works
even in repos with zero commits; silently skips non-git directories.

- `/checkpoints` lists snapshots newest-first with your prompt as the label; restoring overwrites files with their snapshot contents (files created *after* the snapshot are left alone)
- `/changes` diffs the first vs latest snapshot to list exactly what the agent did this session
- Snapshots are a rolling window: once `checkpointLimit` (default 300) is reached, the chain restarts and git's garbage collection reclaims the oldest ones — no unbounded growth

## Usage tracking & cost guardrails

- Every reply records requests/prompt/reply tokens and estimated cost onto the session (OpenRouter pricing)
- `/usage` (in chat) and `bajajbot usage` (CLI) roll totals up across all saved chats with a top-models breakdown
- `config set spendLimitUsd <n>` warns once per session when accumulated cost crosses the line

## Context meter & auto-compaction

The status bar shows how full the model's context budget is: dim normally,
yellow at ≥70%, red at ≥90%. Past the budget (`config set contextTokens`,
default 12000), older turns are AI-summarized into a single bridge message and
the conversation continues seamlessly — you'll see `✓ Compacted N older
message(s)`.

## Rate limits & errors

Free models throttle fast. On 429/5xx BajajBot retries automatically (backoff
+ provider `Retry-After`, up to 3 tries, abortable with Esc) and shows
`⚠ rate limited — retrying in 5s (attempt 1/3)` in the status bar. Errors come
back in plain English: bad key → "run `bajajbot config init`", out of credit
(402), unknown model (404), etc.

## Copying messages

- **Drag with the left mouse button** over chat text — highlights while dragging, copies on release (OSC 52, works over SSH; falls back to `pbcopy`/`wl-copy`/`xclip`/`clip`)
- `/copy` copies the last assistant reply without touching the mouse
- Hold **Shift** while dragging for your terminal's native selection

## Providers

| Provider | Base URL example | Model example |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-oss-20b:free` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| vLLM / LM Studio | Your server's `/v1` endpoint | Your served model ID |

Any OpenAI-compatible `/v1` endpoint works.

## Data on disk

Everything lives under `~/.bajajbot/` (Windows: `%USERPROFILE%\.bajajbot`):

```text
~/.bajajbot/
├── config.json          settings, profiles, favorites (0600 permissions)
├── sessions/*.json      every chat: messages, plan, usage totals
├── skills/              your global skills (*.md)
└── last-update-check    marker for the daily npm update check
```

Nothing is synced anywhere; messages go only to the endpoint you configure.

## Troubleshooting

- **"API key rejected (401)"** — run `bajajbot config init` and paste a fresh key
- **Rate limited constantly** — free models allow only a few requests per minute/day; wait or switch models with `/model`
- **Config corrupted** (e.g. stray characters edited into `config.json`) — BajajBot tells you the exact fix: repair the file or delete it and re-run `bajajbot config init`
- **Image mention fails** — switch to a vision-capable model with `/model`
- **Checkpoints empty** — they need a git project and at least two replies

## Upgrading

Installed from npm:

```sh
npm update -g bajajbot
npm install -g bajajbot@latest   # or pin explicitly
npx bajajbot@latest              # always newest without installing
```

BajajBot also checks npm once a day and prints a one-line notice at startup
when a newer version exists.

From a local clone:

```sh
git pull && npm install && npm run build && npm install -g .
bajajbot --version               # verify what's running
```

## Development

Requires Node.js 18+.

```sh
git clone <your-repository-url>
cd bajajbot
npm install
npm run build       # type-check + compile to dist/
npm test            # build + run the test suite
npm run dev         # run from source with tsx
npm run stream      # one-shot prompt without the TUI
```

### Project layout

```text
bin/bajajbot.ts          CLI entry (commander): -p, -c, positional prompts
src/config/              Config types, constants, load/save (~/.bajajbot)
src/provider/            OpenAI-compatible client (SSE streaming), retries, model list
src/tools/               Agent tools: fs, search, shell, web, skills, plan, git checkpoints
src/session/             Session model, history storage, compaction, usage aggregation
src/commands/            CLI commands (chat, config, sessions, usage, print mode)
src/ui/                  Ink components: App, pickers, overlays, plan board, markdown
src/util/                Attachments, diffs, update checks, small helpers
test/                    node:test suites
```

## Publish to npm

```sh
npm login
npm version patch        # bumps version and creates a git tag
npm run build
npm test
npm pack --dry-run       # inspect the package contents
npm publish
```

## License

Choose and add a license before publishing.

## Author

Sahil Bajaj — [Sahilbajaj2004@gmail.com](mailto:Sahilbajaj2004@gmail.com)
