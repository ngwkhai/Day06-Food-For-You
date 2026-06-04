import type { FoodRepository } from "../data/food.repository.js";
import type { ApiResponse } from "../types/api.js";
import type { UserConstraints } from "../types/constraint.js";
import type { FoodRecommendation } from "../types/food.js";
import { generateAssistantAnswer } from "./answer-generation.service.js";
import { extractConstraints } from "./constraint-extraction.service.js";
import { searchFoods } from "./food-search.service.js";
import type { LlmClient } from "./openai.service.js";
import { recommendFoods } from "./recommendation.service.js";
import { buildErrorResponse } from "./response.service.js";

type OrchestratorOptions = {
  isCorrection?: boolean;
};

type OrchestratorDependencies = {
  llmClient?: LlmClient;
  repository?: FoodRepository;
};

function buildClarificationQuestions(constraints: UserConstraints): string[] {
  const questions: string[] = [];

  if (constraints.time_left_minutes === undefined) {
    questions.push("Bạn còn khoảng bao nhiêu phút trước khi vào lớp?");
  }

  if (constraints.budget_vnd === undefined) {
    questions.push("Ngân sách khoảng bao nhiêu?");
  }

  if (!constraints.meal_size || constraints.meal_size === "unknown") {
    questions.push("Bạn muốn ăn no hay ăn nhẹ?");
  }

  return questions.slice(0, 3);
}

function shouldAskForClarification(
  constraints: UserConstraints,
  hasUsefulSignal: boolean,
): boolean {
  if (!hasUsefulSignal) {
    return true;
  }

  return (
    constraints.time_left_minutes === undefined ||
    constraints.budget_vnd === undefined
  );
}

function buildNoResultQuestions(constraints: UserConstraints): string[] {
  const questions: string[] = [];

  if (constraints.budget_vnd !== undefined) {
    questions.push(
      `Bạn có muốn tăng ngân sách lên khoảng ${Math.round(
        (constraints.budget_vnd + 20000) / 1000,
      )}k không?`,
    );
  }

  if (constraints.meal_size === "full") {
    questions.push("Bạn có thể chọn món ăn nhẹ thay vì ăn no không?");
  }

  if (constraints.time_left_minutes !== undefined) {
    questions.push("Bạn có thể chấp nhận ETA dài hơn một chút không?");
  }

  return questions.slice(0, 3);
}

function buildOkMessage(
  constraints: UserConstraints,
  recommendations: FoodRecommendation[],
  isCorrection: boolean,
): string {
  const parts: string[] = [];

  if (constraints.budget_vnd !== undefined) {
    parts.push(`dưới ${Math.round(constraints.budget_vnd / 1000)}k`);
  }

  if (constraints.prefer_hot) {
    parts.push("món nóng");
  }

  if (constraints.avoid_spicy) {
    parts.push("không cay");
  }

  if (constraints.time_left_minutes !== undefined) {
    parts.push(`kịp trong ${constraints.time_left_minutes} phút`);
  }

  const prefix = isCorrection
    ? "Mình đã cập nhật tiêu chí và gợi ý lại"
    : "Mình gợi ý";
  const detail = parts.length > 0 ? ` phù hợp ${parts.join(", ")}` : "";

  return `${prefix} ${recommendations.length} món${detail}.`;
}

async function buildBaseResponse(
  message: string,
  previousConstraints: UserConstraints,
  options: OrchestratorOptions,
  dependencies: OrchestratorDependencies,
): Promise<ApiResponse> {
  const extraction = await extractConstraints(
    message,
    previousConstraints,
    dependencies.llmClient,
  );
  const { constraints } = extraction;

  if (shouldAskForClarification(constraints, extraction.hasUsefulSignal)) {
    return {
      status: "need_clarification",
      assistant_message:
        "Mình cần thêm vài thông tin để tránh gợi ý món giao không kịp hoặc không đúng nhu cầu.",
      constraints,
      recommendations: [],
      questions:
        extraction.clarifying_questions.length > 0
          ? extraction.clarifying_questions.slice(0, 3)
          : buildClarificationQuestions(constraints),
    };
  }

  const candidateFoods = await searchFoods(constraints, dependencies.repository);
  const recommendations = recommendFoods(candidateFoods, constraints);

  if (recommendations.length === 0) {
    return {
      status: "no_result",
      assistant_message:
        "Hiện chưa có món nào thỏa mãn tất cả điều kiện. Bạn có thể tăng ngân sách, chọn món ăn nhẹ hơn hoặc chấp nhận ETA dài hơn một chút.",
      constraints,
      recommendations: [],
      questions: buildNoResultQuestions(constraints),
    };
  }

  return {
    status: "ok",
    assistant_message: buildOkMessage(
      constraints,
      recommendations,
      options.isCorrection ?? false,
    ),
    constraints,
    recommendations,
    questions: [],
  };
}

export async function buildRecommendationResponse(
  message: string,
  previousConstraints: UserConstraints = {},
  options: OrchestratorOptions = {},
  dependencies: OrchestratorDependencies = {},
): Promise<ApiResponse> {
  try {
    const baseResponse = await buildBaseResponse(
      message,
      previousConstraints,
      options,
      dependencies,
    );

    return generateAssistantAnswer(
      message,
      baseResponse,
      dependencies.llmClient,
    );
  } catch (error) {
    console.error("Failed to build recommendation response", error);
    return buildErrorResponse();
  }
}
