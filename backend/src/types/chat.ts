export type ChatHistoryRole = "user" | "assistant";

export type ChatHistoryMessage = {
  role: ChatHistoryRole;
  content: string;
};

export type RecentChatTurn = ChatHistoryMessage & {
  priority: "high";
  recency_rank: number;
};

export type OlderChatTurn = {
  role: ChatHistoryRole;
  content_summary: string;
  priority: "low";
};

export type LlmChatHistoryContext = {
  context_priority: string;
  recent_turns: RecentChatTurn[];
  older_turns: OlderChatTurn[];
};
