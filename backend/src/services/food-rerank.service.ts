import { z } from "zod";

import { buildChatHistoryPayload } from "./chat-history.util.js";
import type { ChatHistoryMessage } from "../types/chat.js";
import type { UserConstraints } from "../types/constraint.js";
import type { FoodItem, FoodRecommendation } from "../types/food.js";
import { openAIService, type LlmClient } from "./openai.service.js";
import { getRiskLevel, recommendFoods } from "./recommendation.service.js";

const DEFAULT_CANDIDATE_POOL_SIZE = 12;
const DEFAULT_RECOMMENDATION_LIMIT = 3;

const rerankResponseSchema = z
  .object({
    ranked_ids: z.array(z.string()).optional().nullable(),
    ranked_food_ids: z.array(z.string()).optional().nullable(),
    recommendation_reasons: z.record(z.string(), z.string()).optional().nullable(),
  })
  .transform((data) => ({
    ranked_ids: (data.ranked_ids ?? data.ranked_food_ids ?? [])
      .map((id) => id.trim())
      .filter(Boolean),
    recommendation_reasons: data.recommendation_reasons ?? {},
  }));

const RERANK_SYSTEM_PROMPT = `
Bạn là bộ chọn món ăn cho bữa trưa từ danh sách candidates đã được lọc cứng.
Chỉ trả về một JSON object hợp lệ theo output_contract, không markdown.

Nguyên tắc:
- CHỈ chọn id có trong candidates; không thêm món, quán, giá hoặc ETA mới.
- ranked_ids: tối đa 3 id, xếp theo mức phù hợp cao nhất trước.
- Ưu tiên: kịp time_left_minutes (ETA an toàn), trong budget_vnd, avoid_spicy, prefer_hot, meal_size, preferred_tags.
- Ngữ cảnh hội thoại: user_message > recent_turns (recency_rank cao hơn quan trọng hơn) > older_turns; bỏ qua older_turns nếu xung đột với recent_turns.
- recommendation_reasons: map id -> một câu tiếng Việt ngắn, bám dữ liệu candidate (giá, ETA, tags, trust_signal).
- Nếu user_message là chỉnh sửa tiêu chí, ưu tiên thay đổi mới nhất trong user_message.

Ví dụ:
Input: {"user_message":"Mình còn 45 phút, muốn món nóng dưới 70k, không cay.","constraints":{"time_left_minutes":45,"budget_vnd":70000,"avoid_spicy":true,"prefer_hot":true},"candidates":[{"id":"food_03","name":"Bánh mì gà nướng","price_vnd":35000,"eta_minutes":18,"tags":["banhmi","nhanh"]},{"id":"food_08","name":"Xôi gà nấm","price_vnd":45000,"eta_minutes":20,"tags":["xoi","nong"]}]}
Output: {"ranked_ids":["food_03","food_08"],"recommendation_reasons":{"food_03":"ETA 18 phút, giá 35k, không cay và giao nhanh.","food_08":"Món nóng, ETA 20 phút, vừa ngân sách 70k."}}
`.trim();

export type FoodSelectionSource = "openai" | "rule";

export type FoodRerankResult = {
  recommendations: FoodRecommendation[];
  source: FoodSelectionSource;
};

export type SelectRecommendationsParams = {
  message: string;
  history?: ChatHistoryMessage[];
  constraints: UserConstraints;
  candidates: FoodItem[];
  llmClient?: LlmClient;
  limit?: number;
  isCorrection?: boolean;
};

function getCandidatePoolSize(): number {
  const configured = Number(process.env.FOOD_RERANK_CANDIDATE_POOL_SIZE);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : DEFAULT_CANDIDATE_POOL_SIZE;
}

export function isFoodRerankEnabled(): boolean {
  const flag = process.env.FOOD_RERANK_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "off") {
    return false;
  }

  return true;
}

function buildCandidatePool(
  candidates: FoodItem[],
  constraints: UserConstraints,
  poolSize: number,
): FoodItem[] {
  const ranked = recommendFoods(candidates, constraints, poolSize);
  const orderedIds = ranked.map((item) => item.id);

  return orderedIds
    .map((id) => candidates.find((food) => food.id === id))
    .filter((food): food is FoodItem => food !== undefined);
}

function buildFallbackReason(food: FoodItem, constraints: UserConstraints): string {
  return (
    recommendFoods([food], constraints, 1)[0]?.reason ??
    "Phù hợp nhu cầu của bạn."
  );
}

function mapFoodToRecommendation(
  food: FoodItem,
  constraints: UserConstraints,
  reason: string,
): FoodRecommendation {
  return {
    id: food.id,
    name: food.name,
    restaurant: food.restaurant,
    price_vnd: food.price_vnd,
    eta_minutes: food.eta_minutes,
    distance_km: food.distance_km,
    reason,
    risk: getRiskLevel(food.eta_minutes, constraints.time_left_minutes),
    tags: food.tags,
    trust_signal: food.trust_signal,
    image_url: food.image_url,
  };
}

