import type {
  ChatHistoryMessage,
  LlmChatHistoryContext,
  OlderChatTurn,
  RecentChatTurn,
} from "../types/chat.js";

const MAX_HISTORY_MESSAGES = 40;
const DEFAULT_RECENT_TURN_COUNT = 8;
const DEFAULT_OLDER_TURN_MAX_CHARS = 160;

export const CONTEXT_PRIORITY_ORDER =
  "user_message (cao nhất) > recent_turns (recency_rank cao hơn = gần hiện tại hơn) > previous_constraints > older_turns (thấp nhất, chỉ tham khảo nền)";

function getRecentTurnCount(): number {
  const configured = Number(process.env.CHAT_RECENT_TURN_COUNT);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_RECENT_TURN_COUNT;
}

function getOlderTurnMaxChars(): number {
  const configured = Number(process.env.CHAT_OLDER_TURN_MAX_CHARS);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_OLDER_TURN_MAX_CHARS;
}

export function truncateForOlderContext(
  content: string,
  maxChars = getOlderTurnMaxChars(),
): string {
  const trimmed = content.trim();

  if (trimmed.length <= maxChars) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function prepareChatHistoryForLlm(
  history: ChatHistoryMessage[],
): LlmChatHistoryContext {
  const recentTurnCount = getRecentTurnCount();

  if (history.length === 0) {
    return {
      context_priority: CONTEXT_PRIORITY_ORDER,
      recent_turns: [],
      older_turns: [],
    };
  }

  const splitIndex = Math.max(0, history.length - recentTurnCount);
  const olderMessages = history.slice(0, splitIndex);
  const recentMessages = history.slice(splitIndex);
  const recentStartRank = olderMessages.length + 1;

  const recent_turns: RecentChatTurn[] = recentMessages.map((turn, index) => ({
    role: turn.role,
    content: turn.content,
    priority: "high",
    recency_rank: recentStartRank + index,
  }));

  const older_turns: OlderChatTurn[] = olderMessages.map((turn) => ({
    role: turn.role,
    content_summary: truncateForOlderContext(turn.content),
    priority: "low",
  }));

  return {
    context_priority: CONTEXT_PRIORITY_ORDER,
    recent_turns,
    older_turns,
  };
}

export function buildChatHistoryPayload(history: ChatHistoryMessage[]): {
  context_priority: string;
  recent_turns: RecentChatTurn[];
  older_turns?: OlderChatTurn[];
} {
  const prepared = prepareChatHistoryForLlm(history);

  if (prepared.older_turns.length === 0) {
    return {
      context_priority: prepared.context_priority,
      recent_turns: prepared.recent_turns,
    };
  }

  return {
    context_priority: prepared.context_priority,
    recent_turns: prepared.recent_turns,
    older_turns: prepared.older_turns,
  };
}

export function normalizeChatHistory(history: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized: ChatHistoryMessage[] = [];

  for (const item of history) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;

    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string"
    ) {
      continue;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      continue;
    }

    normalized.push({
      role,
      content: trimmedContent,
    });
  }

  return normalized.slice(-MAX_HISTORY_MESSAGES);
}
