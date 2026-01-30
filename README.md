# Todo

- Cache-bust default system prompt
- Auto bump app version

# Configuring LLMs

LLM models are configured via a single JSON env var.
Each entry uses a fully-qualified Azure OpenAI chat/completions URL and an API key.
Allowed entry properties: id, name, endpoint, apiKey, maxLength, tokenLimit, request

## `LLM_MODELS_JSON` format

This app reads `LLM_MODELS_JSON` at runtime and:

- Uses `id`, `name`, `maxLength`, `tokenLimit` for the UI model list.
- Uses `endpoint` + `apiKey` (or an override entered in the UI) for server calls.
- Builds an Azure OpenAI **Chat Completions** request body and then merges any optional per-model overrides from `request`.

Important:

- `endpoint` must be a **fully-qualified** Chat Completions URL (it should include `/openai/deployments/<deployment>/chat/completions?api-version=...`).
- If you edit `.env.local`, restart `npm run dev` so Next.js reloads environment variables.

## `request` overrides

If you want to send additional request fields (or override defaults) they must go under the `request` object.

Example:

- To set `temperature`, put it under `request.temperature` (not top-level).
- To remove a field from the outgoing payload, set it to `null` under `request`.

For example:

```json
[
  {
    "id": "gpt-5",
    "name": "GPT-5",
    "endpoint": "https://resourceName.openai.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-01-01-preview",
    "apiKey": "...",
    "request": {
      "temperature": 1,
      "top_p": 0.95,
      "presence_penalty": 0,
      "frequency_penalty": 0
    }
  }
]
```

If a model rejects a parameter (some deployments only support the default sampling values), remove it by setting it to `null`:

```json
[
  {
    "id": "gpt-5",
    "name": "GPT-5",
    "endpoint": "https://resourceName.openai.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-01-01-preview",
    "apiKey": "...",
    "request": {
      "temperature": null
    }
  }
]
```

```json
[
  {
    "id": "gpt-4.1",
    "name": "GPT-4.1",
    "endpoint": "https://resourceName.openai.azure.com/openai/deployments/gpt-4.1/chat/completions?api-version=2025-01-01-preview",
    "apiKey": "foo"
  },
  {
    "id": "gpt-5",
    "name": "GPT-5",
    "endpoint": "https://resourceName.openai.azure.com/openai/deployments/gpt-5/chat/completions?api-version=2025-01-01-preview",
    "apiKey": "bar"
  },
  {
    "id": "gpt-5.2",
    "name": "GPT-5.2",
    "endpoint": "https://resourceName.cognitiveservices.azure.com/openai/deployments/gpt-5.2/chat/completions?api-version=2024-04-01-preview",
    "apiKey": "baz"
  }
]
```
