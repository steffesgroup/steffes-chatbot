import { Message } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from 'eventsource-parser';
import { getModelConfigById } from './llmModels';

export class OpenAIError extends Error {
  type: string;
  param: string;
  code: string;

  constructor(message: string, type: string, param: string, code: string) {
    super(message);
    this.name = 'OpenAIError';
    this.type = type;
    this.param = param;
    this.code = code;
  }
}

export const OpenAIStream = async (
  model: OpenAIModel,
  systemPrompt: string,
  key: string,
  messages: Message[],
) => {
  const modelConfig = getModelConfigById(model.id);
  const modelEndpoint = modelConfig.endpoint;
  const apiKey = key ? key : modelConfig.apiKey;

  const provider = (modelConfig.provider || '').toLowerCase();
  const isAnthropic =
    provider === 'anthropic' || modelEndpoint.includes('/anthropic/v1');

  if (isAnthropic) {
    return AnthropicStream(modelConfig, systemPrompt, apiKey ?? '', messages);
  }

  if (!apiKey) {
    throw new Error(
      `No API key provided for model "${model.id}" (set apiKey in LLM_MODELS_JSON or provide a key in the UI)`,
    );
  }

  const body: Record<string, any> = {
    model: model.id,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      ...messages,
    ],
    stream: true,
  };

  if (modelConfig.request) {
    for (const [field, value] of Object.entries(modelConfig.request)) {
      if (value === null) {
        delete body[field];
      } else {
        body[field] = value;
      }
    }
  }

  const res = await fetch(`${modelEndpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': apiKey,
    },
    method: 'POST',
    body: JSON.stringify(body),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res.status !== 200) {
    const result = await res.json();
    if (result.error) {
      throw new OpenAIError(
        result.error.message,
        result.error.type,
        result.error.param,
        result.error.code,
      );
    } else {
      throw new Error(
        `OpenAI API returned an error: ${
          decoder.decode(result?.value) || result.statusText
        }`,
      );
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data;

          if (data === '[DONE]') {
            controller.close();
            return;
          }

          try {
            const json = JSON.parse(data);
            const text = json.choices[0]?.delta.content;
            if (
              text === null &&
              json.choices[0]?.['finish_reason'] === 'stop'
            ) {
              return;
            }
            if (!text) {
              console.error();
              console.trace();
              return;
            }
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            // controller.error(e);
            console.error(e);
            console.trace(e);
          }
        }
      };

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return stream;
};

async function AnthropicStream(
  modelConfig: {
    endpoint: string;
    apiKey?: string;
    model?: string;
    request?: Record<string, any>;
  },
  systemPrompt: string,
  apiKey: string,
  messages: Message[],
): Promise<ReadableStream> {
  if (!apiKey) {
    throw new Error(
      `No API key provided for model "${
        modelConfig.model ?? 'anthropic'
      }" (set apiKey in LLM_MODELS_JSON or provide a key in the UI)`,
    );
  }

  const endpoint = modelConfig.endpoint.endsWith('/messages')
    ? modelConfig.endpoint
    : `${modelConfig.endpoint.replace(/\/$/, '')}/messages`;

  const anthropicModel = modelConfig.model;
  if (!anthropicModel) {
    throw new Error(
      'Anthropic model config is missing "model" (e.g. "claude-opus-4-5").',
    );
  }

  const baseBody: Record<string, any> = {
    model: anthropicModel,
    system: systemPrompt,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
    max_tokens: 1000,
    temperature: 0.7,
  };

  if (modelConfig.request) {
    for (const [field, value] of Object.entries(modelConfig.request)) {
      if (value === null) {
        delete baseBody[field];
      } else {
        baseBody[field] = value;
      }
    }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(baseBody),
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  if (res.status !== 200) {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch {
      bodyText = '';
    }
    throw new Error(
      `Anthropic API returned an error: ${res.status} ${res.statusText}${
        bodyText ? ` - ${bodyText}` : ''
      }`,
    );
  }

  const contentType = res.headers.get('content-type') || '';
  const isSse = contentType.includes('text/event-stream');

  if (!isSse) {
    // Non-stream fallback: convert a single JSON response into a ReadableStream.
    const json = await res.json();
    const text = Array.isArray(json?.content)
      ? json.content
          .filter((c: any) => c?.type === 'text' && typeof c?.text === 'string')
          .map((c: any) => c.text)
          .join('')
      : '';
    return new ReadableStream({
      start(controller) {
        if (text) controller.enqueue(encoder.encode(text));
        controller.close();
      },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type !== 'event') return;
        const data = event.data;
        if (!data) return;

        try {
          const json = JSON.parse(data);
          // Anthropic Messages streaming events.
          // We enqueue deltas from content_block_delta (delta.text).
          if (json?.type === 'content_block_delta') {
            const text = json?.delta?.text;
            if (typeof text === 'string' && text.length > 0) {
              controller.enqueue(encoder.encode(text));
            }
            return;
          }
          if (json?.type === 'message_stop') {
            controller.close();
            return;
          }
        } catch (e) {
          console.error(e);
          console.trace(e);
        }
      };

      const parser = createParser(onParse);
      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return stream;
}
