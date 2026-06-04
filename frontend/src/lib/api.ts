import type {
  BackendApiResponse,
  BrandDeal,
  Category,
  ChatApiResponse,
  ChatFoodSuggestion,
  FoodDeal,
  FoodRecommendation,
  StopChatRequest,
  UserConstraints
} from "./types";

export const categories: Category[] = [
  {
    id: "noodles",
    title: "Bún - Phở - Mỳ",
    image: "🍜",
    accent: "#fff6e2"
  },
  {
    id: "rice",
    title: "Cơm - Xôi",
    image: "🍛",
    accent: "#f3fbff"
  },
  {
    id: "fast-food",
    title: "Đồ Ăn Nhanh",
    image: "🍔",
    accent: "#fff2d7"
  },
  {
    id: "drinks",
    title: "Trà Sữa - Cà Phê",
    image: "🧋",
    accent: "#fff0f3"
  },
  {
    id: "bread",
    title: "Bánh Mì",
    image: "🥖",
    accent: "#fff7de"
  }
];

export const foodDeals: FoodDeal[] = [
  {
    id: "breakfast",
    title: "BỮA SÁNG",
    subtitle: "DEAL NGON",
    image: "🥖☕🍜",
    accent: "#ffe061",
    variant: "meal"
  },
  {
    id: "exclusive",
    title: "ĐỘC QUYỀN",
    subtitle: "KHAO SHIP",
    image: "%",
    accent: "#95f1f0",
    variant: "text"
  },
  {
    id: "fifty",
    title: "50%",
    subtitle: "CHỈ HÔM NAY",
    image: "★",
    accent: "#ffd7e0",
    variant: "text"
  },
  {
    id: "ninety-nine",
    title: "99K",
    subtitle: "DEAL SỐC",
    image: "⚡",
    accent: "#ffd5d5",
    variant: "text"
  }
];

export const brandDeals: BrandDeal[] = [
  {
    id: "phuc-long",
    brand: "PHUCLONG",
    offer: "MUA 1 TẶNG 1",
    accent: "#aff5a9",
    logoText: "SINCE 1968"
  },
  {
    id: "coffee-house",
    brand: "THE COFFEE HOUSE",
    offer: "MUA 1 TẶNG 1",
    accent: "#a7f5f0",
    logoText: "COFFEE"
  },
  {
    id: "phe-la",
    brand: "PHÊ-LA",
    offer: "GIẢM ĐẾN 45K",
    accent: "#ffe49a",
    logoText: "TEA"
  },
  {
    id: "katinat",
    brand: "KATINAT",
    offer: "GIẢM ĐẾN 70K",
    accent: "#8cf2ee",
    logoText: "COFFEE & TEA"
  }
];

const TAG_EMOJI: Record<string, string> = {
  com: "🍛",
  bun: "🍜",
  pho: "🍜",
  mi: "🍝",
  banhmi: "🥖",
  xoi: "🍚",
  healthy: "🥗",
  nong: "♨️",
  nhanh: "⚡",
  no: "🍱",
  nhe: "🥗",
  cay: "🌶️",
  khong_cay: "✅"
};

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

export async function getHomeDeals() {
  return {
    categories,
    foodDeals,
    brandDeals
  };
}

