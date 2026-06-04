import { Router } from "express";

import { normalizeChatHistory } from "../services/chat-history.util.js";
import { buildRecommendationResponse } from "../services/recommendation-orchestrator.service.js";
import { buildErrorResponse } from "../services/response.service.js";
import type { RecommendRequest } from "../types/api.js";

export const recommendRouter = Router();

function isValidRequestBody(body: Partial<RecommendRequest>): body is RecommendRequest {
  return typeof body.message === "string" && body.message.trim().length > 0;
}

recommendRouter.post("/", async (req, res) => {
  try {
    if (!isValidRequestBody(req.body)) {
      res.status(400).json(buildErrorResponse());
      return;
    }

    const response = await buildRecommendationResponse(
      req.body.message,
      req.body.constraints ?? {},
      {},
      {},
      normalizeChatHistory(req.body.history),
    );

    res.json(response);
  } catch (error) {
    console.error("Failed to handle /api/recommend", error);
    res.status(500).json(buildErrorResponse());
  }
});
