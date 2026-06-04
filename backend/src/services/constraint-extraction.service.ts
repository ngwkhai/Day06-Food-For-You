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

const EXTRACTION_SYSTEM_PROMPT = `
Bạn là bộ trích xuất ràng buộc gợi ý bữa trưa từ tin nhắn tiếng Việt.
Chỉ trả về một JSON object hợp lệ đúng output_contract, không thêm markdown hay giải thích.

Nguyên tắc:
- Chỉ suy luận từ user_message và previous_constraints; không bịa thời gian, ngân sách, món ăn hoặc quán mới.
- Nếu user_message cập nhật một tiêu chí, giá trị mới ghi đè previous_constraints.
- Nếu thiếu thông tin quan trọng, để null/unknown và thêm vào missing_fields.
- preferred_tags chỉ được dùng các tag trong allowed_tags.
- clarifying_questions viết ngắn gọn bằng tiếng Việt, tối đa 3 câu.

Ví dụ 1:
Input: {"user_message":"Mình còn 45 phút, muốn ăn nóng dưới 70k, không cay.","previous_constraints":{}}
Output: {"constraints":{"time_left_minutes":45,"budget_vnd":70000,"avoid_spicy":true,"prefer_hot":true,"meal_size":"unknown","preferred_tags":["nong","khong_cay"]},"confidence":0.95,"missing_fields":["meal_size"],"clarifying_questions":["Bạn muốn ăn no hay ăn nhẹ?"]}

Ví dụ 2:
Input: {"user_message":"Ăn gì nhanh cũng được.","previous_constraints":{}}
Output: {"constraints":{"time_left_minutes":null,"budget_vnd":null,"avoid_spicy":null,"prefer_hot":null,"meal_size":"unknown","preferred_tags":["nhanh"]},"confidence":0.45,"missing_fields":["time_left_minutes","budget_vnd","meal_size"],"clarifying_questions":["Bạn còn khoảng bao nhiêu phút trước khi vào lớp?","Ngân sách khoảng bao nhiêu?","Bạn muốn ăn no hay ăn nhẹ?"]}

Ví dụ 3:
Input: {"user_message":"Chỉ còn 35 phút, không ăn cay.","previous_constraints":{"time_left_minutes":60,"budget_vnd":80000,"avoid_spicy":false,"prefer_hot":true,"meal_size":"unknown","preferred_tags":[]}}
Output: {"constraints":{"time_left_minutes":35,"budget_vnd":80000,"avoid_spicy":true,"prefer_hot":true,"meal_size":"unknown","preferred_tags":["khong_cay"]},"confidence":0.9,"missing_fields":["meal_size"],"clarifying_questions":["Bạn muốn ăn no hay ăn nhẹ?"]}
`.trim();

export type ConstraintExtractionResult = {
  constraints: UserConstraints;
  currentConstraints: UserConstraints;
  confidence: number;
  missing_fields: string[];
  clarifying_questions: string[];
  source: "openai" | "fallback";
  hasUsefulSignal: boolean;
  currentMessageHasUsefulSignal: boolean;
};

export type ExtractConstraintsOptions = {
  mergePrevious?: boolean;
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

function getCurrentMessageConstraints(message: string): UserConstraints {
  return normalizeConstraints(parseConstraints(message, {}));
}

function fallbackExtractConstraints(
  message: string,
  previousConstraints: UserConstraints,
  mergePrevious: boolean,
): ConstraintExtractionResult {
  const baseConstraints = mergePrevious ? previousConstraints : {};
  const parsed = parseConstraints(message, baseConstraints);
  const constraints = normalizeConstraints(parsed);
  const currentConstraints = getCurrentMessageConstraints(message);

  return {
    constraints,
    currentConstraints,
    confidence: parsed.hasUsefulSignal ? 0.55 : 0.2,
    missing_fields: getMissingFields(constraints),
    clarifying_questions: getClarifyingQuestions(constraints),
    source: "fallback",
    hasUsefulSignal: hasUsefulSignal(constraints),
    currentMessageHasUsefulSignal: hasUsefulSignal(currentConstraints),
  };
}

export async function extractConstraints(
  message: string,
  previousConstraints: UserConstraints = {},
  llmClient: LlmClient = openAIService,
  options: ExtractConstraintsOptions = {},
): Promise<ConstraintExtractionResult> {
  const mergePrevious = options.mergePrevious ?? true;
  const normalizedPreviousConstraints = normalizeConstraints(previousConstraints);
  const baseConstraints = mergePrevious ? normalizedPreviousConstraints : {};
  const currentConstraints = getCurrentMessageConstraints(message);

  if (!llmClient.isConfigured()) {
    return fallbackExtractConstraints(
      message,
      normalizedPreviousConstraints,
      mergePrevious,
    );
  }

  try {
    const rawExtraction = await llmClient.createJsonCompletion({
      temperature: 0,
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      userPrompt: buildExtractionPrompt(message, baseConstraints),
    });
    const extraction = extractionSchema.parse(rawExtraction);
    const mergedConstraints = normalizeConstraints({
      ...baseConstraints,
      ...removeNullValues(extraction.constraints),
    });

    return {
      constraints: mergedConstraints,
      currentConstraints,
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
      currentMessageHasUsefulSignal: hasUsefulSignal(currentConstraints),
    };
  } catch (error) {
    console.warn(
      "Falling back to rule-based constraint parser:",
      error instanceof Error ? error.message : error,
    );
    return fallbackExtractConstraints(
      message,
      normalizedPreviousConstraints,
      mergePrevious,
    );
  }
}