export async function sendChatPrompt(
  message: string,
  constraints: UserConstraints = {},
  options: {
    signal?: AbortSignal;
    useCorrect?: boolean;
  } = {}
): Promise<ChatApiResponse> {
  const endpoint = options.useCorrect ? "/api/correct" : "/api/recommend";
  const timeoutController = new AbortController();
  const requestSignal = options.signal ?? timeoutController.signal;
  const timeout = options.signal
    ? undefined
    : window.setTimeout(() => timeoutController.abort(), 30000);

  try {
    const response = await fetch(`${getApiBaseUrl()}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message,
        constraints
      }),
      signal: requestSignal
    });

    if (requestSignal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    const data = (await response.json()) as BackendApiResponse;

    if (requestSignal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    if (!response.ok) {
      return normalizeChatResponse(data, true);
    }

    return normalizeChatResponse(data);
  } catch (error) {
    if (requestSignal.aborted || isAbortError(error)) {
      throw error;
    }

    return createFallbackChatResponse(message);
  } finally {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  }
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/health`);
    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

export async function transcribeVoiceAudio(
  audio: Blob,
  options: {
    signal?: AbortSignal;
  } = {}
): Promise<{ status: "ok" | "error"; text: string; message?: string }> {
  const timeoutController = new AbortController();
  const requestSignal = options.signal ?? timeoutController.signal;
  const timeout = options.signal
    ? undefined
    : window.setTimeout(() => timeoutController.abort(), 30000);

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": audio.type || "audio/webm"
      },
      body: audio,
      signal: requestSignal
    });
    const data = (await response.json()) as {
      status?: "ok" | "error";
      text?: string;
      message?: string;
    };

    return {
      status: response.ok && data.status === "ok" ? "ok" : "error",
      text: data.text?.trim() ?? "",
      message: data.message
    };
  } catch (error) {
    if (requestSignal.aborted || isAbortError(error)) {
      throw error;
    }

    return {
      status: "error",
      text: "",
      message: "Could not connect to transcription service"
    };
  } finally {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  }
}

export function stopChatResponse(_request: StopChatRequest): void {
  // Client-side abort only. Backend contract has no stop endpoint.
}

function normalizeChatResponse(
  data: BackendApiResponse,
  forceFallback = false
): ChatApiResponse {
  return {
    status: data.status ?? "error",
    assistantMessage:
      data.assistant_message?.trim() ||
      "Có lỗi xảy ra khi xử lý yêu cầu. Vui lòng thử lại.",
    constraints: data.constraints ?? {},
    suggestions:
      data.status === "ok"
        ? normalizeSuggestions(data.recommendations)
        : undefined,
    questions: Array.isArray(data.questions) ? data.questions.slice(0, 3) : [],
    isFallback: forceFallback || data.status === "error"
  };
}

function normalizeSuggestions(
  recommendations: FoodRecommendation[] | undefined
): ChatFoodSuggestion[] | undefined {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    return undefined;
  }

  return recommendations.slice(0, 3).map((item, index) => ({
    id: item.id || `backend-${index}`,
    name: item.name || `Món gợi ý ${index + 1}`,
    restaurant: item.restaurant || "Quán gần bạn",
    price: formatPrice(item.price_vnd),
    time: formatEta(item.eta_minutes),
    reason: item.reason || item.trust_signal || "Phù hợp nhu cầu của bạn.",
    risk: item.risk || "medium",
    image: pickFoodEmoji(item.tags),
    accent: pickAccent(item.risk)
  }));
}

function createFallbackChatResponse(message: string): ChatApiResponse {
  return {
    status: "error",
    assistantMessage:
      "Mình chưa kết nối được backend. Hãy kiểm tra backend đang chạy ở http://localhost:8000 rồi thử lại.",
    constraints: {},
    questions: [],
    isFallback: true
  };
}

function formatPrice(priceVnd: number | undefined) {
  if (typeof priceVnd !== "number" || Number.isNaN(priceVnd)) {
    return "Liên hệ";
  }

  return `${Math.round(priceVnd / 1000)}K`;
}

function formatEta(etaMinutes: number | undefined) {
  if (typeof etaMinutes !== "number" || Number.isNaN(etaMinutes)) {
    return "15-25 phút";
  }

  return `${etaMinutes} phút`;
}

function pickFoodEmoji(tags: string[] | undefined) {
  if (!tags?.length) {
    return "🍽️";
  }

  for (const tag of tags) {
    if (TAG_EMOJI[tag]) {
      return TAG_EMOJI[tag];
    }
  }

  return "🍽️";
}

function pickAccent(risk: FoodRecommendation["risk"]) {
  if (risk === "low") {
    return "#edf9f7";
  }

  if (risk === "high") {
    return "#fff0f0";
  }

  return "#fff8e8";
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
