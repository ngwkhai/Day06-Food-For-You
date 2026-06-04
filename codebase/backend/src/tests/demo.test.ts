import assert from "node:assert/strict";

import { getAllFoods } from "../data/food.repository.js";
import type { LlmClient } from "../services/openai.service.js";
import {
  normalizeChatHistory,
  prepareChatHistoryForLlm,
} from "../services/chat-history.util.js";
import type { ChatHistoryMessage } from "../types/chat.js";
import {
  rerankFoodsWithAi,
  selectRecommendations,
} from "../services/food-rerank.service.js";
import { searchFoods } from "../services/food-search.service.js";
import { buildRecommendationResponse } from "../services/recommendation-orchestrator.service.js";
import type { UserConstraints } from "../types/constraint.js";

const foods = await getAllFoods();

class FakeLlmClient implements LlmClient {
  constructor(
    private readonly configured: boolean,
    private readonly jsonResponses: unknown[] = [],
  ) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async createJsonCompletion(): Promise<unknown> {
    if (this.jsonResponses.length === 0) {
      throw new Error("No fake JSON response configured");
    }

    return this.jsonResponses.shift();
  }

  async createTextCompletion(): Promise<string> {
    return "Fake text response";
  }
}

function getFoodById(id: string) {
  const food = foods.find((item) => item.id === id);
  assert.ok(food, `Expected food ${id} to exist`);
  return food;
}

function assertContractShape(response: Awaited<ReturnType<typeof buildRecommendationResponse>>) {
  assert.ok(["ok", "need_clarification", "no_result", "error"].includes(response.status));
  assert.equal(typeof response.assistant_message, "string");
  assert.equal(typeof response.constraints, "object");
  assert.ok(Array.isArray(response.recommendations));
  assert.ok(Array.isArray(response.questions));
}

async function testHappyPathFallback() {
  const response = await buildRecommendationResponse(
    "Mình có 1 tiếng nghỉ, căng tin đông, cần món nóng dưới 80k, không cay.",
    {},
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.recommendations.length, 3);
  assert.equal(response.constraints.time_left_minutes, 60);
  assert.equal(response.constraints.budget_vnd, 80000);
  assert.equal(response.constraints.avoid_spicy, true);
  assert.equal(response.constraints.prefer_hot, true);

  for (const recommendation of response.recommendations) {
    const food = getFoodById(recommendation.id);
    assert.ok(
      recommendation.image_url?.includes(`/images/${recommendation.id}`),
    );
    assert.ok(food.price_vnd <= 80000);
    assert.ok(food.eta_minutes <= 50);
    assert.ok(food.spicy_level < 2);
    assert.equal(food.is_hot, true);
  }
}

async function testLowConfidencePathFallback() {
  const response = await buildRecommendationResponse(
    "Ăn gì nhanh cũng được.",
    {},
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.recommendations.length, 3);
  assert.ok((response.constraints.preferred_tags ?? []).includes("nhanh"));
}

