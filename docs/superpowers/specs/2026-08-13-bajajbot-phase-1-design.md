# BajajBot Phase 1: Configuration

## Scope

Build only configuration storage and CLI setup. This phase creates no chat UI,
provider requests, session records, shell access, project-file access, or tools.

## Commands

- `bajajbot config init`: prompt for provider, API key, base URL, and default
  model; persist the resulting configuration.
- `bajajbot config set-model <id>`: replace only `defaultModel` in an existing
  configuration.
- `bajajbot config show`: print config with API key masked.

## Storage

Config lives at `~/.bajajbot/config.json`. First save also creates
`~/.bajajbot/sessions/` for later phases. The project directory is never read
or written by the chatbot runtime.

```ts
interface Config {
  provider: "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
}
```

`loadConfig()` throws a clear missing-config error. Commands catch that error
and direct users to `bajajbot config init` instead of printing a stack trace.

## Prompt behavior

`config init` uses Node readline. OpenRouter supplies its standard base URL as
the default; custom provider requires a user-entered OpenAI-compatible base
URL. Both request API key and default model.

## Verification

Automated check uses a temporary home directory: initialize config, load it
back, assert field equality, then confirm `set-model` changes no other field.
`config show` must not expose the full API key.
