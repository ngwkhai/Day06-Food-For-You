"use client";

import type { CSSProperties, FormEvent } from "react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import ClarificationBox from "./ClarificationBox";
import ConstraintSummary from "./ConstraintSummary";
import FoodCard from "./FoodCard";
import {
  brandDeals,
  categories,
  chatFoodSuggestions,
  foodDeals,
  sendChatPrompt
} from "@/lib/api";
import type { ChatHistoryItem, ChatMessage, ChatSession } from "@/lib/types";

const TYPEWRITER_DELAY_MS = 18;

const navItems = [
  { id: "home", label: "Trang chủ", icon: "⌂", active: true },
  { id: "map", label: "Bản đồ", icon: "◇" },
  { id: "favorite", label: "Yêu thích", icon: "♡" },
  { id: "cart", label: "Giỏ hàng", icon: "▰", active: true }
];

const quickActions = [
  { id: "food", title: "Tìm món ăn", icon: "🍜", prompt: "Gợi ý cho mình món ăn ngon gần VinUni." },
  { id: "order", title: "Theo dõi đơn hàng", icon: "📦", prompt: "Mình muốn theo dõi đơn hàng hiện tại." },
  { id: "deal", title: "Ưu đãi hôm nay", icon: "🎟️", prompt: "Hôm nay có ưu đãi món ăn nào tốt không?" },
  { id: "payment", title: "Hỗ trợ thanh toán", icon: "💳", prompt: "Mình cần hỗ trợ thanh toán đơn hàng." }
];

const chatChips = [
  { id: "suggest", label: "Gợi ý món", icon: "✦", prompt: "Gợi ý món ăn dưới 40K cho mình." },
  { id: "qa", label: "Hỏi đáp nhanh", icon: "?", prompt: "Bạn có thể giúp mình những gì?" },
  { id: "track", label: "Theo dõi đơn hàng", icon: "▣", prompt: "Theo dõi đơn hàng giúp mình." },
  { id: "history", label: "Lịch sử trò chuyện", icon: "↺" }
];

export default function ChatWindow() {
  const [view, setView] = useState<"home" | "chat">("home");

  return (
    <main className="app-shell">
      <section className="phone-screen" aria-label="Food For You">
        {view === "chat" ? (
          <ChatBotScreen onBack={() => setView("home")} />
        ) : (
          <HomeScreen onOpenChat={() => setView("chat")} />
        )}
      </section>
    </main>
  );
}

function HomeScreen({ onOpenChat }: { onOpenChat: () => void }) {
  return (
    <>
      <div className="top-gradient">
        <ConstraintSummary />

        <form className="search-box" role="search">
          <span className="search-icon" aria-hidden="true">
            ⌕
          </span>
          <label className="sr-only" htmlFor="food-search">
            Tìm món ăn hoặc ưu đãi
          </label>
          <input
            id="food-search"
            type="search"
            placeholder="Phúc Long - Mua 1 Tặng 1 Chỉ 60K"
          />
        </form>
      </div>

      <section className="horizontal-row category-row" aria-label="Danh mục món ăn">
        {categories.map((category) => (
          <FoodCard key={category.id} type="category" item={category} />
        ))}
      </section>

      <section className="horizontal-row deal-row" aria-label="Ưu đãi hôm nay">
        {foodDeals.map((deal) => (
          <FoodCard key={deal.id} type="deal" item={deal} />
        ))}
      </section>

      <section className="horizontal-row brand-row" aria-label="Ưu đãi thương hiệu">
        {brandDeals.map((brand) => (
          <FoodCard key={brand.id} type="brand" item={brand} />
        ))}
      </section>

      <ClarificationBox />

      <button className="bot-launcher" type="button" onClick={onOpenChat} aria-label="Mở trợ lý AI">
        <Image src="/bot.png" alt="" width={70} height={70} />
      </button>

      <nav className="bottom-nav" aria-label="Điều hướng chính">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={item.active ? "nav-button nav-button-active" : "nav-button"}
            aria-label={item.label}
          >
            <span aria-hidden="true">{item.icon}</span>
          </button>
        ))}
      </nav>
    </>
  );
}