async function testPartialBudgetOnlyFallback() {
  const response = await buildRecommendationResponse(
    "Ngân sách khoảng 50k thôi.",
    {},
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.ok(response.recommendations.length > 0);
  assert.equal(response.constraints.budget_vnd, 50000);
  assert.equal(response.constraints.time_left_minutes, undefined);

  for (const recommendation of response.recommendations) {
    const food = getFoodById(recommendation.id);
    assert.ok(food.price_vnd <= 50000);
  }
}

async function testCorrectionPathFallback() {
  const previousConstraints: UserConstraints = {
    time_left_minutes: 60,
    budget_vnd: 80000,
    avoid_spicy: false,
    prefer_hot: true,
    meal_size: "unknown",
    preferred_tags: [],
  };

  const response = await buildRecommendationResponse(
    "Chỉ còn 35 phút, không ăn cay.",
    previousConstraints,
    { isCorrection: true },
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.constraints.time_left_minutes, 35);
  assert.equal(response.constraints.avoid_spicy, true);
  assert.ok(response.recommendations.length > 0);

  for (const recommendation of response.recommendations) {
    const food = getFoodById(recommendation.id);
    assert.ok(food.eta_minutes <= 25);
    assert.ok(food.spicy_level < 2);
  }
}

async function testNoResultPathFallback() {
  const response = await buildRecommendationResponse(
    "Mình chỉ còn 25 phút, cần món nóng dưới 40k, ăn no, không cay.",
    {},
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "no_result");
  assert.equal(response.recommendations.length, 0);
  assert.ok(response.questions.length > 0);
}

async function testAiRerankSelectsProvidedIds() {
  const constraints: UserConstraints = {
    time_left_minutes: 60,
    budget_vnd: 80000,
    avoid_spicy: true,
    prefer_hot: true,
  };
  const candidates = await searchFoods(constraints);
  const result = await rerankFoodsWithAi({
    message: "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k, không cay.",
    constraints,
    candidates,
    llmClient: new FakeLlmClient(true, [
      {
        ranked_ids: ["food_10", "food_01", "food_08"],
        recommendation_reasons: {
          food_10: "Món nóng, no, phù hợp ngân sách.",
          food_01: "Cơm gà quen thuộc buổi trưa.",
          food_08: "Xôi nóng giao nhanh.",
        },
      },
    ]),
  });

  assert.ok(result);
  assert.equal(result.source, "openai");
  assert.equal(result.recommendations.length, 3);
  assert.equal(result.recommendations[0]?.id, "food_10");
  assert.equal(result.recommendations[0]?.reason, "Món nóng, no, phù hợp ngân sách.");
}

async function testAiRerankInvalidIdsReturnsNull() {
  const constraints: UserConstraints = {
    time_left_minutes: 60,
    budget_vnd: 80000,
    avoid_spicy: true,
    prefer_hot: true,
  };
  const candidates = await searchFoods(constraints);
  const result = await rerankFoodsWithAi({
    message: "test",
    constraints,
    candidates,
    llmClient: new FakeLlmClient(true, [{ ranked_ids: ["food_does_not_exist"] }]),
  });

  assert.equal(result, null);
}

async function testSelectRecommendationsUsesRuleWhenLlmOff() {
  const constraints: UserConstraints = {
    time_left_minutes: 60,
    budget_vnd: 80000,
    avoid_spicy: true,
    prefer_hot: true,
  };
  const candidates = await searchFoods(constraints);
  const result = await selectRecommendations({
    message: "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k, không cay.",
    constraints,
    candidates,
    llmClient: new FakeLlmClient(false),
  });

  assert.equal(result.source, "rule");
  assert.equal(result.recommendations.length, 3);
}

async function testOrchestratorAiRerankIntegration() {
  const response = await buildRecommendationResponse(
    "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k, không cay.",
    {},
    {},
    {
      llmClient: new FakeLlmClient(true, [
        {
          constraints: {
            time_left_minutes: 60,
            budget_vnd: 80000,
            avoid_spicy: true,
            prefer_hot: true,
            meal_size: "unknown",
            preferred_tags: [],
          },
          confidence: 0.95,
          missing_fields: [],
          clarifying_questions: [],
        },
        {
          ranked_ids: ["food_08", "food_01", "food_10"],
          recommendation_reasons: {
            food_08: "AI chọn xôi nóng vì ETA ngắn.",
          },
        },
        {
          assistant_message: "Đây là 3 món mình chọn cho bạn.",
          questions: [],
          recommendation_reasons: {},
        },
      ]),
    },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.recommendations[0]?.id, "food_08");
  assert.equal(response.recommendations[0]?.reason, "AI chọn xôi nóng vì ETA ngắn.");
}

async function testMockedOpenAIExtractionAndAnswer() {
  const response = await buildRecommendationResponse(
    "Tôi còn 45 phút, muốn ăn món nóng dưới 70k, không cay.",
    {},
    {},
    {
      llmClient: new FakeLlmClient(true, [
        {
          constraints: {
            time_left_minutes: 45,
            budget_vnd: 70000,
            avoid_spicy: true,
            prefer_hot: true,
            meal_size: "unknown",
            preferred_tags: [],
          },
          confidence: 0.92,
          missing_fields: [],
          clarifying_questions: [],
        },
        {
          ranked_ids: ["food_03", "food_08", "food_01"],
          recommendation_reasons: {
            food_03: "Giao nhanh, giá thấp và không cay.",
          },
        },
        {
          assistant_message:
            "Mình đã lọc từ dữ liệu hiện có và chọn các món giao kịp trong 45 phút.",
          questions: [],
          recommendation_reasons: {
            food_03: "Giao nhanh, giá thấp và không cay.",
          },
        },
      ]),
    },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(
    response.assistant_message,
    "Mình đã lọc từ dữ liệu hiện có và chọn các món giao kịp trong 45 phút.",
  );
  assert.equal(response.constraints.time_left_minutes, 45);
  assert.equal(response.constraints.budget_vnd, 70000);
  assert.ok(response.recommendations.length > 0);
}

async function testGreetingWithRecommendations() {
  const response = await buildRecommendationResponse(
    "chào bạn",
    {
      time_left_minutes: 60,
      budget_vnd: 80000,
      avoid_spicy: true,
      prefer_hot: true,
    },
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.recommendations.length, 3);
  assert.deepEqual(response.constraints, {});
}

async function testOffTopicDoesNotRecommend() {
  const response = await buildRecommendationResponse(
    "Bạn có thể giúp mình những gì?",
    {
      time_left_minutes: 60,
      budget_vnd: 80000,
      avoid_spicy: true,
      prefer_hot: true,
    },
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "need_clarification");
  assert.equal(response.recommendations.length, 0);
  assert.deepEqual(response.constraints, {});
}

async function testVagueFoodRequestIgnoresPreviousConstraints() {
  const response = await buildRecommendationResponse(
    "Ăn gì nhanh cũng được.",
    {
      time_left_minutes: 60,
      budget_vnd: 80000,
      avoid_spicy: true,
      prefer_hot: true,
    },
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.recommendations.length, 3);
  assert.equal(response.constraints.time_left_minutes, undefined);
  assert.equal(response.constraints.budget_vnd, undefined);
  assert.ok((response.constraints.preferred_tags ?? []).includes("nhanh"));
}

async function testTrackOrderIsOffTopic() {
  const response = await buildRecommendationResponse(
    "Theo dõi đơn hàng giúp mình.",
    {
      time_left_minutes: 60,
      budget_vnd: 80000,
    },
    {},
    { llmClient: new FakeLlmClient(false) },
  );

  assertContractShape(response);
  assert.equal(response.status, "need_clarification");
  assert.equal(response.recommendations.length, 0);
  assert.deepEqual(response.constraints, {});
}

function testNormalizeChatHistory() {
  const history = normalizeChatHistory([
    { role: "user", content: "  chào bạn  " },
    { role: "assistant", content: "Xin chào!" },
    { role: "bot", content: "ignored" },
    { role: "user", content: "" },
  ]);

  assert.equal(history.length, 2);
  assert.equal(history[0]?.content, "chào bạn");
  assert.equal(history[1]?.role, "assistant");
}

function testPrepareChatHistoryPrioritizesRecentTurns() {
  const history: ChatHistoryMessage[] = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `message-${index}`,
  }));

  const prepared = prepareChatHistoryForLlm(history);

  assert.equal(prepared.recent_turns.length, 8);
  assert.equal(prepared.older_turns.length, 4);
  assert.equal(prepared.recent_turns.at(-1)?.content, "message-11");
  assert.equal(prepared.recent_turns.at(-1)?.recency_rank, 12);
  assert.equal(prepared.recent_turns[0]?.recency_rank, 5);
  assert.ok(prepared.older_turns[0]?.content_summary.includes("message-0"));
  assert.equal(prepared.older_turns[0]?.priority, "low");
  assert.equal(prepared.recent_turns[0]?.priority, "high");
}

