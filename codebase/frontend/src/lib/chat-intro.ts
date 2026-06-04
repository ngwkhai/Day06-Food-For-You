import type { ChatMessage } from "./types";

export const CHAT_ASSISTANT_NAME = "Food For You";

export const SESSION_INTRO_MESSAGE = `Xin chào! Mình là ${CHAT_ASSISTANT_NAME} — chatbot gợi ý bữa trưa trên Xanh SM Ngon.

Team Food For You xây dựng trải nghiệm gợi ý món ăn thông minh cho sinh viên VinUni.

Bạn cho mình biết thời gian nghỉ và ngân sách, hoặc chọn một tác vụ nhanh bên dưới nhé.`;

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

export function createSessionIntroMessage(): ChatMessage {
  return {
    id: createId(),
    role: "assistant",
    kind: "intro",
    content: SESSION_INTRO_MESSAGE,
    time: getCurrentTime()
  };
}

export function isSessionIntroMessage(message: ChatMessage): boolean {
  return message.kind === "intro";
}
