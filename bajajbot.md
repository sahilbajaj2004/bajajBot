# Terminal AI Chatbot — Build Spec

## 1. What we're building

A terminal-based AI chatbot distributed as an npm package (`npx bajajbot chat`). It is a **pure chat client** — no file editing, no shell command execution, no agentic tool use. Just a fast, good-looking terminal chat interface against any OpenAI-compatible LLM API.

### Core capabilities
- Provider/model selectable at runtime — primarily OpenRouter (single API, many models), plus support for a custom self-hosted OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, etc.)
- Rich terminal UI built with Ink (React for terminals) — message list, input box, status bar showing active model
- Live token streaming — replies render as they're generated, not dumped at the end
- Persistent sessions — every conversation saved to disk, resumable later
- Config-driven — API key, provider, base URL, default model stored in `~/.bajajbot/config.json`, set via a CLI command, editable anytime

### Explicit non-goals (do not build these)
- No shell command execution
- No file read/write on the user's project directory
- No agentic tool-use loop (that's a separate future project, not this one)
- No GUI, no Electron — terminal only

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript | Type safety for API payloads/config schemas |
| Runtime | Node.js (≥18, for native `fetch`) | |
| Terminal UI | Ink (`ink`, `react`) | Component-based, handles re-render on streaming state |
| CLI parsing | `commander` | Subcommands: `chat`, `config`, `sessions`, `models` |
| HTTP/streaming | Native `fetch` + manual SSE parsing | OpenRouter's streaming format needs manual chunk parsing anyway; skip the OpenAI SDK |
| Storage | Plain JSON files on disk | No DB needed at this scale |
| Packaging | npm, `bin` field in `package.json` | Installable/runnable via `npx` |

---

## 3. Folder structure

```
bajajbot/
  bin/
    bajajbot.tsx            # CLI entry point, registers commander commands
  src/
    config/
      store.ts              # read/write ~/.bajajbot/config.json
      types.ts              # Config interface
    provider/
      client.ts             # streamChat() — OpenAI-compatible streaming client
      models.ts             # fetchModels() — GET OpenRouter model list
    session/
      history.ts            # save/load/list session JSON files
      types.ts               # Session, Message interfaces
    ui/
      App.tsx                # root Ink component, owns chat state
      MessageList.tsx        # renders message history
      InputBox.tsx           # text input, submit on Enter
      StatusBar.tsx           # shows active provider/model, connection state
      ModelPicker.tsx          # Ink list component for `bajajbot models`
      SessionPicker.tsx        # Ink list component for `bajajbot sessions`
    commands/
      chat.ts                # `bajajbot chat` — boots Ink app
      configCmd.ts             # `bajajbot config init|set-model|show`
      sessionsCmd.ts            # `bajajbot sessions list|resume <id>`
      modelsCmd.ts               # `bajajbot models`
  package.json
  tsconfig.json
  README.md
```

---

## 4. Data schemas

### `~/.bajajbot/config.json`
```typescript
interface Config {
  provider: "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;        // e.g. "https://openrouter.ai/api/v1" or a local endpoint
  defaultModel: string;   // e.g. "anthropic/claude-sonnet-4.5"
}
```

### `~/.bajajbot/sessions/<id>.json`
```typescript
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;      // ISO 8601
}

interface Session {
  id: string;              // e.g. slug + timestamp, generated on creation
  createdAt: string;
  updatedAt: string;
  model: string;            // model used for this session
  messages: Message[];
}
```

---

## 5. Module specs

### 5.1 `config/store.ts`
```typescript
function loadConfig(): Config;              // throws if config missing — caller should tell user to run `config init`
function saveConfig(config: Config): void;
function configExists(): boolean;
```
Creates `~/.bajajbot/` and `~/.bajajbot/sessions/` on first run if missing.

### 5.2 `provider/client.ts`
```typescript
async function* streamChat(config: Config, messages: Message[]): AsyncGenerator<string>;
```
- POSTs to `${config.baseUrl}/chat/completions` with `Authorization: Bearer ${apiKey}`, `stream: true`
- Manually parses SSE: split on newlines, look for `data: ` prefix, `[DONE]` sentinel ends the stream, otherwise `JSON.parse` and yield `choices[0].delta.content`
- Must handle partial chunks (buffer incomplete lines across reads — see reference implementation below)
- On non-200 response, throw an error with status + body text so the UI can show a real error, not a silent hang

Reference implementation (agent should adapt, not necessarily copy verbatim):
```typescript
export async function* streamChat(config: Config, messages: Message[]) {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: config.defaultModel, messages, stream: true }),
  });

  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      const token = JSON.parse(data).choices?.[0]?.delta?.content;
      if (token) yield token;
    }
  }
}
```

### 5.3 `provider/models.ts`
```typescript
interface ModelInfo { id: string; name: string; contextLength: number; }
async function fetchModels(baseUrl: string): Promise<ModelInfo[]>;
```
`GET ${baseUrl}/models` — no auth required for OpenRouter's public model list.

### 5.4 `session/history.ts`
```typescript
function saveSession(session: Session): void;
function loadSession(id: string): Session;
function listSessions(): { id: string; createdAt: string; preview: string }[]; // preview = first ~60 chars of first user message
function createSession(model: string): Session; // generates id, empty messages
```
Save after **every completed assistant reply**, not just on exit — protects against crash mid-session.

### 5.5 `ui/App.tsx`
Owns: `messages` state, `streamingReply` state (buffer, not per-token — see streaming note below), `input` state.

Flow on submit:
1. Append user message to state
2. Call `streamChat`, accumulate tokens into a local buffer
3. Flush buffer to `streamingReply` state on an interval (~50ms), not on every yielded token — per-token `setState` in Ink causes visible flicker/dropped frames
4. On stream end, append final assistant message to `messages`, clear `streamingReply`, call `saveSession`

### 5.6 CLI commands (`commander`)
```
bajajbot config init              # interactive prompts: provider, API key, base URL, default model → saveConfig
bajajbot config set-model <id>    # update defaultModel only
bajajbot config show              # print current config (mask API key)
bajajbot models                   # fetch + render picker (ModelPicker.tsx)
bajajbot chat                     # create new session, boot App.tsx
bajajbot chat --resume <id>       # load existing session, boot App.tsx with it
bajajbot sessions                 # list sessions, Ink picker → resume selected
```

---

## 6. Build order (do not parallelize — each phase validates the previous)

1. **Config layer** — `config/store.ts` + `config init` command as plain readline prompts (no Ink yet). Verify `~/.bajajbot/config.json` round-trips correctly.
2. **Provider client, standalone** — write `streamChat`, test from a bare script that just `console.log`s each yielded token against a real OpenRouter key. Confirm streaming actually works before touching UI.
3. **Basic Ink app, no streaming** — send full (non-streamed) requests, render request/response. Get component structure and layout right first.
4. **Wire streaming into Ink** — only after 2 and 3 both independently work. If output looks garbled, bisect: log raw tokens to a file to check if the bug is in the client or in the Ink re-render/buffering.
5. **Session persistence + resume command.**
6. **Model picker + config commands polish.**

---

## 7. Error handling requirements
- Missing config on `chat` command → clear message pointing to `config init`, not a stack trace
- API error (bad key, rate limit, model not found) → show the actual status/message in the UI, don't swallow it
- Network failure mid-stream → catch, show "connection lost" in UI, session up to that point still gets saved

---

## 8. Explicitly out of scope for this spec
Do not add: shell command execution, file system access to user projects, multi-agent orchestration, plugin system. If any of these come up mid-build, flag it back rather than building it in.
