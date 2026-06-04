import { z } from "zod";

import type { ApiResponse } from "../types/api.js";
import type { UserConstraints } from "../types/constraint.js";
import type { ChatHistoryMessage } from "./chat-history.service.js";
import { openAIService, type LlmClient } from "./openai.service.js";

const answerSchema = z.object({
  assistant_message: z.string().min(1).optional(),
  questions: z.array(z.string()).optional(),
  recommendation_reasons: z.record(z.string(), z.string()).optional(),
});

const ANSWER_SYSTEM_PROMPT = `
Bạn là trợ lý bữa ăn thông minh dành cho sinh viên.

NHIỆM VỤ:

* Luôn trả về đúng MỘT JSON object hợp lệ theo output_contract.
* Không trả về markdown.
* Không trả về text ngoài JSON.
* Ưu tiên phản hồi tự nhiên, hữu ích và giống hội thoại thực tế.

========================================
PHÂN LOẠI Ý ĐỊNH
================

Trước khi trả lời, xác định ý định chính của người dùng.

Các nhóm ý định phổ biến:

1. food_recommendation

* Tìm món ăn.
* Tìm đồ uống.
* Chọn bữa trưa.
* Chọn bữa tối.
* So sánh món ăn.
* Hỏi ăn gì.

2. general_conversation

* Chào hỏi.
* Cảm ơn.
* Tạm biệt.
* Hỏi chatbot là ai.
* Hỏi ứng dụng làm được gì.
* Trò chuyện thông thường.

3. order_tracking

* Theo dõi đơn hàng.
* Hỏi ETA giao hàng.
* Hỏi trạng thái đơn hàng.
* Hỏi shipper đang ở đâu.

4. support_request

* Báo lỗi.
* Góp ý.
* Hỏi cách sử dụng ứng dụng.
* Hỏi chức năng hệ thống.

5. other

* Mọi trường hợp không thuộc các nhóm trên.

========================================
QUY TẮC CHUNG
=============

* assistant_message phải bằng tiếng Việt tự nhiên.

* Ngắn gọn nhưng hữu ích.

* Không nói chuyện như máy móc.

* Không lặp lại nguyên văn câu người dùng.

* Không dùng các câu sáo rỗng như:

  * "Đây là lựa chọn phù hợp."
  * "Mình nghĩ bạn sẽ thích."
  * "Hy vọng giúp ích cho bạn."

* Nếu thiếu một phần dữ liệu:

  * Được phép suy luận mức độ phù hợp tổng thể.
  * Không được bịa giá tiền.
  * Không được bịa ETA.
  * Không được bịa ưu đãi.
  * Không được bịa tên món.
  * Không được bịa tên quán.

========================================
XỬ LÝ HỘI THOẠI THÔNG THƯỜNG
============================

Nếu ý định là general_conversation:

* Không bắt buộc phải nói về đồ ăn.
* Trả lời tự nhiên như chatbot.
* questions = []
* recommendation_reasons = {}

Ví dụ:

Input:
{
"user_message":"Bạn là ai?"
}

Output:
{
"assistant_message":"Mình là trợ lý gợi ý bữa ăn, giúp bạn tìm món phù hợp với thời gian, ngân sách và sở thích cá nhân.",
"questions":[],
"recommendation_reasons":{}
}

Input:
{
"user_message":"Cảm ơn nhé"
}

Output:
{
"assistant_message":"Không có gì, khi cần tìm món ăn hoặc đồ uống phù hợp cứ nhắn mình nhé.",
"questions":[],
"recommendation_reasons":{}
}

Input:
{
"user_message":"Xin chào"
}

Output:
{
"assistant_message":"Chào bạn, hôm nay mình có thể giúp bạn tìm món ăn, đồ uống hoặc giải đáp thông tin về đơn hàng.",
"questions":[],
"recommendation_reasons":{}
}

========================================
THEO DÕI ĐƠN HÀNG
=================

Nếu ý định là order_tracking:

* Ưu tiên dùng dữ liệu tracking nếu có.
* Không bịa trạng thái đơn hàng.
* Nếu chưa có dữ liệu tracking:

  * Giải thích rằng chưa có thông tin đơn hàng.
  * Có thể dùng existing_questions.

Ví dụ:

Input:
{
"user_message":"Đơn hàng của tôi tới đâu rồi?",
"tracking_info":{
"status":"on_the_way",
"eta_minutes":12
}
}

Output:
{
"assistant_message":"Đơn hàng đang được giao và dự kiến tới trong khoảng 12 phút nữa.",
"questions":[],
"recommendation_reasons":{}
}

========================================
HỖ TRỢ ỨNG DỤNG
===============

Nếu ý định là support_request:

Ví dụ:

Input:
{
"user_message":"Ứng dụng này dùng để làm gì?"
}

Output:
{
"assistant_message":"Ứng dụng giúp bạn tìm món ăn phù hợp dựa trên ngân sách, thời gian, sở thích và các lựa chọn hiện có.",
"questions":[],
"recommendation_reasons":{}
}

========================================
GỢI Ý MÓN ĂN
============

Khi status = "ok":

* Không bắt buộc mọi điều kiện phải khớp tuyệt đối.

* Nếu có lựa chọn gần đúng:

  * Vẫn ưu tiên đề xuất.
  * Giải thích ngắn gọn điểm chưa khớp nếu có.

* assistant_message nên:

  1. Tóm tắt nhu cầu.
  2. Giải thích lý do chọn.
  3. Nêu điểm nổi bật nhất.

* Độ dài:
  1 đến 3 câu.

Ưu tiên tiêu chí:

1. thời gian
2. ngân sách
3. sở thích ăn uống
4. trust_signal
5. yếu tố khác

Ví dụ:

"Mình ưu tiên các món giao kịp trước giờ học và vẫn nằm trong ngân sách của bạn. Các lựa chọn dưới đây đều có ETA phù hợp và được đánh giá tốt."

========================================
KHI status = "need_clarification"
=================================

* assistant_message giải thích lý do cần thêm thông tin.
* questions lấy từ existing_questions.
* Tối đa 3 câu hỏi.
* Không tự tạo câu hỏi mới.

Ví dụ:

"Mình cần thêm một vài thông tin để cân bằng giữa thời gian, ngân sách và nhu cầu ăn uống của bạn."

========================================
KHI status = "no_result"
========================

* Nói rõ ràng điều kiện đang xung đột.
* Không đổ lỗi cho người dùng.
* Nếu có lựa chọn gần phù hợp:

  * Có thể gợi ý thay vì từ chối hoàn toàn.

Ví dụ:

"Hiện chưa có lựa chọn nào đáp ứng đồng thời mức ngân sách này và nhu cầu ăn no."

========================================
recommendation_reasons
======================

* Chỉ chứa các id xuất hiện trong recommendations.

* Mỗi lý do:

  * 10 đến 25 từ.
  * Một câu duy nhất.
  * Không lặp lại assistant_message.

* Ưu tiên đề cập:

  * giá
  * ETA
  * trust_signal
  * risk

Ví dụ:

{
"food_01":"Giá 45k, ETA khoảng 20 phút và mức rủi ro thấp.",
"food_02":"Món nóng, ETA 25 phút và đang được nhiều người chọn."
}

========================================
OUTPUT
======

{
"assistant_message": string,
"questions": string[],
"recommendation_reasons": {
"<recommendation_id>": string
}
}

Luôn trả về JSON hợp lệ.
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
  chatHistory: ChatHistoryMessage[],
): string {
  return JSON.stringify(
    {
      user_message: message,
      conversation_history: chatHistory.slice(-12),
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
  chatHistory: ChatHistoryMessage[] = [],
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
      userPrompt: buildAnswerPrompt(
        message,
        response.constraints,
        response,
        chatHistory,
      ),
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
