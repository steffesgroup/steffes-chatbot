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
  console.log('lalonde', modelConfig);

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
