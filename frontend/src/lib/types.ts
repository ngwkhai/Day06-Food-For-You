export type Category = {
  id: string;
  title: string;
  image: string;
  accent: string;
};

export type FoodDeal = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  accent: string;
  variant: "meal" | "text" | "brand";
};

export type BrandDeal = {
  id: string;
  brand: string;
  offer: string;
  accent: string;
  logoText: string;
};

export type BottomNavItem = {
  id: string;
  label: string;
  icon: string;
  active?: boolean;
};

export type ApiStatus = "ok" | "need_clarification" | "no_result" | "error";

export type MealSize = "light" | "full" | "unknown";

export type UserConstraints = {
  time_left_minutes?: number;
  budget_vnd?: number;
  avoid_spicy?: boolean;
  prefer_hot?: boolean;
  meal_size?: MealSize;
  preferred_tags?: string[];
};

export type FoodRecommendation = {
  id: string;
  name: string;
  restaurant: string;
  price_vnd: number;
  eta_minutes: number;
  distance_km?: number;
  reason: string;
  risk: "low" | "medium" | "high";
  tags: string[];
  trust_signal: string;
  image_url?: string;
};

export type BackendApiResponse = {
  status: ApiStatus;
  assistant_message: string;
  constraints: UserConstraints;
  recommendations: FoodRecommendation[];
  questions: string[];
};

export type ChatFoodSuggestion = {
  id: string;
  name: string;
  restaurant: string;
  price: string;
  time: string;
  reason: string;
  risk: "low" | "medium" | "high";
  image: string;
  imageUrl?: string;
  accent: string;
};

export type ChatRole = "assistant" | "user";

export type ChatHistoryMessage = {
  role: ChatRole;
  content: string;
};

export type ChatMessageKind = "intro" | "chat";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  kind?: ChatMessageKind;
  content: string;
  time: string;
  suggestions?: ChatFoodSuggestion[];
  questions?: string[];
  isFallback?: boolean;
  isStreaming?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  constraints: UserConstraints;
  lastStatus?: ApiStatus;
};

export type ChatApiResponse = {
  status: ApiStatus;
  assistantMessage: string;
  constraints: UserConstraints;
  suggestions?: ChatFoodSuggestion[];
  questions: string[];
  isFallback?: boolean;
};

export type StopChatRequest = {
  sessionId: string;
  requestId: string;
  userMessageId?: string;
  prompt?: string;
};
