import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attachFoodImageUrl } from "../services/food-image.util.js";
import type { UserConstraints } from "../types/constraint.js";
import type { FoodItem } from "../types/food.js";
import type { FoodRepository } from "./food.repository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_FILE_PATH = path.resolve(
  __dirname,
  "../../../data/mock_foods.json",
);

function getDataPath(): string {
  const configuredPath = process.env.DATA_FILE_PATH;

  if (!configuredPath) {
    return DEFAULT_DATA_FILE_PATH;
  }

  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function getSafeEtaLimit(timeLeftMinutes?: number): number | undefined {
  if (timeLeftMinutes === undefined) {
    return undefined;
  }

  return Math.max(0, timeLeftMinutes - 10);
}

function matchesConstraints(food: FoodItem, constraints: UserConstraints): boolean {
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

export class JsonFoodRepository implements FoodRepository {
  async getAllFoods(): Promise<FoodItem[]> {
    const fileContent = await readFile(getDataPath(), "utf-8");
    const foods = JSON.parse(fileContent) as FoodItem[];

    if (!Array.isArray(foods)) {
      throw new Error("Food data must be an array");
    }

    return foods.map((food) => attachFoodImageUrl(food));
  }

  async searchFoodsByConstraints(
    constraints: UserConstraints,
  ): Promise<FoodItem[]> {
    const foods = await this.getAllFoods();
    return foods.filter((food) => matchesConstraints(food, constraints));
  }
}
