import { OpenAIModel } from '@/types/openai';

type RequestOverrideValue = string | number | boolean | null;

type RequestOverrides = Record<string, RequestOverrideValue>;

export interface LlmModelConfig extends OpenAIModel {
  endpoint: string;
  apiKey?: string;
  /**
   * Optional provider hint. If set to `anthropic`, requests will be sent to the Anthropic Messages API.
   * Defaults to OpenAI-compatible chat/completions.
   */
  provider?: string;
  /**
   * Underlying provider model name (e.g. `claude-opus-4-5` for Anthropic Messages API).
   */
  model?: string;
  /**
   * Extra request fields to merge into the chat/completions payload.
   * - If a value is `null`, that field will be removed from the payload.
   */
  request?: RequestOverrides;
}

function assertString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      `LLM_MODELS_JSON: "${fieldName}" must be a non-empty string`,
    );
  }
}

function asNumberOrDefault(value: unknown, defaultValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return defaultValue;
}

export function getLlmModelConfigsFromEnv(): LlmModelConfig[] {
  const raw = process.env.LLM_MODELS_JSON;
  if (!raw) {
    throw new Error('Missing env var LLM_MODELS_JSON');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error('LLM_MODELS_JSON must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('LLM_MODELS_JSON must be a JSON array');
  }

  const configs = parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`LLM_MODELS_JSON[${index}] must be an object`);
    }

    const obj = item as Record<string, unknown>;

    assertString(obj.id, `models[${index}].id`);
    assertString(obj.name, `models[${index}].tempname`);
    assertString(obj.endpoint, `models[${index}].endpoint`);

    const apiKey = typeof obj.apiKey === 'string' ? obj.apiKey : undefined;
    const provider =
      typeof obj.provider === 'string' ? obj.provider : undefined;
    const model = typeof obj.model === 'string' ? obj.model : undefined;

    const maxLength = asNumberOrDefault(obj.maxLength, 12000);
    const tokenLimit = asNumberOrDefault(obj.tokenLimit, 4000);

    const request =
      obj.request &&
      typeof obj.request === 'object' &&
      !Array.isArray(obj.request)
        ? (obj.request as RequestOverrides)
        : undefined;

    const config: LlmModelConfig = {
      id: obj.id,
      name: obj.name,
      endpoint: obj.endpoint,
      apiKey,
      provider,
      model,
      maxLength,
      tokenLimit,
      request,
    };

    return config;
  });

  const ids = new Set<string>();
  for (const c of configs) {
    if (ids.has(c.id)) {
      throw new Error(`LLM_MODELS_JSON contains duplicate model id: ${c.id}`);
    }
    ids.add(c.id);
  }

  if (configs.length === 0) {
    throw new Error('LLM_MODELS_JSON must contain at least one model');
  }

  return configs;
}

export function getPublicModelsFromEnv(): OpenAIModel[] {
  return getLlmModelConfigsFromEnv().map(
    ({ id, name, maxLength, tokenLimit }) => ({
      id,
      name,
      maxLength,
      tokenLimit,
    }),
  );
}

export function getDefaultModelIdFromEnv(): string {
  const models = getLlmModelConfigsFromEnv();
  const desired = process.env.DEFAULT_MODEL;
  if (desired && models.some((m) => m.id === desired)) {
    return desired;
  }
  return models[0].id;
}

export function getModelConfigById(modelId: string): LlmModelConfig {
  const models = getLlmModelConfigsFromEnv();
  const found = models.find((m) => m.id === modelId);
  if (!found) {
    throw new Error(`No registered model matches selection "${modelId}"`);
  }
  return found;
}
