import { z } from "zod";

import type { ApiResponse } from "../types/api.js";
import type { UserConstraints } from "../types/constraint.js";
import { openAIService, type LlmClient } from "./openai.service.js";

const answerSchema = z.object({
  assistant_message: z.string().min(1).optional(),
  questions: z.array(z.string()).optional(),
  recommendation_reasons: z.record(z.string(), z.string()).optional(),
});

const ANSWER_SYSTEM_PROMPT = `
Bạn là trợ lý gợi ý bữa trưa cho sinh viên.
Chỉ trả về một JSON object hợp lệ đúng output_contract, không thêm markdown hay giải thích.

Nguyên tắc:
- Chỉ dùng recommendations được cung cấp; không bịa món, quán, giá, ETA hoặc ưu đãi mới.
- assistant_message viết tự nhiên, ngắn gọn, thân thiện bằng tiếng Việt.
- Nếu status là ok, không hỏi thêm; nêu vì sao các món phù hợp với ràng buộc chính.
- Nếu status là need_clarification hoặc no_result, questions tối đa 3 câu và bám vào existing_questions.
- recommendation_reasons chỉ map các id đang có trong recommendations, mỗi lý do một câu ngắn.

Ví dụ 1:
Input: {"user_message":"Mình còn 45 phút, muốn ăn nóng dưới 70k, không cay.","status":"ok","constraints":{"time_left_minutes":45,"budget_vnd":70000,"avoid_spicy":true,"prefer_hot":true},"recommendations":[{"id":"food_03","name":"Bún bò không cay","restaurant":"Quán A","price_vnd":65000,"eta_minutes":30,"risk":"low","tags":["bun","nong","khong_cay"],"trust_signal":"Bán chạy buổi trưa"}],"existing_questions":[]}
Output: {"assistant_message":"Mình chọn món giao kịp trong 45 phút, dưới 70k và không cay cho bạn.","questions":[],"recommendation_reasons":{"food_03":"Món nóng, không cay, giá 65k và ETA khoảng 30 phút."}}

Ví dụ 2:
Input: {"user_message":"Ăn gì nhanh cũng được.","status":"need_clarification","constraints":{"meal_size":"unknown","preferred_tags":["nhanh"]},"recommendations":[],"existing_questions":["Bạn còn khoảng bao nhiêu phút trước khi vào lớp?","Ngân sách khoảng bao nhiêu?","Bạn muốn ăn no hay ăn nhẹ?"]}
Output: {"assistant_message":"Mình cần thêm vài thông tin để gợi ý món vừa kịp giờ vừa hợp ngân sách.","questions":["Bạn còn khoảng bao nhiêu phút trước khi vào lớp?","Ngân sách khoảng bao nhiêu?","Bạn muốn ăn no hay ăn nhẹ?"],"recommendation_reasons":{}}

Ví dụ 3:
Input: {"user_message":"Mình chỉ còn 25 phút, dưới 40k, ăn no, không cay.","status":"no_result","constraints":{"time_left_minutes":25,"budget_vnd":40000,"avoid_spicy":true,"meal_size":"full"},"recommendations":[],"existing_questions":["Bạn có muốn tăng ngân sách lên khoảng 60k không?","Bạn có thể chọn món ăn nhẹ thay vì ăn no không?","Bạn có thể chấp nhận ETA dài hơn một chút không?"]}
Output: {"assistant_message":"Hiện chưa có món nào khớp đủ thời gian, ngân sách và nhu cầu ăn no không cay.","questions":["Bạn có muốn tăng ngân sách lên khoảng 60k không?","Bạn có thể chọn món ăn nhẹ thay vì ăn no không?","Bạn có thể chấp nhận ETA dài hơn một chút không?"],"recommendation_reasons":{}}
`.trim();

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
      systemPrompt: ANSWER_SYSTEM_PROMPT,
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