async function testCorrectionWithChatHistory() {
  const previousConstraints: UserConstraints = {
    time_left_minutes: 60,
    budget_vnd: 80000,
    avoid_spicy: false,
    prefer_hot: true,
    meal_size: "unknown",
    preferred_tags: [],
  };

  const response = await buildRecommendationResponse(
    "Chỉ còn 35 phút, không ăn cay.",
    previousConstraints,
    { isCorrection: true },
    { llmClient: new FakeLlmClient(false) },
    [
      {
        role: "user",
        content: "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k, không cay.",
      },
      {
        role: "assistant",
        content: "Mình gợi ý 3 món phù hợp dưới 80k, món nóng và không cay.",
      },
    ],
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.constraints.time_left_minutes, 35);
  assert.equal(response.constraints.avoid_spicy, true);
}

async function testOpenAIInvalidJsonFallsBack() {
  const response = await buildRecommendationResponse(
    "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k, không cay.",
    {},
    {},
    {
      llmClient: new FakeLlmClient(true, [
        { invalid: "shape" },
        { invalid: "rerank" },
        { invalid: "answer" },
      ]),
    },
  );

  assertContractShape(response);
  assert.equal(response.status, "ok");
  assert.equal(response.constraints.time_left_minutes, 60);
  assert.equal(response.constraints.budget_vnd, 80000);
  assert.equal(response.recommendations.length, 3);
}

await testHappyPathFallback();
await testLowConfidencePathFallback();
await testPartialBudgetOnlyFallback();
await testCorrectionPathFallback();
await testNoResultPathFallback();
await testGreetingWithRecommendations();
await testOffTopicDoesNotRecommend();
await testVagueFoodRequestIgnoresPreviousConstraints();
await testTrackOrderIsOffTopic();
testNormalizeChatHistory();
testPrepareChatHistoryPrioritizesRecentTurns();
await testCorrectionWithChatHistory();
await testAiRerankSelectsProvidedIds();
await testAiRerankInvalidIdsReturnsNull();
await testSelectRecommendationsUsesRuleWhenLlmOff();
await testOrchestratorAiRerankIntegration();
await testMockedOpenAIExtractionAndAnswer();
await testOpenAIInvalidJsonFallsBack();

console.log("Backend demo tests passed.");
