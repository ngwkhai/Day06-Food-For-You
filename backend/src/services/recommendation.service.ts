import type { UserConstraints } from "../types/constraint.js";
import type { FoodItem, FoodRecommendation, RiskLevel } from "../types/food.js";

type ScoredFood = {
  food: FoodItem;
  score: number;
  risk: RiskLevel;
};

function getSafeEtaLimit(timeLeftMinutes?: number): number | undefined {
  if (timeLeftMinutes === undefined) {
    return undefined;
  }

  return Math.max(0, timeLeftMinutes - 10);
}

export function getRiskLevel(
  etaMinutes: number,
  timeLeftMinutes?: number,
): RiskLevel {
  if (timeLeftMinutes === undefined) {
    return "medium";
  }

  if (etaMinutes <= timeLeftMinutes - 15) {
    return "low";
  }

  if (etaMinutes <= timeLeftMinutes - 10) {
    return "medium";
  }

  return "high";
}

function matchesHardFilters(
  food: FoodItem,
  constraints: UserConstraints,
): boolean {
  if (
    constraints.budget_vnd !== undefined &&
    food.price_vnd > constraints.budget_vnd
  ) {
    return false;
  }

  const safeEtaLimit = getSafeEtaLimit(constraints.time_left_minutes);
  if (safeEtaLimit !== undefined && food.eta_minutes > safeEtaLimit) {
    return false;
  }

  if (constraints.avoid_spicy && food.spicy_level >= 2) {
    return false;
  }

  if (constraints.prefer_hot && !food.is_hot) {
    return false;
  }

  return true;
}

function scoreFood(food: FoodItem, constraints: UserConstraints): number {
  const etaScore = Math.max(0, 40 - food.eta_minutes);
  const budgetScore =
    constraints.budget_vnd === undefined || food.price_vnd <= constraints.budget_vnd
      ? 10
      : 0;
  const hotScore = food.is_hot ? 10 : 0;
  const trustBonus = food.trust_signal ? 5 : 0;
  const preferredTagBonus =
    constraints.preferred_tags?.filter((tag) => food.tags.includes(tag)).length ??
    0;
  const mealSizeBonus =
    constraints.meal_size === "light"
      ? Math.max(0, 6 - food.fullness_score) * 3
      : constraints.meal_size === "full"
        ? food.fullness_score * 3
        : 0;
  const riskPenalty =
    getRiskLevel(food.eta_minutes, constraints.time_left_minutes) === "high"
      ? 30
      : 0;

  return (
    etaScore +
    food.quick_to_eat_score * 8 +
    food.fullness_score * 5 +
    hotScore +
    budgetScore +
    trustBonus +
    preferredTagBonus * 8 +
    mealSizeBonus -
    riskPenalty
  );
}

function buildReason(food: FoodItem, constraints: UserConstraints): string {
  const reasons: string[] = [];

  if (constraints.time_left_minutes !== undefined) {
    reasons.push(`ETA ${food.eta_minutes} phút còn chừa thời gian nhận món`);
  } else {
    reasons.push(`ETA ${food.eta_minutes} phút phù hợp cho bữa trưa`);
  }

  if (constraints.budget_vnd !== undefined) {
    reasons.push(`giá dưới ngân sách ${Math.round(constraints.budget_vnd / 1000)}k`);
  }

  if (constraints.prefer_hot && food.is_hot) {
    reasons.push("món nóng");
  }

  if (constraints.avoid_spicy && food.spicy_level < 2) {
    reasons.push("không quá cay");
  }

  if (constraints.meal_size === "light") {
    reasons.push("dễ ăn nhanh");
  } else if (constraints.meal_size === "full") {
    reasons.push("đủ no");
  }

  return `${reasons.join(", ")}.`;
}

function toRecommendation(
  food: FoodItem,
  risk: RiskLevel,
  constraints: UserConstraints,
): FoodRecommendation {
  return {
    id: food.id,
    name: food.name,
    restaurant: food.restaurant,
    price_vnd: food.price_vnd,
    eta_minutes: food.eta_minutes,
    distance_km: food.distance_km,
    reason: buildReason(food, constraints),
    risk,
    tags: food.tags,
    trust_signal: food.trust_signal,
  };
}

export function recommendFoods(
  foods: FoodItem[],
  constraints: UserConstraints,
  limit = 3,
): FoodRecommendation[] {
  return foods
    .filter((food) => matchesHardFilters(food, constraints))
    .map<ScoredFood>((food) => ({
      food,
      score: scoreFood(food, constraints),
      risk: getRiskLevel(food.eta_minutes, constraints.time_left_minutes),
    }))
    .filter((item) => item.risk !== "high")
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map(({ food, risk }) => toRecommendation(food, risk, constraints));
}
