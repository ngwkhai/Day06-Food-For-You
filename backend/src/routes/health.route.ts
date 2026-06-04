import { Router } from "express";

import type { HealthResponse } from "../types/api.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const response: HealthResponse = {
    status: "ok",
    message: "Backend is running",
  };

  res.json(response);
});