function ChatBotScreen({ onBack }: { onBack: () => void }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [createChatSession()]);
  const [activeSessionId, setActiveSessionId] = useState(() => sessions[0].id);
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestRunIdRef = useRef(0);
  const streamTimerRef = useRef<number | null>(null);
  const streamRunIdRef = useRef(0);
  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingTurnRef = useRef<{
    sessionId: string;
    userMessageId: string;
    prompt: string;
  } | null>(null);
  const lastPromptRef = useRef("");
  const threadRef = useRef<HTMLElement>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions]
  );
  const isBusy = isSending || isStreaming;

  function clearStreamTimer() {
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  }

  useEffect(() => {
    threadRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeSession.messages, isBusy]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      clearStreamTimer();
    };
  }, []);

  async function handleSendPrompt(nextPrompt: string) {
    const trimmedPrompt = nextPrompt.trim();

    if (!trimmedPrompt || isBusy) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmedPrompt,
      time: getCurrentTime()
    };
    const history: ChatHistoryItem[] = [...activeSession.messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content
    }));
    const controller = new AbortController();
    const requestRunId = requestRunIdRef.current + 1;

    requestRunIdRef.current = requestRunId;
    lastPromptRef.current = trimmedPrompt;
    pendingTurnRef.current = {
      sessionId: activeSession.id,
      userMessageId: userMessage.id,
      prompt: trimmedPrompt
    };
    requestControllerRef.current = controller;
    setPrompt("");
    setIsSending(true);
    updateSessionMessages(activeSession.id, (messages) => [...messages, userMessage], trimmedPrompt);

    try {
      const response = await sendChatPrompt(trimmedPrompt, history, controller.signal);

      if (controller.signal.aborted || requestRunIdRef.current !== requestRunId) {
        return;
      }

      setIsSending(false);
      typeAssistantMessage(activeSession.id, {
        content: response.assistantMessage,
        suggestions: response.suggestions,
        isFallback: response.isFallback
      });
    } catch (error) {
      if (!controller.signal.aborted && requestRunIdRef.current === requestRunId && !isAbortError(error)) {
        setIsSending(false);
        typeAssistantMessage(activeSession.id, {
          content: "Mình chưa thể kết nối backend lúc này. Bạn thử lại sau một chút nhé.",
          isFallback: true
        });
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (requestRunIdRef.current === requestRunId) {
        setIsSending(false);
      }
    }
  }

  function typeAssistantMessage(
    sessionId: string,
    response: Pick<ChatMessage, "content" | "suggestions" | "isFallback">
  ) {
    clearStreamTimer();

    const messageId = createId();
    const streamRunId = streamRunIdRef.current + 1;
    streamRunIdRef.current = streamRunId;
    streamingMessageIdRef.current = messageId;
    setIsStreaming(true);
    updateSessionMessages(sessionId, (messages) => [
      ...messages,
      {
        id: messageId,
        role: "assistant",
        content: "",
        time: getCurrentTime(),
        isStreaming: true,
        isFallback: response.isFallback
      }
    ]);

    let index = 0;
    streamTimerRef.current = window.setInterval(() => {
      if (streamRunIdRef.current !== streamRunId) {
        clearStreamTimer();
        return;
      }

      index += 1;
      const nextContent = response.content.slice(0, index);

      updateSessionMessages(sessionId, (messages) =>
        messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                content: nextContent,
                isStreaming: index < response.content.length,
                suggestions: index >= response.content.length ? response.suggestions : undefined
              }
            : message
        )
      );

      if (index >= response.content.length) {
        clearStreamTimer();
        if (streamRunIdRef.current === streamRunId) {
          streamingMessageIdRef.current = null;
          pendingTurnRef.current = null;
          setIsStreaming(false);
        }
      }
    }, TYPEWRITER_DELAY_MS);
  }

  function handleStop() {
    const pendingTurn = pendingTurnRef.current;
    const pendingSessionId = pendingTurn?.sessionId ?? activeSession.id;
    const pendingUserMessageId = pendingTurn?.userMessageId ?? null;
    const streamingMessageId = streamingMessageIdRef.current;

    requestRunIdRef.current += 1;
    streamRunIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    clearStreamTimer();
    setIsSending(false);
    setIsStreaming(false);
    setPrompt(pendingTurn?.prompt ?? lastPromptRef.current);
    streamingMessageIdRef.current = null;
    pendingTurnRef.current = null;

    setSessions((currentSessions) =>
      currentSessions.map((session) => {
        if (session.id !== pendingSessionId) {
          return session;
        }

        const fallbackUserMessageId =
          pendingUserMessageId ??
          [...session.messages].reverse().find((message) => message.role === "user")?.id ??
          null;
        const nextMessages = session.messages.filter(
          (message) =>
            message.id !== streamingMessageId && message.id !== fallbackUserMessageId
        );

        return {
          ...session,
          title: nextMessages.length === 0 ? "Cuộc trò chuyện mới" : session.title,
          messages: nextMessages,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  function handleNewChat() {
    handleStop();
    const session = createChatSession();
    setSessions((currentSessions) => [session, ...currentSessions]);
    setActiveSessionId(session.id);
    setPrompt("");
    setIsHistoryOpen(false);
  }

  function handleSelectSession(sessionId: string) {
    handleStop();
    setActiveSessionId(sessionId);
    setPrompt("");
    setIsHistoryOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleSendPrompt(prompt);
  }

  function updateSessionMessages(
    sessionId: string,
    updater: (messages: ChatMessage[]) => ChatMessage[],
    titlePrompt?: string
  ) {
    setSessions((currentSessions) =>
      currentSessions.map((session) => {
        if (session.id !== sessionId) {
          return session;
        }

        const nextMessages = updater(session.messages);

        return {
          ...session,
          title:
            nextMessages.length === 0
              ? "Cuộc trò chuyện mới"
              : session.messages.length === 0 && titlePrompt
              ? createSessionTitle(titlePrompt)
              : session.title,
          messages: nextMessages,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  return (
    <section className="chat-screen" aria-label="Trò chuyện với trợ lý AI">
      <header className="chat-topbar">
        <button className="chat-back" type="button" onClick={onBack} aria-label="Quay lại trang ưu đãi">
          ‹
        </button>
        <div className="chat-title">
          <Image src="/bot.png" alt="" width={42} height={42} />
          <h1>Trợ lý AI</h1>
        </div>
        <button className="new-chat-button" type="button" onClick={handleNewChat} aria-label="Tạo chat mới">
          +
        </button>
        <button
          className="chat-menu"
          type="button"
          onClick={() => setIsHistoryOpen((isOpen) => !isOpen)}
          aria-label="Mở lịch sử trò chuyện"
        >
          ⋮
        </button>
      </header>

      <section className="assistant-hero">
        <Image src="/bot.png" alt="" width={132} height={100} priority />
        <div>
          <h2>Xin chào! 👋</h2>
          <p>Tôi có thể giúp gì cho bạn hôm nay?</p>
        </div>
      </section>

      <section className="quick-action-grid" aria-label="Tác vụ nhanh">
        {quickActions.map((action) => (
          <button
            className="quick-action-card"
            type="button"
            key={action.id}
            onClick={() => void handleSendPrompt(action.prompt)}
            disabled={isBusy}
          >
            <span aria-hidden="true">{action.icon}</span>
            <strong>{action.title}</strong>
          </button>
        ))}
      </section>

      <section className="chat-thread" aria-label="Nội dung trò chuyện" ref={threadRef}>
        {activeSession.messages.length === 0 ? <EmptyChatState /> : null}
        {activeSession.messages.map((message) =>
          message.role === "assistant" ? (
            <AssistantMessage key={message.id} message={message} />
          ) : (
            <UserMessage key={message.id} message={message} />
          )
        )}
        {isSending ? <TypingMessage /> : null}
      </section>

      {isHistoryOpen ? (
        <HistoryPanel
          sessions={sessions}
          activeSessionId={activeSession.id}
          onClose={() => setIsHistoryOpen(false)}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
        />
      ) : null}

      <div className="chat-composer-wrap">
        <div className="chat-chip-row">
          {chatChips.map((chip) => (
            <button
              type="button"
              key={chip.id}
              onClick={() =>
                chip.id === "history"
                  ? setIsHistoryOpen(true)
                  : void handleSendPrompt(chip.prompt ?? "")
              }
              disabled={chip.id !== "history" && isBusy}
            >
              <span aria-hidden="true">{chip.icon}</span>
              {chip.label}
            </button>
          ))}
        </div>
        <form className="chat-composer" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="assistant-message">
            Nhắn tin cho trợ lý
          </label>
          <input
            id="assistant-message"
            type="text"
            placeholder="Nhắn tin cho trợ lý..."
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isBusy}
          />
          <button className="mic-button" type="button" aria-label="Ghi âm" disabled={isBusy}>
            ♫
          </button>
          {isBusy ? (
            <button className="stop-button" type="button" onClick={handleStop} aria-label="Dừng phản hồi">
              ■
            </button>
          ) : (
            <button
              className="send-button"
              type="submit"
              aria-label="Gửi tin nhắn"
              disabled={prompt.trim().length === 0}
            >
              ➤
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

function EmptyChatState() {
  return (
    <div className="empty-chat-state">
      <strong>Bắt đầu cuộc trò chuyện mới</strong>
      <span>Nhập yêu cầu của bạn bên dưới hoặc chọn một tác vụ nhanh.</span>
    </div>
  );
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  return (
    <>
      <div className="chat-message-row assistant-row">
        <Image src="/bot.png" alt="" width={42} height={42} />
        <div className="chat-bubble assistant-bubble">
          <p>
            {message.content}
            {message.isStreaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
          </p>
          {message.isFallback ? <span className="fallback-note">Demo fallback</span> : null}
          <time>{message.time}</time>
        </div>
      </div>
      {message.suggestions && !message.isStreaming ? (
        <SuggestionRow suggestions={message.suggestions} />
      ) : null}
    </>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  return (
    <div className="chat-message-row user-row">
      <div className="chat-bubble user-bubble">
        <p>{message.content}</p>
        <time>{message.time} ✓✓</time>
      </div>
    </div>
  );
}

function TypingMessage() {
  return (
    <div className="chat-message-row assistant-row">
      <Image src="/bot.png" alt="" width={42} height={42} />
      <div className="chat-bubble assistant-bubble typing-bubble" aria-label="Trợ lý đang trả lời">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SuggestionRow({ suggestions }: { suggestions: ChatMessage["suggestions"] }) {
  if (!suggestions) {
    return null;
  }

  return (
    <div className="suggestion-row" aria-label="Món ăn gợi ý">
      {suggestions.map((item) => (
        <article
          className="chat-food-card"
          key={item.id}
          style={{ "--accent": item.accent } as CSSProperties}
        >
          <div className="chat-food-image" aria-hidden="true">
            {item.image}
          </div>
          <h3>{item.name}</h3>
          <p>
            <strong>{item.price}</strong>
            <span> · {item.time}</span>
          </p>
          <button type="button" aria-label={`Thêm ${item.name}`}>
            +
          </button>
        </article>
      ))}
      <button className="more-card" type="button">
        <span aria-hidden="true">▦</span>
        Xem thêm
      </button>
    </div>
  );
}

function HistoryPanel({
  sessions,
  activeSessionId,
  onClose,
  onNewChat,
  onSelectSession
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  onClose: () => void;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  return (
    <div className="history-overlay">
      <button className="history-backdrop" type="button" onClick={onClose} aria-label="Đóng lịch sử" />
      <aside className="history-panel" aria-label="Lịch sử trò chuyện">
        <div className="history-panel-header">
          <h2>Lịch sử chat</h2>
          <button type="button" onClick={onNewChat}>
            + New chat
          </button>
        </div>
        <div className="history-list">
          {sessions.map((session) => (
            <button
              className={
                session.id === activeSessionId
                  ? "history-item history-item-active"
                  : "history-item"
              }
              type="button"
              key={session.id}
              onClick={() => onSelectSession(session.id)}
            >
              <strong>{session.title}</strong>
              <span>{summarizeSession(session)}</span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function createChatSession(): ChatSession {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "Cuộc trò chuyện mới",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function createSessionTitle(prompt: string) {
  return prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt;
}

function summarizeSession(session: ChatSession) {
  const lastMessage = session.messages.at(-1);

  if (!lastMessage) {
    return "Chưa có tin nhắn";
  }

  return lastMessage.content.length > 42
    ? `${lastMessage.content.slice(0, 42)}...`
    : lastMessage.content;
}

function getCurrentTime() {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

function createId() {
  return globalThis.crypto?.randomUUID() ?? `${Date.now()}-${Math.random()}`;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
