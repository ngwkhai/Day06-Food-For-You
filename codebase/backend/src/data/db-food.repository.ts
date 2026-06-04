import type { UserConstraints } from "../types/constraint.js";
import type { FoodItem } from "../types/food.js";
import type { FoodRepository } from "./food.repository.js";

export class DatabaseFoodRepository implements FoodRepository {
  async getAllFoods(): Promise<FoodItem[]> {
    return this.searchFoodsByConstraints({});
  }

  async searchFoodsByConstraints(
    _constraints: UserConstraints,
  ): Promise<FoodItem[]> {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when FOOD_REPOSITORY=database");
    }

    throw new Error(
      "DatabaseFoodRepository is not implemented yet. Keep FOOD_REPOSITORY unset to use JSON data.",
    );
  }
}
