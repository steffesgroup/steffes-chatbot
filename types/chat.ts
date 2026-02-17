import { OpenAIModel } from './openai';

export interface Message {
  role: Role;
  content: string;
  costUSD?: number;
}

export type Role = 'assistant' | 'user';

export interface ChatBody {
  model: OpenAIModel;
  messages: Message[];
  key: string;
  prompt: string;
}

export interface CostBody {
  model: OpenAIModel;
  messages: Message[];
  prompt: string;
  assistantMessage: string;
}

export interface CostResponse {
  inputTokens: number;
  outputTokens: number;
  totalCostUSD: number;
  priced: boolean;
  pricingModelId?: string;
  warning?: string;
}

export interface Conversation {
  id: string;
  name: string;
  messages: Message[];
  model: OpenAIModel;
  prompt: string;
  folderId: string | null;
}
