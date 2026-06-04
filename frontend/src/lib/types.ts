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

export type ChatFoodSuggestion = {
  id: string;
  name: string;
  price: string;
  time: string;
  image: string;
  accent: string;
};

export type ChatRole = "assistant" | "user";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  time: string;
  suggestions?: ChatFoodSuggestion[];
  isFallback?: boolean;
  isStreaming?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ChatHistoryItem = {
  role: ChatRole;
  content: string;
};

export type ChatApiRequest = {
  message: string;
  prompt: string;
  history: ChatHistoryItem[];
};

export type ChatApiResponse = {
  assistantMessage: string;
  suggestions?: ChatFoodSuggestion[];
  isFallback?: boolean;
};
