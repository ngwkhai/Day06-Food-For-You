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
  foodDeals,
  sendChatPrompt,
  stopChatResponse,
  transcribeVoiceAudio
} from "@/lib/api";
import { buildChatHistory } from "@/lib/chat-history";
import { CHAT_ASSISTANT_NAME, createSessionIntroMessage } from "@/lib/chat-intro";
import { prepareChatRequest } from "@/lib/message-intent";
import type { ChatMessage, ChatSession, UserConstraints } from "@/lib/types";

const TYPEWRITER_DELAY_MS = 18;
const SILENCE_AUTO_STOP_MS = 3000;
const SILENCE_VOLUME_THRESHOLD = 0.05;
const MAX_RECORDING_MS = 15000;

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
  { id: "suggest", label: "Gợi ý món", icon: "✦", prompt: "Gợi ý món ăn cho mình." },
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

      <button className="bot-launcher" type="button" onClick={onOpenChat} aria-label={`Mở ${CHAT_ASSISTANT_NAME}`}>
        <span className="bot-pulse bot-pulse-green" aria-hidden="true" />
        <span className="bot-pulse bot-pulse-red" aria-hidden="true" />
        <span className="bot-pulse bot-pulse-yellow" aria-hidden="true" />
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
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(
    () => new Set()
  );
  const requestControllerRef = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const shouldTranscribeRecordingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceAnimationFrameRef = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const maxRecordingTimeoutRef = useRef<number | null>(null);
  const requestRunIdRef = useRef(0);
  const streamTimerRef = useRef<number | null>(null);
  const streamRunIdRef = useRef(0);
  const streamingMessageIdRef = useRef<string | null>(null);
  const pendingTurnRef = useRef<{
    sessionId: string;
    requestId: string;
    userMessageId: string;
    prompt: string;
  } | null>(null);
  const lastPromptRef = useRef("");
  const threadRef = useRef<HTMLElement>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0],
    [activeSessionId, sessions]
  );
  const isChatBusy = isSending || isStreaming;
  const isBusy = isChatBusy || isTranscribing;

  function clearStreamTimer() {
    if (streamTimerRef.current) {
      window.clearInterval(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  }

  function stopMediaStream() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function stopSilenceDetection() {
    if (silenceAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(silenceAnimationFrameRef.current);
      silenceAnimationFrameRef.current = null;
    }

    silenceStartedAtRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;

    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
  }

  function clearMaxRecordingTimeout() {
    if (maxRecordingTimeoutRef.current !== null) {
      window.clearTimeout(maxRecordingTimeoutRef.current);
      maxRecordingTimeoutRef.current = null;
    }
  }

  function startSilenceDetection(stream: MediaStream) {
    stopSilenceDetection();

    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      return;
    }

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 2048;
    const samples = new Uint8Array(analyser.fftSize);

    source.connect(analyser);
    audioContextRef.current = audioContext;
    void audioContext.resume().catch(() => undefined);

    const checkSilence = () => {
      if (mediaRecorderRef.current?.state !== "recording") {
        return;
      }

      analyser.getByteTimeDomainData(samples);

      let sum = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const centeredSample = (samples[index] - 128) / 128;
        sum += centeredSample * centeredSample;
      }

      const volume = Math.sqrt(sum / samples.length);
      const now = performance.now();

      if (volume < SILENCE_VOLUME_THRESHOLD) {
        silenceStartedAtRef.current ??= now;

        if (now - silenceStartedAtRef.current >= SILENCE_AUTO_STOP_MS) {
          shouldTranscribeRecordingRef.current = true;
          mediaRecorderRef.current?.stop();
          return;
        }
      } else {
        silenceStartedAtRef.current = null;
      }

      silenceAnimationFrameRef.current = window.requestAnimationFrame(checkSilence);
    };

    silenceAnimationFrameRef.current = window.requestAnimationFrame(checkSilence);
  }

  useEffect(() => {
    threadRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeSession.messages, isBusy]);

  useEffect(() => {
    return () => {
      requestControllerRef.current?.abort();
      shouldTranscribeRecordingRef.current = false;
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      clearMaxRecordingTimeout();
      stopSilenceDetection();
      stopMediaStream();
      clearStreamTimer();
    };
  }, []);

  async function handleSendPrompt(nextPrompt: string) {
    const trimmedPrompt = nextPrompt.trim();

    if (!trimmedPrompt || isChatBusy) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmedPrompt,
      time: getCurrentTime()
    };
    const history = buildChatHistory(activeSession.messages);
    const { constraints, useCorrect } = prepareChatRequest(trimmedPrompt, {
      constraints: activeSession.constraints,
      lastStatus: activeSession.lastStatus
    });
    const controller = new AbortController();
    const requestRunId = requestRunIdRef.current + 1;
    const requestId = createId();

    requestRunIdRef.current = requestRunId;
    lastPromptRef.current = trimmedPrompt;
    pendingTurnRef.current = {
      sessionId: activeSession.id,
      requestId,
      userMessageId: userMessage.id,
      prompt: trimmedPrompt
    };
    requestControllerRef.current = controller;
    setPrompt("");
    setIsSending(true);
    updateSessionMessages(activeSession.id, (messages) => [...messages, userMessage], trimmedPrompt);

    try {
      const response = await sendChatPrompt(trimmedPrompt, constraints, {
        signal: controller.signal,
        useCorrect,
        history
      });

      if (controller.signal.aborted || requestRunIdRef.current !== requestRunId) {
        return;
      }

      updateSessionState(activeSession.id, response.constraints, response.status);
      setIsSending(false);
      typeAssistantMessage(activeSession.id, {
        content: response.assistantMessage,
        suggestions: response.suggestions,
        questions: response.questions,
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
    response: Pick<ChatMessage, "content" | "suggestions" | "questions" | "isFallback">
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
                suggestions: index >= response.content.length ? response.suggestions : undefined,
                questions: index >= response.content.length ? response.questions : undefined
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
    const streamingMessageId = streamingMessageIdRef.current;

    shouldTranscribeRecordingRef.current = false;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    clearMaxRecordingTimeout();
    stopSilenceDetection();
    stopMediaStream();
    requestRunIdRef.current += 1;
    streamRunIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    clearStreamTimer();
    setIsSending(false);
    setIsStreaming(false);
    setIsListening(false);
    setIsTranscribing(false);
    streamingMessageIdRef.current = null;
    pendingTurnRef.current = null;

    if (streamingMessageId) {
      updateSessionMessages(pendingTurn?.sessionId ?? activeSession.id, (messages) =>
        messages.filter((message) => message.id !== streamingMessageId)
      );
    }

    if (pendingTurn) {
      void stopChatResponse({
        sessionId: pendingTurn.sessionId,
        requestId: pendingTurn.requestId,
        userMessageId: pendingTurn.userMessageId,
        prompt: pendingTurn.prompt
      });
    }
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

  function handleMicClick() {
    if (isListening) {
      shouldTranscribeRecordingRef.current = true;
      mediaRecorderRef.current?.stop();
      return;
    }

    if (isBusy) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      typeAssistantMessage(activeSession.id, {
        content:
          "Trinh duyet hien tai chua ho tro ghi am. Ban co the thu Chrome hoac Edge nhe.",
        isFallback: true
      });
      return;
    }

    void startVoiceRecording();
  }

  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      shouldTranscribeRecordingRef.current = true;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        shouldTranscribeRecordingRef.current = false;
        audioChunksRef.current = [];
        clearMaxRecordingTimeout();
        stopSilenceDetection();
        stopMediaStream();
        setIsListening(false);
        setIsTranscribing(false);
        typeAssistantMessage(activeSession.id, {
          content: "Minh chua ghi am duoc. Ban thu bam mic va noi lai nhe.",
          isFallback: true
        });
      };

      recorder.onstop = () => {
        const shouldTranscribe = shouldTranscribeRecordingRef.current;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });

        shouldTranscribeRecordingRef.current = false;
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        clearMaxRecordingTimeout();
        stopSilenceDetection();
        stopMediaStream();
        setIsListening(false);

        if (shouldTranscribe) {
          void transcribeAndSendAudio(audioBlob);
        }
      };

      recorder.start();
      maxRecordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          shouldTranscribeRecordingRef.current = true;
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_MS);
      startSilenceDetection(stream);
      setPrompt("Dang nghe...");
      setIsListening(true);
    } catch {
      shouldTranscribeRecordingRef.current = false;
      clearMaxRecordingTimeout();
      stopSilenceDetection();
      stopMediaStream();
      setIsListening(false);
      typeAssistantMessage(activeSession.id, {
        content: "Minh khong mo duoc microphone. Hay kiem tra quyen mic cua trinh duyet nhe.",
        isFallback: true
      });
    }
  }

  async function transcribeAndSendAudio(audioBlob: Blob) {
    if (audioBlob.size === 0) {
      setPrompt("");
      typeAssistantMessage(activeSession.id, {
        content: "Minh chua nhan duoc am thanh. Ban thu noi lai gan mic hon nhe.",
        isFallback: true
      });
      return;
    }

    setPrompt("Dang chuyen giong noi thanh van ban...");
    setIsTranscribing(true);

    try {
      const response = await transcribeVoiceAudio(audioBlob);

      if (response.status !== "ok" || !response.text) {
        setPrompt("");
        typeAssistantMessage(activeSession.id, {
          content:
            response.message ||
            "Backend chua chuyen duoc giong noi thanh van ban. Ban thu lai sau nhe.",
          isFallback: true
        });
        return;
      }

      setPrompt(response.text);
      void handleSendPrompt(response.text);
    } catch (error) {
      if (!isAbortError(error)) {
        setPrompt("");
        typeAssistantMessage(activeSession.id, {
          content: "Minh chua ket noi duoc backend transcribe. Ban kiem tra backend va OPENAI_API_KEY nhe.",
          isFallback: true
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }

  function toggleSuggestionSelection(suggestionId: string) {
    const scopedSuggestionId = `${activeSession.id}:${suggestionId}`;

    setSelectedSuggestionIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(scopedSuggestionId)) {
        nextIds.delete(scopedSuggestionId);
      } else {
        nextIds.add(scopedSuggestionId);
      }

      return nextIds;
    });
  }

  function updateSessionState(
    sessionId: string,
    constraints: UserConstraints,
    lastStatus: ChatSession["lastStatus"]
  ) {
    setSessions((currentSessions) =>
      currentSessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              constraints,
              lastStatus,
              updatedAt: new Date().toISOString()
            }
          : session
      )
    );
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
        const hadUserMessage = session.messages.some((message) => message.role === "user");
        const hasUserMessage = nextMessages.some((message) => message.role === "user");

        return {
          ...session,
          title:
            nextMessages.length === 0
              ? "Cuộc trò chuyện mới"
              : !hadUserMessage && hasUserMessage && titlePrompt
              ? createSessionTitle(titlePrompt)
              : session.title,
          messages: nextMessages,
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  return (
    <section className="chat-screen" aria-label={`Trò chuyện với ${CHAT_ASSISTANT_NAME}`}>
      <header className="chat-topbar">
        <button className="chat-back" type="button" onClick={onBack} aria-label="Quay lại trang ưu đãi">
          ‹
        </button>
        <div className="chat-title">
          <Image src="/bot.png" alt="" width={42} height={42} />
          <h1>{CHAT_ASSISTANT_NAME}</h1>
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
          <p>{CHAT_ASSISTANT_NAME} có thể giúp gì cho bạn hôm nay?</p>
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
            <AssistantMessage
              key={message.id}
              message={message}
              selectedSuggestionIds={selectedSuggestionIds}
              sessionId={activeSession.id}
              onToggleSuggestion={toggleSuggestionSelection}
            />
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
            Nhắn tin cho {CHAT_ASSISTANT_NAME}
          </label>
          <input
            id="assistant-message"
            type="text"
            placeholder={
              isTranscribing
                ? "Dang chuyen giong noi..."
                : isListening
                ? "Dang nghe..."
                : `Nhan tin cho ${CHAT_ASSISTANT_NAME}...`
            }
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            disabled={isBusy}
          />
          <button
            className={isListening ? "mic-button mic-button-active" : "mic-button"}
            type="button"
            aria-label={isListening ? "Dung ghi am" : "Ghi am"}
            aria-pressed={isListening}
            onClick={handleMicClick}
            disabled={isBusy}
          >
            <MicIcon />
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

function AssistantMessage({
  message,
  selectedSuggestionIds,
  sessionId,
  onToggleSuggestion
}: {
  message: ChatMessage;
  selectedSuggestionIds: Set<string>;
  sessionId: string;
  onToggleSuggestion: (suggestionId: string) => void;
}) {
  return (
    <>
      <div className="chat-message-row assistant-row">
        <Image src="/bot.png" alt="" width={42} height={42} />
        <div
          className={
            message.kind === "intro"
              ? "chat-bubble assistant-bubble assistant-bubble-intro"
              : "chat-bubble assistant-bubble"
          }
        >
          {message.kind === "intro" ? (
            <span className="chat-system-label">{CHAT_ASSISTANT_NAME}</span>
          ) : null}
          <p>
            {message.content}
            {message.isStreaming ? <span className="stream-cursor" aria-hidden="true" /> : null}
          </p>
          {message.isFallback ? <span className="fallback-note">Không kết nối được backend</span> : null}
          {message.questions && message.questions.length > 0 ? (
            <ul className="clarification-list">
              {message.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          ) : null}
          <time>{message.time}</time>
        </div>
      </div>
      {message.suggestions && !message.isStreaming ? (
        <SuggestionRow
          suggestions={message.suggestions}
          selectedSuggestionIds={selectedSuggestionIds}
          sessionId={sessionId}
          onToggleSuggestion={onToggleSuggestion}
        />
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
      <div className="chat-bubble assistant-bubble typing-bubble" aria-label={`${CHAT_ASSISTANT_NAME} đang trả lời`}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function SuggestionRow({
  suggestions,
  selectedSuggestionIds,
  sessionId,
  onToggleSuggestion
}: {
  suggestions: ChatMessage["suggestions"];
  selectedSuggestionIds: Set<string>;
  sessionId: string;
  onToggleSuggestion: (suggestionId: string) => void;
}) {
  if (!suggestions) {
    return null;
  }

  return (
    <div className="suggestion-row" aria-label="Món ăn gợi ý">
      {suggestions.map((item) => {
        const scopedSuggestionId = `${sessionId}:${item.id}`;
        const isSelected = selectedSuggestionIds.has(scopedSuggestionId);

        return (
          <article
            className={isSelected ? "chat-food-card chat-food-card-selected" : "chat-food-card"}
            key={item.id}
            style={{ "--accent": item.accent } as CSSProperties}
          >
            <div className="chat-food-image">
              {item.imageUrl ? (
                <img
                  className="chat-food-photo"
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                />
              ) : (
                <span aria-hidden="true">{item.image}</span>
              )}
            </div>
            <h3>{item.name}</h3>
            <p className="chat-food-restaurant">{item.restaurant}</p>
            <p className="chat-food-reason">{item.reason}</p>
            <p>
              <strong>{item.price}</strong>
              <span> · {item.time}</span>
              <span> · {item.risk === "low" ? "An toàn" : item.risk === "high" ? "Rủi ro cao" : "Khá gấp"}</span>
            </p>
            {isSelected ? (
              <Image
                className="selected-cart-icon"
                src="/cart.jpg"
                alt=""
                width={24}
                height={24}
              />
            ) : null}
            <button
              className={isSelected ? "food-add-button food-add-button-selected" : "food-add-button"}
              type="button"
              aria-label={isSelected ? `${item.name} đã chọn` : `Thêm ${item.name}`}
              aria-pressed={isSelected}
              onClick={() => onToggleSuggestion(item.id)}
            >
              {isSelected ? "✓" : "+"}
            </button>
          </article>
        );
      })}
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

function MicIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </svg>
  );
}

function createChatSession(): ChatSession {
  const now = new Date().toISOString();

  return {
    id: createId(),
    title: "Cuộc trò chuyện mới",
    createdAt: now,
    updatedAt: now,
    messages: [createSessionIntroMessage()],
    constraints: {}
  };
}

function createSessionTitle(prompt: string) {
  return prompt.length > 34 ? `${prompt.slice(0, 34)}...` : prompt;
}

function summarizeSession(session: ChatSession) {
  const lastMessage = [...session.messages]
    .reverse()
    .find((message) => message.role === "user" || message.kind !== "intro");

  if (!lastMessage) {
    return `${CHAT_ASSISTANT_NAME} · Cuộc trò chuyện mới`;
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

function getSupportedAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }

  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/wav",
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
