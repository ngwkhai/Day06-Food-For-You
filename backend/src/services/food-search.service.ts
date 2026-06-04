import {
  getFoodRepository,
  type FoodRepository,
} from "../data/food.repository.js";
import type { UserConstraints } from "../types/constraint.js";
import type { FoodItem } from "../types/food.js";

export async function searchFoods(
  constraints: UserConstraints,
  repository: FoodRepository = getFoodRepository(),
): Promise<FoodItem[]> {
  return repository.searchFoodsByConstraints(constraints);
}
