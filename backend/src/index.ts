import "dotenv/config";

import cors from "cors";
import express from "express";

import { correctRouter } from "./routes/correct.route.js";
import { docsRouter } from "./routes/docs.route.js";
import { healthRouter } from "./routes/health.route.js";
import { recommendRouter } from "./routes/recommend.route.js";

const app = express();
const port = Number(process.env.PORT ?? 8000);

app.use(cors());
app.use(express.json());

app.use("/health", healthRouter);
app.use("/docs", docsRouter);
app.use("/api/recommend", recommendRouter);
app.use("/api/correct", correctRouter);

app.listen(port, () => {
  console.log(`Backend is running on http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/docs`);
});
