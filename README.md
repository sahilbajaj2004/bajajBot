# BajajBot

**Fast, private terminal chat for any OpenAI-compatible model.**

Bring your own API key, choose your model, and chat from your terminal. BajajBot
supports OpenRouter and custom endpoints such as Ollama, vLLM, and LM Studio.

```sh
npx bajajbot
```

No shell execution. No project-file access. No agent tools. Only chat.

## Why BajajBot?

- Live token streaming in a clean terminal UI
- Your choice of model and provider
- First-run setup: no config files to create manually
- Conversations saved locally and resumable
- OpenAI-compatible APIs, including self-hosted models
- API key masked in CLI output and stored only on your computer

## Quick start

Run without installing globally:

```sh
npx bajajbot
```

Or install once:

```sh
npm install -g bajajbot
bajajbot
```

On first launch BajajBot asks for:

1. Provider: OpenRouter or a custom OpenAI-compatible endpoint
2. Your API key
3. API base URL
4. Model ID, for example `openai/gpt-oss-20b:free`

Then start chatting. Configuration is saved at `~/.bajajbot/config.json`.

## Commands

```sh
bajajbot                         # start a new chat
bajajbot config show             # show current config; API key stays masked
bajajbot config set-model <id>   # change default model
bajajbot sessions                # select a saved chat
bajajbot chat --resume <id>      # resume a chat directly
```

Inside chat, these slash commands are available:

```text
/model <id>     Switch the active model for this chat session
/model          Open a searchable model picker
/sessions       Resume a saved chat from an overlay
/new            Start a fresh chat
/help           Show available slash commands
```

The interface renders replies as markdown with syntax-highlighted code,
offers command autocomplete as you type `/`, recalls sent messages with
the arrow keys, and lets you stop generation mid-stream with `Esc`.

## Architecture

```text
Terminal command
      │
      ├── Config
      │     ~/.bajajbot/config.json
      │
      └── Ink chat UI
             │
             ├── OpenAI-compatible client
             │     POST /chat/completions
             │     manual SSE token parser
             │
             └── Session history
                   ~/.bajajbot/sessions/<id>.json
```

The terminal UI collects messages, buffers streamed tokens for smooth renders,
and stores every completed reply locally. The provider client sends only chat
roles and message content to your selected API endpoint.

## Providers

| Provider | Base URL example | Model example |
| --- | --- | --- |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-oss-20b:free` |
| Ollama | `http://localhost:11434/v1` | `llama3.2` |
| vLLM / LM Studio | Your server's `/v1` endpoint | Your served model ID |

## Privacy and scope

Your API key and session history remain under `~/.bajajbot/`. BajajBot does
not inspect your project directory, run shell commands, edit files, or invoke
agent tools. Messages go only to the provider endpoint you configure.

## Development

Requires Node.js 18+.

```sh
git clone <your-repository-url>
cd bajajbot
npm install


```

Run verification:

```sh
npm test
```

## Publish to npm

```sh
npm login
npm run build
npm test
npm pack --dry-run
npm publish
```

Each publish needs a new version:

```sh
npm version patch --no-git-tag-version
```

## License

Choose and add a license before publishing.

## Author

Sahil Bajaj — [Sahilbajaj2004@gmail.com](mailto:Sahilbajaj2004@gmail.com)
