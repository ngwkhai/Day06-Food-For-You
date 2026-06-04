import {
  normalizeConstraints,
  type ParsedConstraints,
  type UserConstraints,
} from "../types/constraint.js";

const TAG_KEYWORDS: Array<[string, string[]]> = [
  ["com", ["com", "cơm"]],
  ["bun", ["bun", "bún"]],
  ["pho", ["pho", "phở"]],
  ["mi", ["mi", "mì"]],
  ["banhmi", ["banh mi", "bánh mì"]],
  ["xoi", ["xoi", "xôi"]],
  ["healthy", ["healthy", "salad", "lanh manh", "lành mạnh"]],
  ["nhanh", ["nhanh", "giao nhanh"]],
];

function normalizeText(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function parseTimeLeft(text: string): number | undefined {
  const hourMatch = text.match(/(\d+)\s*(tieng|gio|h)\b/);
  if (hourMatch) {
    return Number(hourMatch[1]) * 60;
  }

  const minuteMatch = text.match(/(\d+)\s*(phut|p)\b/);
  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  return undefined;
}

function parseBudget(text: string): number | undefined {
  const shortBudgetMatch = text.match(/(\d+)\s*(k|nghin|ngan)\b/);
  if (shortBudgetMatch) {
    return Number(shortBudgetMatch[1]) * 1000;
  }

  const vndBudgetMatch = text.match(/(\d{5,6})\s*(vnd|dong)?\b/);
  if (vndBudgetMatch) {
    return Number(vndBudgetMatch[1]);
  }

  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesKeyword(text: string, keyword: string): boolean {
  const normalizedKeyword = normalizeText(keyword);
  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegex(normalizedKeyword)}($|[^a-z0-9])`,
  );

  return pattern.test(text);
}

function parsePreferredTags(text: string): string[] {
  const tags = new Set<string>();

  for (const [tag, keywords] of TAG_KEYWORDS) {
    if (keywords.some((keyword) => includesKeyword(text, keyword))) {
      tags.add(tag);
    }
  }

  return Array.from(tags);
}

export function parseConstraints(
  message: string,
  previousConstraints: UserConstraints = {},
): ParsedConstraints {
  const text = normalizeText(message);
  const constraints = normalizeConstraints(previousConstraints);
  let hasUsefulSignal = false;

  const timeLeft = parseTimeLeft(text);
  if (timeLeft !== undefined) {
    constraints.time_left_minutes = timeLeft;
    hasUsefulSignal = true;
  }

  const budget = parseBudget(text);
  if (budget !== undefined) {
    constraints.budget_vnd = budget;
    hasUsefulSignal = true;
  }

  if (text.includes("khong cay") || text.includes("khong an cay")) {
    constraints.avoid_spicy = true;
    hasUsefulSignal = true;
  } else if (text.includes("an cay") || text.includes("mon cay")) {
    constraints.avoid_spicy = false;
    hasUsefulSignal = true;
  }

  if (text.includes("mon nong") || text.includes("an nong") || text.includes("nong")) {
    constraints.prefer_hot = true;
    hasUsefulSignal = true;
  }

  if (text.includes("an nhe") || text.includes("nhe bung")) {
    constraints.meal_size = "light";
    hasUsefulSignal = true;
  } else if (text.includes("an no") || text.includes("no bung") || text.includes("that no")) {
    constraints.meal_size = "full";
    hasUsefulSignal = true;
  }

  const parsedTags = parsePreferredTags(text);
  if (parsedTags.length > 0) {
    constraints.preferred_tags = Array.from(
      new Set([...(constraints.preferred_tags ?? []), ...parsedTags]),
    );
    hasUsefulSignal = true;
  }

  return {
    ...normalizeConstraints(constraints),
    hasUsefulSignal,
  };
}
