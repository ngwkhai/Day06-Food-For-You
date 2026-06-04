import assert from "node:assert/strict";

import { getAllFoods } from "../data/food.repository.js";
import type { LlmClient } from "../services/openai.service.js";
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
  assert.equal(response.status, "need_clarification");
  assert.equal(response.recommendations.length, 0);
  assert.ok(response.questions.length > 0);
  assert.ok(response.questions.length <= 3);
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

async function testOpenAIInvalidJsonFallsBack() {
  const response = await buildRecommendationResponse(
    "Mình có 1 tiếng nghỉ, cần món nóng dưới 80k, không cay.",
    {},
    {},
    {
      llmClient: new FakeLlmClient(true, [
        { invalid: "shape" },
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
await testCorrectionPathFallback();
await testNoResultPathFallback();
await testMockedOpenAIExtractionAndAnswer();
await testOpenAIInvalidJsonFallsBack();

console.log("Backend demo tests passed.");
