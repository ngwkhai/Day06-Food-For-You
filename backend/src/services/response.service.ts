import type { ApiResponse } from "../types/api.js";
import {
  normalizeConstraints,
  type ParsedConstraints,
  type UserConstraints,
} from "../types/constraint.js";
import type { FoodItem, FoodRecommendation } from "../types/food.js";
import { parseConstraints } from "./parser.service.js";
import { recommendFoods } from "./recommendation.service.js";

const ERROR_RESPONSE: ApiResponse = {
  status: "error",
  assistant_message: "Có lỗi xảy ra khi xử lý yêu cầu. Vui lòng thử lại.",
  constraints: {},
  recommendations: [],
  questions: [],
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

function shouldAskForClarification(parsed: ParsedConstraints): boolean {
  if (!parsed.hasUsefulSignal) {
    return true;
  }

  return (
    parsed.time_left_minutes === undefined || parsed.budget_vnd === undefined
  );
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

export function buildErrorResponse(): ApiResponse {
  return ERROR_RESPONSE;
}

export function buildFoodResponse(
  foods: FoodItem[],
  message: string,
  previousConstraints: UserConstraints = {},
  options: { isCorrection?: boolean } = {},
): ApiResponse {
  const parsedConstraints = parseConstraints(message, previousConstraints);
  const constraints = normalizeConstraints(parsedConstraints);

  if (shouldAskForClarification(parsedConstraints)) {
    return {
      status: "need_clarification",
      assistant_message:
        "Mình cần thêm vài thông tin để tránh gợi ý món giao không kịp hoặc không đúng nhu cầu.",
      constraints,
      recommendations: [],
      questions: buildClarificationQuestions(constraints),
    };
  }

  const recommendations = recommendFoods(foods, constraints);

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
