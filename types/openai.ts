export interface OpenAIModel {
  id: string;
  name: string;
  maxLength: number; // maximum length of a message
  tokenLimit: number;
}

/**
 * Model IDs are runtime-configured via `LLM_MODELS_JSON`.
 * Keep this as a string type so the UI/server can accept any configured model.
 */
export type OpenAIModelID = string;
