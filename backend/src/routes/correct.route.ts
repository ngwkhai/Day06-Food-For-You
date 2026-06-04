import { Router } from "express";

import { buildRecommendationResponse } from "../services/recommendation-orchestrator.service.js";
import { buildErrorResponse } from "../services/response.service.js";
import type { CorrectRequest } from "../types/api.js";

export const correctRouter = Router();

function isValidRequestBody(body: Partial<CorrectRequest>): body is CorrectRequest {
  return typeof body.message === "string" && body.message.trim().length > 0;
}

correctRouter.post("/", async (req, res) => {
  try {
    if (!isValidRequestBody(req.body)) {
      res.status(400).json(buildErrorResponse());
      return;
    }

    const response = await buildRecommendationResponse(
      req.body.message,
      req.body.constraints ?? {},
      { isCorrection: true },
    );

    res.json(response);
  } catch (error) {
    console.error("Failed to handle /api/correct", error);
    res.status(500).json(buildErrorResponse());
  }
});
