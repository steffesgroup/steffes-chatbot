// Update this version whenever you want to force localStorage resets for app-breaking/model changes
export const APP_VERSION = '1.0.0';
export const DEFAULT_SYSTEM_PROMPT =
  process.env.NEXT_PUBLIC_DEFAULT_SYSTEM_PROMPT ||
  "You are ChatGPT, a large language model trained by OpenAI. Follow the user's instructions carefully. Respond using markdown.";

// Used by /api/google (OpenAI public API flow)
export const OPENAI_API_HOST =
  process.env.OPENAI_API_HOST || 'https://api.openai.com';
