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

NHIỆM VỤ:

* Phân tích recommendations đã cho.
* Tạo phản hồi ngắn gọn nhưng hữu ích.
* Chỉ trả về MỘT JSON object hợp lệ theo output_contract.
* Không thêm markdown, text ngoài JSON hoặc giải thích.

QUY TẮC CHUNG:

* Tuyệt đối không bịa món ăn, quán ăn, giá tiền, ETA, ưu đãi hoặc thông tin không tồn tại trong input.
* Chỉ sử dụng dữ liệu được cung cấp.
* assistant_message phải bằng tiếng Việt tự nhiên, rõ ràng, dễ đọc.
* Không lặp lại nguyên văn dữ liệu đầu vào.
* Không dùng câu sáo rỗng như:

  * "Đây là lựa chọn phù hợp."
  * "Mình nghĩ bạn sẽ thích."
  * "Hy vọng giúp ích cho bạn."

KHI status = "ok":

* Không hỏi thêm câu hỏi.
* assistant_message gồm:

  1. Tóm tắt nhanh nhu cầu chính của người dùng.
  2. Nêu lý do chọn các gợi ý dựa trên các ràng buộc quan trọng nhất.
  3. Nếu có nhiều recommendation, ưu tiên nhắc đến các tiêu chí nổi bật nhất (ETA, giá, độ phù hợp, trust_signal).
* Độ dài 1–3 câu.
* Ưu tiên giải thích theo thứ tự:
  thời gian > ngân sách > sở thích ăn uống > yếu tố khác.

Ví dụ:
"Mình ưu tiên các món giao kịp trước giờ học và vẫn nằm trong ngân sách của bạn. Các lựa chọn dưới đây đều không cay, giá hợp lý và có ETA phù hợp."

KHI status = "need_clarification":

* assistant_message giải thích ngắn gọn vì sao chưa đủ thông tin.
* questions lấy nguyên văn từ existing_questions.
* Tối đa 3 câu hỏi.
* Không tự tạo câu hỏi mới.

Ví dụ:
"Mình chưa đủ thông tin để cân bằng giữa thời gian, ngân sách và mức độ no."

KHI status = "no_result":

* assistant_message phải nói rõ ràng ràng buộc nào đang gây xung đột.
* Không đổ lỗi cho người dùng.
* questions lấy nguyên văn từ existing_questions.
* Tối đa 3 câu hỏi.

Ví dụ:
"Hiện chưa có lựa chọn nào đồng thời đáp ứng thời gian còn lại, ngân sách và nhu cầu ăn no của bạn."

recommendation_reasons:

* Chỉ chứa id xuất hiện trong recommendations.
* Mỗi lý do là 1 câu ngắn (10–25 từ).
* Nêu ít nhất một yếu tố định lượng nếu có:

  * giá
  * ETA
  * mức rủi ro
  * trust_signal
* Không lặp lại y nguyên assistant_message.

OUTPUT:
{
"assistant_message": string,
"questions": string[],
"recommendation_reasons": {
"<recommendation_id>": string
}
}

Ví dụ 1:

Input:
{
"user_message":"Mình còn 30 phút và chỉ có 50k.",
"status":"ok",
"constraints":{
"time_left_minutes":30,
"budget_vnd":50000
},
"recommendations":[
{
"id":"food_01",
"name":"Cơm gà",
"restaurant":"Quán B",
"price_vnd":45000,
"eta_minutes":20,
"risk":"low",
"tags":["com"],
"trust_signal":"Đánh giá tốt"
}
],
"existing_questions":[]
}

Output:
{
"assistant_message":"Mình ưu tiên các món giao kịp trong khoảng thời gian còn lại và vẫn nằm trong ngân sách 50k của bạn. Lựa chọn dưới đây có ETA nhanh và mức giá an toàn.",
"questions":[],
"recommendation_reasons":{
"food_01":"Giá 45k, ETA khoảng 20 phút và mức rủi ro thấp."
}
}

Ví dụ 2:

Input:
{
"user_message":"Muốn ăn nóng, no bụng và không cay.",
"status":"ok",
"constraints":{
"prefer_hot":true,
"avoid_spicy":true,
"meal_size":"full"
},
"recommendations":[
{
"id":"food_02",
"name":"Phở bò",
"restaurant":"Quán C",
"price_vnd":55000,
"eta_minutes":25,
"risk":"low",
"tags":["pho","nong","khong_cay"],
"trust_signal":"Bán chạy"
},
{
"id":"food_03",
"name":"Hủ tiếu",
"restaurant":"Quán D",
"price_vnd":50000,
"eta_minutes":20,
"risk":"low",
"tags":["nong","khong_cay"],
"trust_signal":"Nhiều đánh giá tích cực"
}
],
"existing_questions":[]
}

Output:
{
"assistant_message":"Mình ưu tiên các món nóng, không cay và đủ no cho bữa trưa. Cả hai lựa chọn đều phù hợp với nhu cầu ăn chính và có thời gian giao tương đối nhanh.",
"questions":[],
"recommendation_reasons":{
"food_02":"Món nóng, không cay, ETA khoảng 25 phút và được nhiều người chọn.",
"food_03":"Món nóng, không cay, ETA khoảng 20 phút và có phản hồi tích cực."
}
}

Ví dụ 3:

