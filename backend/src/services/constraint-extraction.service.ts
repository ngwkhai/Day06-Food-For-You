import { z } from "zod";

import {
  normalizeConstraints,
  type UserConstraints,
} from "../types/constraint.js";
import { parseConstraints } from "./parser.service.js";
import { openAIService, type LlmClient } from "./openai.service.js";

const constraintsSchema = z.object({
  time_left_minutes: z.number().int().positive().optional().nullable(),
  budget_vnd: z.number().int().positive().optional().nullable(),
  avoid_spicy: z.boolean().optional().nullable(),
  prefer_hot: z.boolean().optional().nullable(),
  meal_size: z.enum(["light", "full", "unknown"]).optional().nullable(),
  preferred_tags: z.array(z.string()).optional().nullable(),
});

const extractionSchema = z.object({
  constraints: constraintsSchema,
  confidence: z.number().min(0).max(1).default(0),
  missing_fields: z.array(z.string()).default([]),
  clarifying_questions: z.array(z.string()).default([]),
});

export type ConstraintExtractionResult = {
  constraints: UserConstraints;
  confidence: number;
  missing_fields: string[];
  clarifying_questions: string[];
  source: "openai" | "fallback";
  hasUsefulSignal: boolean;
};

function removeNullValues(constraints: z.infer<typeof constraintsSchema>): UserConstraints {
  return {
    time_left_minutes: constraints.time_left_minutes ?? undefined,
    budget_vnd: constraints.budget_vnd ?? undefined,
    avoid_spicy: constraints.avoid_spicy ?? undefined,
    prefer_hot: constraints.prefer_hot ?? undefined,
    meal_size: constraints.meal_size ?? undefined,
    preferred_tags: constraints.preferred_tags ?? undefined,
  };
}

function getMissingFields(constraints: UserConstraints): string[] {
  const missingFields: string[] = [];

  if (constraints.time_left_minutes === undefined) {
    missingFields.push("time_left_minutes");
  }

  if (constraints.budget_vnd === undefined) {
    missingFields.push("budget_vnd");
  }

  if (!constraints.meal_size || constraints.meal_size === "unknown") {
    missingFields.push("meal_size");
  }

  return missingFields;
}

function getClarifyingQuestions(constraints: UserConstraints): string[] {
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

function hasUsefulSignal(constraints: UserConstraints): boolean {
  return (
    constraints.time_left_minutes !== undefined ||
    constraints.budget_vnd !== undefined ||
    constraints.avoid_spicy !== undefined ||
    constraints.prefer_hot !== undefined ||
    (constraints.meal_size !== undefined && constraints.meal_size !== "unknown") ||
    (constraints.preferred_tags?.length ?? 0) > 0
  );
}

function buildExtractionPrompt(
  message: string,
  previousConstraints: UserConstraints,
): string {
  return JSON.stringify(
    {
      user_message: message,
      previous_constraints: previousConstraints,
      allowed_tags: [
        "com",
        "bun",
        "pho",
        "mi",
        "banhmi",
        "xoi",
        "healthy",
        "nong",
        "nhanh",
        "no",
        "nhe",
        "cay",
        "khong_cay",
      ],
      output_contract: {
        constraints: {
          time_left_minutes: "number | null",
          budget_vnd: "number | null",
          avoid_spicy: "boolean | null",
          prefer_hot: "boolean | null",
          meal_size: "light | full | unknown",
          preferred_tags: "string[]",
        },
        confidence: "number from 0 to 1",
        missing_fields: "string[]",
        clarifying_questions: "string[]",
      },
    },
    null,
    2,
  );
}

function fallbackExtractConstraints(
  message: string,
  previousConstraints: UserConstraints,
): ConstraintExtractionResult {
  const parsed = parseConstraints(message, previousConstraints);
  const constraints = normalizeConstraints(parsed);

  return {
    constraints,
    confidence: parsed.hasUsefulSignal ? 0.55 : 0.2,
    missing_fields: getMissingFields(constraints),
    clarifying_questions: getClarifyingQuestions(constraints),
    source: "fallback",
    hasUsefulSignal: parsed.hasUsefulSignal,
  };
}

export async function extractConstraints(
  message: string,
  previousConstraints: UserConstraints = {},
  llmClient: LlmClient = openAIService,
): Promise<ConstraintExtractionResult> {
  const normalizedPreviousConstraints = normalizeConstraints(previousConstraints);

  if (!llmClient.isConfigured()) {
    return fallbackExtractConstraints(message, normalizedPreviousConstraints);
  }

  try {
    const rawExtraction = await llmClient.createJsonCompletion({
      temperature: 0,
      systemPrompt:
        "Bạn trích xuất ràng buộc ăn trưa từ tiếng Việt. Chỉ trả JSON hợp lệ theo contract. Không bịa thông tin không có trong tin nhắn hoặc previous_constraints.",
      userPrompt: buildExtractionPrompt(message, normalizedPreviousConstraints),
    });
    const extraction = extractionSchema.parse(rawExtraction);
    const mergedConstraints = normalizeConstraints({
      ...normalizedPreviousConstraints,
      ...removeNullValues(extraction.constraints),
    });

    return {
      constraints: mergedConstraints,
      confidence: extraction.confidence,
      missing_fields:
        extraction.missing_fields.length > 0
          ? extraction.missing_fields
          : getMissingFields(mergedConstraints),
      clarifying_questions:
        extraction.clarifying_questions.length > 0
          ? extraction.clarifying_questions.slice(0, 3)
          : getClarifyingQuestions(mergedConstraints),
      source: "openai",
      hasUsefulSignal: hasUsefulSignal(mergedConstraints),
    };
  } catch (error) {
    console.warn(
      "Falling back to rule-based constraint parser:",
      error instanceof Error ? error.message : error,
    );
    return fallbackExtractConstraints(message, normalizedPreviousConstraints);
  }
}
