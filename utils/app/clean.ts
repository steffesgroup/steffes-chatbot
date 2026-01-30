import { Conversation } from '@/types/chat';
import { OpenAIModel } from '@/types/openai';
import { DEFAULT_SYSTEM_PROMPT } from './const';

export const cleanSelectedConversation = (
  conversation: Conversation,
  options: {
    fallbackModel: OpenAIModel;
    validModelIds?: string[];
  },
) => {
  // added model for each conversation (3/20/23)
  // added system prompt for each conversation (3/21/23)
  // added folders (3/23/23)
  // added prompts (3/26/23)

  let updatedConversation = conversation;

  // Model validation: ensure model exists in current models
  const validModelIds = options.validModelIds;
  const fallbackModel = options.fallbackModel;

  if (
    !updatedConversation.model ||
    // The model may be a partially serialized object (old export), check its id
    !updatedConversation.model.id ||
    (Array.isArray(validModelIds) &&
      !validModelIds.includes(updatedConversation.model.id))
  ) {
    updatedConversation = {
      ...updatedConversation,
      model: fallbackModel,
    };
  }

  // check for system prompt on each conversation
  if (!updatedConversation.prompt) {
    updatedConversation = {
      ...updatedConversation,
      prompt: updatedConversation.prompt || DEFAULT_SYSTEM_PROMPT,
    };
  }

  if (!updatedConversation.folderId) {
    updatedConversation = {
      ...updatedConversation,
      folderId: updatedConversation.folderId || null,
    };
  }

  return updatedConversation;
};

export const cleanConversationHistory = (
  history: any[],
  options: {
    fallbackModel: OpenAIModel;
    validModelIds?: string[];
  },
): Conversation[] => {
  // added model for each conversation (3/20/23)
  // added system prompt for each conversation (3/21/23)
  // added folders (3/23/23)
  // added prompts (3/26/23)

  if (!Array.isArray(history)) {
    console.warn('history is not an array. Returning an empty array.');
    return [];
  }

  const validModelIds = options.validModelIds;
  const fallbackModel = options.fallbackModel;

  return history.reduce((acc: any[], conversation) => {
    try {
      if (
        !conversation.model ||
        !conversation.model.id ||
        (Array.isArray(validModelIds) &&
          !validModelIds.includes(conversation.model.id))
      ) {
        conversation.model = fallbackModel;
      }

      if (!conversation.prompt) {
        conversation.prompt = DEFAULT_SYSTEM_PROMPT;
      }

      if (!conversation.folderId) {
        conversation.folderId = null;
      }

      acc.push(conversation);
      return acc;
    } catch (error) {
      console.warn(
        `error while cleaning conversations' history. Removing culprit`,
        error,
      );
    }
    return acc;
  }, []);
};
