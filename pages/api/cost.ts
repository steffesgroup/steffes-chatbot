import { CostBody, CostResponse } from '@/types/chat';
import { getModelConfigById } from '@/utils/server/llmModels';
import tiktokenModel from '@dqbd/tiktoken/encoders/cl100k_base.json';
import { Tiktoken, init } from '@dqbd/tiktoken/lite/init';
import { calcPrice } from '@pydantic/genai-prices';
// @ts-expect-error
import wasm from '../../node_modules/@dqbd/tiktoken/lite/tiktoken_bg.wasm?module';

export const config = {
  runtime: 'edge',
};

const handler = async (req: Request): Promise<Response> => {
  try {
    const { model, messages, prompt, assistantMessage } =
      (await req.json()) as CostBody;

    await init((imports) => WebAssembly.instantiate(wasm, imports));
    const encoding = new Tiktoken(
      tiktokenModel.bpe_ranks,
      tiktokenModel.special_tokens,
      tiktokenModel.pat_str,
    );

    let inputTokens = encoding.encode(prompt).length;

    for (const message of messages) {
      inputTokens += encoding.encode(message.content).length;
    }

    const outputTokens = encoding.encode(assistantMessage).length;
    encoding.free();

    const usage = {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    };

    const pricingCandidates = getPricingModelCandidates(model.id);

    let pricingModelId: string | undefined;
    let price = null;

    for (const candidate of pricingCandidates) {
      const candidatePrice = calcPrice(usage, candidate);
      if (candidatePrice) {
        pricingModelId = candidate;
        price = candidatePrice;
        break;
      }
    }

    const warning =
      !price && pricingCandidates.length > 0
        ? `No price found for model "${
            model.id
          }". Tried: ${pricingCandidates.join(', ')}`
        : undefined;

    if (warning) {
      console.warn('[cost] Pricing lookup failed', {
        modelId: model.id,
        pricingCandidates,
      });
    }

    const result: CostResponse = {
      inputTokens,
      outputTokens,
      totalCostUSD: price?.total_price ?? 0,
      priced: !!price,
      pricingModelId,
      warning,
    };

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error(error);

    return new Response('Error', { status: 500, statusText: error.message });
  }
};

export default handler;

function getPricingModelCandidates(publicModelId: string): string[] {
  const candidates = new Set<string>();

  try {
    const config = getModelConfigById(publicModelId);
    if (config.model) {
      candidates.add(config.model);
    }
  } catch {
    // Ignore and continue with fallbacks.
  }

  candidates.add(publicModelId);

  const normalized = publicModelId.toLowerCase().trim();
  const aliasMap: Record<string, string> = {
    'claude-opus-4.5': 'claude-opus-4-5',
    'claude-opus-45': 'claude-opus-4-5',
    'claude-sonnet-4.5': 'claude-sonnet-4-5',
    'claude-sonnet-45': 'claude-sonnet-4-5',
  };

  if (aliasMap[normalized]) {
    candidates.add(aliasMap[normalized]);
  }

  return [...candidates];
}
