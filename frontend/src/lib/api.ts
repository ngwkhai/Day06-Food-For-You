import type {
  BrandDeal,
  Category,
  ChatApiResponse,
  ChatFoodSuggestion,
  ChatHistoryItem,
  FoodDeal,
  StopChatRequest
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

export const chatFoodSuggestions: ChatFoodSuggestion[] = [
  {
    id: "pho-bo",
    name: "Phở bò truyền thống",
    price: "32K",
    time: "20-30 phút",
    image: "🍜",
    accent: "#e5f7ed"
  },
  {
    id: "banh-mi",
    name: "Bánh mì ốp la",
    price: "25K",
    time: "10-15 phút",
    image: "🥖",
    accent: "#fff3d6"
  },
  {
    id: "chao-ga",
    name: "Cháo gà nấm",
    price: "28K",
    time: "15-20 phút",
    image: "🥣",
    accent: "#f0f4f2"
  }
];

export async function getHomeDeals() {
  return {
    categories,
    foodDeals,
    brandDeals,
    chatFoodSuggestions
  };
}

export async function sendChatPrompt(
  prompt: string,
  history: ChatHistoryItem[] = [],
  signal?: AbortSignal
): Promise<ChatApiResponse> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const timeoutController = new AbortController();
  const requestSignal = signal ?? timeoutController.signal;
  const timeout = signal ? undefined : window.setTimeout(() => timeoutController.abort(), 10000);

  try {
    const response = await fetch(`${apiBaseUrl}/api/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: prompt,
        prompt,
        history
      }),
      signal: requestSignal
    });

    if (requestSignal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (requestSignal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    return normalizeChatResponse(data);
  } catch (error) {
    if (requestSignal.aborted || isAbortError(error)) {
      throw error;
    }

    return createFallbackChatResponse(prompt);
  } finally {
    if (timeout) {
      window.clearTimeout(timeout);
    }
  }
}

export async function stopChatResponse(request: StopChatRequest): Promise<void> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

  try {
    await fetch(`${apiBaseUrl}/api/recommend/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      keepalive: true
    });
  } catch {
    // Stop is best-effort: the UI must stop immediately even if backend is unavailable.
  }
}

function normalizeChatResponse(data: Record<string, unknown>): ChatApiResponse {
  const assistantMessage =
    getString(data.assistantMessage) ??
    getString(data.assistant_message) ??
    getString(data.message) ??
    getString(data.reply) ??
    getString(data.text) ??
    "Mình đã nhận được yêu cầu của bạn.";

  const rawSuggestions = data.recommendations ?? data.suggestions ?? data.items;

  return {
    assistantMessage,
    suggestions: normalizeSuggestions(rawSuggestions)
  };
}

function normalizeSuggestions(value: unknown): ChatFoodSuggestion[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const suggestions = value.slice(0, 4).map((item, index) => {
    const record = isRecord(item) ? item : {};
    const name =
      getString(record.name) ??
      getString(record.title) ??
      getString(record.food_name) ??
      `Món gợi ý ${index + 1}`;
    const price =
      getString(record.price) ??
      getString(record.price_label) ??
      formatNumberPrice(record.price_vnd) ??
      "Liên hệ";
    const time =
      getString(record.time) ??
      getString(record.eta) ??
      getString(record.delivery_time) ??
      "15-25 phút";

    return {
      id: getString(record.id) ?? `backend-${index}`,
      name,
      price,
      time,
      image: getString(record.image) ?? "🍽️",
      accent: getString(record.accent) ?? "#edf9f7"
    };
  });

  return suggestions.length > 0 ? suggestions : undefined;
}

function createFallbackChatResponse(prompt: string): ChatApiResponse {
  const lowerPrompt = prompt.toLowerCase();
  const wantsFood =
    lowerPrompt.includes("món") ||
    lowerPrompt.includes("ăn") ||
    lowerPrompt.includes("sáng") ||
    lowerPrompt.includes("trưa") ||
    lowerPrompt.includes("tối");

  return {
    assistantMessage:
      "Mình đã nhận prompt của bạn. Backend hiện chưa phản hồi, nên mình đang hiển thị câu trả lời mẫu để bạn test luồng chat.",
    suggestions: wantsFood ? chatFoodSuggestions : undefined,
    isFallback: true
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function formatNumberPrice(value: unknown): string | undefined {
  return typeof value === "number" ? `${Math.round(value / 1000)}K` : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}
