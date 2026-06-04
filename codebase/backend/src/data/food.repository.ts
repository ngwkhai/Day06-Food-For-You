import type { UserConstraints } from "../types/constraint.js";
import type { FoodItem } from "../types/food.js";
import { DatabaseFoodRepository } from "./db-food.repository.js";
import { JsonFoodRepository } from "./json-food.repository.js";

export type FoodRepository = {
  getAllFoods(): Promise<FoodItem[]>;
  searchFoodsByConstraints(constraints: UserConstraints): Promise<FoodItem[]>;
};

export function getFoodRepository(): FoodRepository {
  if (process.env.FOOD_REPOSITORY === "database") {
    return new DatabaseFoodRepository();
  }

  return new JsonFoodRepository();
}

export async function getAllFoods(): Promise<FoodItem[]> {
  return getFoodRepository().getAllFoods();
}
