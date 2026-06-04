export type RiskLevel = "low" | "medium" | "high";

export type FoodItem = {
  id: string;
  name: string;
  restaurant: string;
  price_vnd: number;
  eta_minutes: number;
  distance_km: number;
  is_hot: boolean;
  quick_to_eat_score: number;
  fullness_score: number;
  spicy_level: 0 | 1 | 2 | 3;
  tags: string[];
  trust_signal: string;
};

export type FoodRecommendation = {
  id: string;
  name: string;
  restaurant: string;
  price_vnd: number;
  eta_minutes: number;
  distance_km?: number;
  reason: string;
  risk: RiskLevel;
  tags: string[];
  trust_signal: string;
};
