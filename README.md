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
- **Agent tools** — read, write, edit, delete files, list directories, run shell commands, and fetch web pages
- Risky actions require explicit confirmation; nothing runs without your approval
- Your choice of model and provider, switchable mid-chat with `/model` (type any model ID, even unlisted ones)
- Saved provider profiles — switch endpoints with `/profile`
- Message queueing while streaming, `/retry`, `/undo`, `/export`, `/search`
- Per-reply token usage and estimated cost (OpenRouter pricing)
- First-run setup wizard — no config files to create manually
- Conversations saved locally and resumable any time
- Markdown replies with syntax-highlighted code
- Mouse-wheel scrolling, drag-to-select text copying, PageUp/PageDown, and input history with arrow keys
- Stop generation mid-stream with `Esc`
- API key masked in CLI output and stored only on your computer
- Cross-platform: bash on macOS/Linux, cmd on Windows

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

Configuration is saved at `~/.bajajbot/config.json` (Windows:
`C:\Users\<you>\.bajajbot\config.json`).

## CLI commands

```sh
bajajbot                         # start a new chat
bajajbot chat --resume <id>      # resume a saved chat directly
bajajbot sessions                # pick a saved chat from a picker
bajajbot config init             # re-run the setup wizard
bajajbot config show             # show config; API key stays masked
bajajbot config set-model <id>   # change the default model
bajajbot config set temperature 0.7          # generation override (0-2)
bajajbot config set maxTokens 4096           # cap reply length
bajajbot config set systemPrompt "Be terse"  # replace the system prompt
bajajbot config unset temperature            # clear an override
bajajbot profile save work       # save current provider settings as a profile
bajajbot profile list            # list saved profiles
bajajbot profile use work        # switch to a profile
bajajbot logout                  # delete config and all sessions
```

## Slash commands (inside chat)

```text
/model <id>      Switch the model for this chat
/model           Open a searchable model picker (type to filter, Enter to choose)
/copy            Copy the last assistant reply to the clipboard
/retry           Regenerate the last assistant reply
/undo            Remove the last exchange
/export          Save the chat to bajajbot-<session>.md (arg: json)
/search <text>   Find text in this chat and jump to a match
/sessions        Resume a saved chat from an overlay
/profile         Switch a saved provider profile
/new             Start a fresh chat
/logout          Delete all config and sessions
/help            Show the command list
```

While the assistant is streaming you can keep typing — press Enter to queue
messages; they send automatically when the reply finishes.

## Agent tools

BajajBot's assistant can use these tools on your project directory:

| Tool | What it does | Confirmation |
| --- | --- | --- |
| `read_file` | Read a text file | No |
| `list_dir` | List a directory | No |
| `write_file` | Create or overwrite a file | Yes |
| `edit_file` | Replace an exact snippet in a file | Yes |
| `delete_path` | Permanently delete a file or directory | Yes |
| `run_command` | Run a shell command (bash/cmd) | Yes |
| `fetch_url` | Fetch a web page or API endpoint | Yes |

Every risky action shows a confirmation prompt before it runs — press `y` to
allow or `n`/`Esc` to deny. All paths are sandboxed to the working directory;
anything outside it is rejected.

## Keyboard shortcuts

```text
Enter            Send message / confirm
Esc              Interrupt streaming / close dialogs / deny action
↑ / ↓            Input history, or move in pickers
PgUp / PgDn      Scroll chat history (mouse wheel works too)
Home / End       Jump to top / return to latest
Ctrl+C           Exit (shows resume command for the session)
Tab              Autocomplete slash commands
```

## Copying messages

- **Drag with the left mouse button** over chat text — it highlights while you
  drag and copies to the clipboard on release (with a `✓ Copied N chars` note).
  Uses OSC 52, so it works even over SSH in supporting terminals, with
  `pbcopy` / `wl-copy` / `xclip` as local fallbacks.
- `/copy` copies the last assistant reply without touching the mouse.
- Hold **Shift** while dragging to use your terminal's native selection instead.

## Providers

| Provider | Base URL example | Model example |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-oss-20b:free` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| vLLM / LM Studio | Your server's `/v1` endpoint | Your served model ID |

Any OpenAI-compatible `/v1` endpoint works.

## Privacy and data

- Config and sessions stay under `~/.bajajbot/` — nothing is synced anywhere
- API key is stored with `0600` permissions and always masked in output
- Messages go only to the endpoint you configure
- File/shell tools are scoped to the directory where you launched `bajajbot`

## Upgrading

Installed from npm:

```sh
npm update -g bajajbot
# or pin to latest explicitly
npm install -g bajajbot@latest
```

Or always run the newest version without installing:

```sh
npx bajajbot@latest
```

Installed from a local clone (your own fork / unpublished build):

```sh
git pull
npm install
npm run build
npm install -g .        # re-links the global command to the new build
```

Verify what's running:

```sh
bajajbot --version
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
bin/bajajbot.ts          CLI entry (commander)
src/config/              Config types, constants, load/save (~/.bajajbot)
src/provider/            OpenAI-compatible client (SSE streaming) + model list
src/tools/               Agent tools: fs, shell, schemas, system prompt
src/session/             Session model + local history storage
src/commands/            CLI commands (chat, config, sessions)
src/ui/                  Ink components: App, pickers, overlays, markdown
src/util/                Small shared helpers
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