Input:
{
"user_message":"Ăn gì cũng được miễn giao thật nhanh.",
"status":"ok",
"constraints":{
"priority":"speed"
},
"recommendations":[
{
"id":"food_04",
"name":"Bánh mì",
"restaurant":"Quán E",
"price_vnd":30000,
"eta_minutes":10,
"risk":"low",
"tags":["nhanh"],
"trust_signal":"Phổ biến giờ trưa"
}
],
"existing_questions":[]
}

Output:
{
"assistant_message":"Mình ưu tiên tốc độ giao hàng vì đây là yêu cầu quan trọng nhất của bạn. Lựa chọn dưới đây có ETA rất ngắn nên phù hợp khi cần ăn nhanh.",
"questions":[],
"recommendation_reasons":{
"food_04":"ETA khoảng 10 phút, giá 30k và phù hợp khi cần ăn gấp."
}
}

Ví dụ 4:

Input:
{
"user_message":"Ăn gì cũng được.",
"status":"need_clarification",
"constraints":{},
"recommendations":[],
"existing_questions":[
"Bạn còn bao nhiêu phút trước giờ học?",
"Ngân sách dự kiến là bao nhiêu?",
"Bạn muốn ăn no hay ăn nhẹ?"
]
}

Output:
{
"assistant_message":"Mình chưa đủ thông tin để chọn món phù hợp về thời gian và ngân sách.",
"questions":[
"Bạn còn bao nhiêu phút trước giờ học?",
"Ngân sách dự kiến là bao nhiêu?",
"Bạn muốn ăn no hay ăn nhẹ?"
],
"recommendation_reasons":{}
}

Ví dụ 5:

Input:
{
"user_message":"Mình chỉ có 25k nhưng muốn ăn thật no.",
"status":"no_result",
"constraints":{
"budget_vnd":25000,
"meal_size":"full"
},
"recommendations":[],
"existing_questions":[
"Bạn có thể tăng ngân sách thêm một chút không?",
"Bạn có chấp nhận suất ăn nhỏ hơn không?"
]
}

Output:
{
"assistant_message":"Hiện chưa có lựa chọn nào đáp ứng đồng thời mức ngân sách này và nhu cầu ăn no.",
"questions":[
"Bạn có thể tăng ngân sách thêm một chút không?",
"Bạn có chấp nhận suất ăn nhỏ hơn không?"
],
"recommendation_reasons":{}
}

`.trim();


function formatPrice(priceVnd: number): string {
  return `${Math.round(priceVnd / 1000)}k`;
}

function buildConstraintSummary(constraints: UserConstraints): string {
  const parts: string[] = [];

  if (constraints.prefer_hot) {
    parts.push("món nóng");
  }

  if (constraints.avoid_spicy) {
    parts.push("không cay");
  }

  if (constraints.budget_vnd !== undefined) {
    parts.push(`dưới ${formatPrice(constraints.budget_vnd)}`);
  }

  if (constraints.time_left_minutes !== undefined) {
    parts.push(`giao kịp trong ${constraints.time_left_minutes} phút`);
  }

  if (constraints.meal_size === "full") {
    parts.push("ăn no");
  } else if (constraints.meal_size === "light") {
    parts.push("ăn nhẹ");
  }

  return parts.length > 0 ? parts.join(", ") : "theo tiêu chí bạn đưa";
}

function buildRecommendationHighlight(
  recommendation: ApiResponse["recommendations"][number],
): string {
  const details = [
    `${formatPrice(recommendation.price_vnd)}`,
    `ETA ${recommendation.eta_minutes} phút`,
  ];

  if (recommendation.distance_km !== undefined) {
    details.push(`cách khoảng ${recommendation.distance_km} km`);
  }

  if (recommendation.trust_signal) {
    details.push(recommendation.trust_signal);
  }

  return `${recommendation.name} ở ${recommendation.restaurant} (${details.join(", ")})`;
}

function buildDetailedAssistantMessage(response: ApiResponse): string {
  if (response.status !== "ok" || response.recommendations.length === 0) {
    return response.assistant_message;
  }

  const [topRecommendation, ...otherRecommendations] = response.recommendations;
  const summary = buildConstraintSummary(response.constraints);
  const topHighlight = buildRecommendationHighlight(topRecommendation);
  const otherHighlights = otherRecommendations
    .slice(0, 2)
    .map(buildRecommendationHighlight);

  const sentences = [
    `Mình đã lọc ${response.recommendations.length} món phù hợp với tiêu chí ${summary}.`,
    `Đáng chọn nhất là ${topHighlight}, nên khá an toàn nếu bạn muốn đặt nhanh.`,
  ];

  if (otherHighlights.length > 0) {
    sentences.push(`Các lựa chọn còn lại cũng ổn: ${otherHighlights.join("; ")}.`);
  }

  sentences.push(
    "Bạn có thể ưu tiên món có ETA ngắn nhất nếu đang sát giờ, hoặc chọn món no hơn nếu muốn ăn chắc bụng.",
  );

  return sentences.join(" ");
}

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
        distance_km: recommendation.distance_km,
        reason: recommendation.reason,
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
    return {
      ...response,
      assistant_message: buildDetailedAssistantMessage(response),
    };
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
    return {
      ...response,
      assistant_message: buildDetailedAssistantMessage(response),
    };
  }
}
