import type { FoodRepository } from "../data/food.repository.js";
import type { ApiResponse } from "../types/api.js";
import type { ChatHistoryMessage } from "../types/chat.js";
import type { UserConstraints } from "../types/constraint.js";
import type { FoodRecommendation } from "../types/food.js";
import { generateAssistantAnswer } from "./answer-generation.service.js";
import { extractConstraints } from "./constraint-extraction.service.js";
import { searchFoods } from "./food-search.service.js";
import { selectRecommendations } from "./food-rerank.service.js";
import {
  detectMessageIntent,
  getResponseConstraints,
  shouldAskForClarification,
  shouldMergePreviousConstraints,
  type MessageIntent,
} from "./message-intent.service.js";
import type { LlmClient } from "./openai.service.js";
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

function buildOffTopicResponse(): ApiResponse {
  return {
    status: "need_clarification",
    assistant_message:
      "Mình chỉ hỗ trợ gợi ý món ăn cho bữa trưa trên Xanh SM Ngon. Bạn có thể nhắn món bạn thích, ngân sách hoặc thời gian nghỉ để mình gợi ý nhé.",
    constraints: {},
    recommendations: [],
    questions: [],
  };
}

function buildAssistantMessage(
  intent: MessageIntent,
  constraints: UserConstraints,
  recommendations: FoodRecommendation[],
  isCorrection: boolean,
): string {
  if (intent === "greeting") {
    if (recommendations.length > 0) {
      return "Chào bạn! Mình là trợ lý gợi ý bữa trưa Xanh SM Ngon. Dưới đây là vài món phổ biến, bạn có thể bổ sung ngân sách hoặc thời gian để mình lọc chính xác hơn.";
    }

    return "Chào bạn! Mình là trợ lý gợi ý bữa trưa Xanh SM Ngon. Bạn cho mình biết sở thích, ngân sách hoặc thời gian nghỉ để mình gợi ý món phù hợp nhé.";
  }

  return buildOkMessage(constraints, recommendations, isCorrection);
}

async function buildBaseResponse(
  message: string,
  previousConstraints: UserConstraints,
  history: ChatHistoryMessage[],
  options: OrchestratorOptions,
  dependencies: OrchestratorDependencies,
): Promise<ApiResponse> {
  const intent = detectMessageIntent(message, previousConstraints, {
    isCorrectionMode: options.isCorrection,
  });

  if (intent === "off_topic") {
    return buildOffTopicResponse();
  }

  const mergePrevious = shouldMergePreviousConstraints(
    intent,
    previousConstraints,
  );
  const extraction = await extractConstraints(
    message,
    previousConstraints,
    dependencies.llmClient,
    { mergePrevious, history },
  );
  const responseConstraints = getResponseConstraints(
    intent,
    extraction.constraints,
    extraction.currentConstraints,
  );

  if (
    shouldAskForClarification(
      intent,
      responseConstraints,
      extraction.currentMessageHasUsefulSignal,
    )
  ) {
    return {
      status: "need_clarification",
      assistant_message:
        "Mình cần thêm vài thông tin để tránh gợi ý món giao không kịp hoặc không đúng nhu cầu.",
      constraints: responseConstraints,
      recommendations: [],
      questions:
        extraction.clarifying_questions.length > 0
          ? extraction.clarifying_questions.slice(0, 3)
          : buildClarificationQuestions(responseConstraints),
    };
  }

  const candidateFoods = await searchFoods(
    responseConstraints,
    dependencies.repository,
  );
  const { recommendations } = await selectRecommendations({
    message,
    history,
    constraints: responseConstraints,
    candidates: candidateFoods,
    llmClient: dependencies.llmClient,
    isCorrection: options.isCorrection,
  });

  if (recommendations.length === 0) {
    return {
      status: "no_result",
      assistant_message:
        "Hiện chưa có món nào thỏa mãn tất cả điều kiện. Bạn có thể tăng ngân sách, chọn món ăn nhẹ hơn hoặc chấp nhận ETA dài hơn một chút.",
      constraints: responseConstraints,
      recommendations: [],
      questions: buildNoResultQuestions(responseConstraints),
    };
  }

  return {
    status: "ok",
    assistant_message: buildAssistantMessage(
      intent,
      responseConstraints,
      recommendations,
      options.isCorrection ?? false,
    ),
    constraints: responseConstraints,
    recommendations,
    questions: [],
  };
}

export async function buildRecommendationResponse(
  message: string,
  previousConstraints: UserConstraints = {},
  options: OrchestratorOptions = {},
  dependencies: OrchestratorDependencies = {},
  history: ChatHistoryMessage[] = [],
): Promise<ApiResponse> {
  try {
    const baseResponse = await buildBaseResponse(
      message,
      previousConstraints,
      history,
      options,
      dependencies,
    );

    return generateAssistantAnswer(
      message,
      baseResponse,
      dependencies.llmClient,
      history,
    );
  } catch (error) {
    console.error("Failed to build recommendation response", error);
    return buildErrorResponse();
  }
}
