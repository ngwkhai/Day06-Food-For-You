import { isSessionIntroMessage } from "./chat-intro";
import type { ChatHistoryMessage, ChatMessage } from "./types";

export function buildChatHistory(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages
    .filter(
      (message) =>
        !message.isStreaming &&
        !isSessionIntroMessage(message) &&
        message.content.trim().length > 0
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim()
    }));
}
