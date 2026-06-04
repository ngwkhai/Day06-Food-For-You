export type MealSize = "light" | "full" | "unknown";

export type UserConstraints = {
  time_left_minutes?: number;
  budget_vnd?: number;
  avoid_spicy?: boolean;
  prefer_hot?: boolean;
  meal_size?: MealSize;
  preferred_tags?: string[];
};

export type ParsedConstraints = UserConstraints & {
  hasUsefulSignal: boolean;
};

export function normalizeConstraints(
  constraints: UserConstraints = {},
): UserConstraints {
  return {
    time_left_minutes: constraints.time_left_minutes,
    budget_vnd: constraints.budget_vnd,
    avoid_spicy: constraints.avoid_spicy,
    prefer_hot: constraints.prefer_hot,
    meal_size: constraints.meal_size ?? "unknown",
    preferred_tags: constraints.preferred_tags ?? [],
  };
}
