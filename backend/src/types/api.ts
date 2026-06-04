import type { UserConstraints } from "./constraint.js";
import type { FoodRecommendation } from "./food.js";

export type ApiStatus = "ok" | "need_clarification" | "no_result" | "error";

export type RecommendRequest = {
  message: string;
  constraints?: UserConstraints;
};

export type CorrectRequest = RecommendRequest;

export type ApiResponse = {
  status: ApiStatus;
  assistant_message: string;
  constraints: UserConstraints;
  recommendations: FoodRecommendation[];
  questions: string[];
};

export type HealthResponse = {
  status: "ok";
  message: string;
};

export type TranscribeResponse = {
  status: "ok" | "error";
  text: string;
  message?: string;
};
