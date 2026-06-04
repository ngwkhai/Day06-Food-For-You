import { z } from "zod";

import type { ApiResponse } from "../types/api.js";
import type { UserConstraints } from "../types/constraint.js";
import { openAIService, type LlmClient } from "./openai.service.js";

const answerSchema = z.object({
  assistant_message: z.string().min(1).optional(),
  questions: z.array(z.string()).optional(),
  recommendation_reasons: z.record(z.string(), z.string()).optional(),
});

function buildAnswerPrompt(
  message: string,
  constraints: UserConstraints,
  response: ApiResponse,
): string {
  return JSON.stringify(
    {
      user_message: message,
      status: response.status,
      constraints,
      recommendations: response.recommendations.map((recommendation) => ({
        id: recommendation.id,
        name: recommendation.name,
        restaurant: recommendation.restaurant,
        price_vnd: recommendation.price_vnd,
        eta_minutes: recommendation.eta_minutes,
        risk: recommendation.risk,
        tags: recommendation.tags,
        trust_signal: recommendation.trust_signal,
      })),
      existing_questions: response.questions,
      output_contract: {
        assistant_message: "string",
        questions: "string[]",
        recommendation_reasons:
          "object mapping existing recommendation id to a short reason",
      },
    },
    null,
    2,
  );
}

export async function generateAssistantAnswer(
  message: string,
  response: ApiResponse,
  llmClient: LlmClient = openAIService,
): Promise<ApiResponse> {
  if (!llmClient.isConfigured()) {
    return response;
  }

  try {
    const rawAnswer = await llmClient.createJsonCompletion({
      temperature: 0.3,
      systemPrompt:
        "Bạn là trợ lý gợi ý bữa trưa. Chỉ dùng recommendations được cung cấp, không bịa món/quán mới. Trả JSON hợp lệ theo output_contract.",
      userPrompt: buildAnswerPrompt(message, response.constraints, response),
    });
    const answer = answerSchema.parse(rawAnswer);
    const recommendationReasons = answer.recommendation_reasons ?? {};

    return {
      ...response,
      assistant_message:
        answer.assistant_message ?? response.assistant_message,
      questions:
        answer.questions && response.status !== "ok"
          ? answer.questions.slice(0, 3)
          : response.questions,
      recommendations: response.recommendations.map((recommendation) => ({
        ...recommendation,
        reason:
          recommendationReasons[recommendation.id] ?? recommendation.reason,
      })),
    };
  } catch (error) {
    console.warn(
      "Falling back to deterministic answer generation:",
      error instanceof Error ? error.message : error,
    );
    return response;
  }
}