function buildRecommendationsFromRankedIds(
  rankedIds: string[],
  pool: FoodItem[],
  constraints: UserConstraints,
  reasons: Record<string, string>,
  limit: number,
): FoodRecommendation[] {
  const poolById = new Map(pool.map((food) => [food.id, food]));
  const uniqueRankedIds = [...new Set(rankedIds)].filter((id) => poolById.has(id));

  const ruleOrder = recommendFoods(pool, constraints, limit).map((item) => item.id);
  const finalIds: string[] = [];

  for (const id of uniqueRankedIds) {
    if (finalIds.length >= limit) {
      break;
    }

    finalIds.push(id);
  }

  for (const id of ruleOrder) {
    if (finalIds.length >= limit) {
      break;
    }

    if (!finalIds.includes(id)) {
      finalIds.push(id);
    }
  }

  return finalIds.map((id) => {
    const food = poolById.get(id);
    if (!food) {
      throw new Error(`Missing food ${id} in rerank pool`);
    }

    const aiReason = reasons[id]?.trim();
    const reason = aiReason || buildFallbackReason(food, constraints);

    return mapFoodToRecommendation(food, constraints, reason);
  });
}

function buildRerankPrompt(params: {
  message: string;
  history: ChatHistoryMessage[];
  constraints: UserConstraints;
  pool: FoodItem[];
  isCorrection: boolean;
}): string {
  return JSON.stringify(
    {
      user_message: params.message,
      ...buildChatHistoryPayload(params.history),
      is_correction: params.isCorrection,
      constraints: params.constraints,
      candidates: params.pool.map((food) => ({
        id: food.id,
        name: food.name,
        restaurant: food.restaurant,
        price_vnd: food.price_vnd,
        eta_minutes: food.eta_minutes,
        distance_km: food.distance_km,
        is_hot: food.is_hot,
        spicy_level: food.spicy_level,
        quick_to_eat_score: food.quick_to_eat_score,
        fullness_score: food.fullness_score,
        tags: food.tags,
        trust_signal: food.trust_signal,
        image_url: food.image_url,
      })),
      output_contract: {
        ranked_ids: "string[] max 3, ids from candidates only",
        recommendation_reasons:
          "object mapping candidate id to a short Vietnamese reason",
      },
    },
    null,
    2,
  );
}

export async function rerankFoodsWithAi(
  params: SelectRecommendationsParams,
): Promise<FoodRerankResult | null> {
  const llmClient = params.llmClient ?? openAIService;
  const limit = params.limit ?? DEFAULT_RECOMMENDATION_LIMIT;
  const history = params.history ?? [];

  if (!isFoodRerankEnabled() || !llmClient.isConfigured()) {
    return null;
  }

  if (params.candidates.length === 0) {
    return null;
  }

  const pool = buildCandidatePool(
    params.candidates,
    params.constraints,
    Math.max(limit, getCandidatePoolSize()),
  );

  if (pool.length === 0) {
    return null;
  }

  try {
    const rawRerank = await llmClient.createJsonCompletion({
      temperature: 0,
      systemPrompt: RERANK_SYSTEM_PROMPT,
      userPrompt: buildRerankPrompt({
        message: params.message,
        history,
        constraints: params.constraints,
        pool,
        isCorrection: params.isCorrection ?? false,
      }),
    });

    const parsed = rerankResponseSchema.parse(rawRerank);
    if (parsed.ranked_ids.length === 0) {
      return null;
    }

    const poolIds = new Set(pool.map((food) => food.id));
    const validAiIds = [...new Set(parsed.ranked_ids)].filter((id) =>
      poolIds.has(id),
    );

    if (validAiIds.length === 0) {
      return null;
    }

    const recommendations = buildRecommendationsFromRankedIds(
      parsed.ranked_ids,
      pool,
      params.constraints,
      parsed.recommendation_reasons,
      limit,
    );

    if (recommendations.length === 0) {
      return null;
    }

    return {
      recommendations,
      source: "openai",
    };
  } catch (error) {
    console.warn(
      "Falling back to rule-based food ranking:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function selectRecommendations(
  params: SelectRecommendationsParams,
): Promise<FoodRerankResult> {
  const limit = params.limit ?? DEFAULT_RECOMMENDATION_LIMIT;

  const aiResult = await rerankFoodsWithAi({
    ...params,
    limit,
  });

  if (aiResult) {
    return aiResult;
  }

  return {
    recommendations: recommendFoods(
      params.candidates,
      params.constraints,
      limit,
    ),
    source: "rule",
  };
}
