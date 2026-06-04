import type { UserConstraints } from "../types/constraint.js";

export type MessageIntent =
  | "greeting"
  | "off_topic"
  | "food_vague"
  | "food_request"
  | "food_correction";

function normalizeText(message: string): string {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function hasStoredConstraints(constraints: UserConstraints): boolean {
  return (
    constraints.time_left_minutes !== undefined ||
    constraints.budget_vnd !== undefined ||
    constraints.avoid_spicy !== undefined ||
    constraints.prefer_hot !== undefined ||
    (constraints.meal_size !== undefined && constraints.meal_size !== "unknown") ||
    (constraints.preferred_tags?.length ?? 0) > 0
  );
}

function isGreeting(text: string): boolean {
  const compact = text.replace(/[!?.,"']/g, " ").replace(/\s+/g, " ").trim();

  if (/^(chao|xin chao|hello|hi|hey)( ban| nha| nhe| a| an| e)?$/.test(compact)) {
    return true;
  }

  if (/^(chao|xin chao|hello|hi|hey)(\s+\S{1,6})?$/.test(compact) && compact.length <= 24) {
    const foodSignals = /\b(mon|an|goi y|ngan sach|\d+\s*(phut|p|tieng|k))\b/;
    return !foodSignals.test(compact);
  }

  return false;
}

function isOffTopic(text: string): boolean {
  const offTopicPatterns = [
    /\bban co the giup\b/,
    /\bgiup minh nhung gi\b/,
    /\bho tro\b/,
    /\btheo doi don\b/,
    /\bdon hang\b/,
    /\bthanh toan\b/,
    /\btrack order\b/,
    /\bpayment\b/,
  ];

  const foodContextPatterns = [
    /\bgoi y\b/,
    /\bmon an\b/,
    /\ban trua\b/,
    /\ban gi\b/,
    /\bmon nong\b/,
    /\bbudget\b/,
    /\bngan sach\b/,
    /\b\d+\s*(phut|p|tieng|gio|k)\b/,
  ];

  if (!offTopicPatterns.some((pattern) => pattern.test(text))) {
    return false;
  }

  return !foodContextPatterns.some((pattern) => pattern.test(text));
}

function isFoodCorrection(
  text: string,
  previousConstraints: UserConstraints,
): boolean {
  if (!hasStoredConstraints(previousConstraints)) {
    return false;
  }

  const correctionPatterns = [
    /\bchi con \d+/,
    /\bcon \d+\s*(phut|p)\b/,
    /\bkhong (an )?cay\b/,
    /\bkhong can mon nong\b/,
    /\btang ngan sach\b/,
    /\bgiam ngan sach\b/,
    /\bdoi sang\b/,
    /\bcap nhat\b/,
    /\bthay vi\b/,
  ];

  return correctionPatterns.some((pattern) => pattern.test(text));
}

function isVagueFoodRequest(text: string): boolean {
  const vaguePatterns = [
    /\ban gi .* cung duoc\b/,
    /\ban gi nhanh\b/,
    /\bgoi y mon\b/,
    /\bgoi y cho minh\b/,
    /\bmon an ngon\b/,
    /\bcho minh mon\b/,
    /\bco gi an\b/,
  ];

  return vaguePatterns.some((pattern) => pattern.test(text));
}

export function detectMessageIntent(
  message: string,
  previousConstraints: UserConstraints = {},
  options: { isCorrectionMode?: boolean } = {},
): MessageIntent {
  const text = normalizeText(message);

  if (isGreeting(text)) {
    return "greeting";
  }

  if (isOffTopic(text)) {
    return "off_topic";
  }

  if (
    options.isCorrectionMode ||
    isFoodCorrection(text, previousConstraints)
  ) {
    return "food_correction";
  }

  if (isVagueFoodRequest(text)) {
    return "food_vague";
  }

  return "food_request";
}

export function shouldMergePreviousConstraints(
  intent: MessageIntent,
  previousConstraints: UserConstraints,
): boolean {
  if (intent === "food_correction") {
    return true;
  }

  if (intent === "food_vague" || intent === "greeting" || intent === "off_topic") {
    return false;
  }

  return hasStoredConstraints(previousConstraints);
}

export function shouldAskForClarification(
  intent: MessageIntent,
  _constraints: UserConstraints,
  _currentMessageHasUsefulSignal: boolean,
): boolean {
  return intent === "off_topic";
}

export function getResponseConstraints(
  intent: MessageIntent,
  mergedConstraints: UserConstraints,
  currentConstraints: UserConstraints,
): UserConstraints {
  if (intent === "greeting" || intent === "off_topic") {
    return {};
  }

  if (intent === "food_vague") {
    return currentConstraints;
  }

  return mergedConstraints;
}
