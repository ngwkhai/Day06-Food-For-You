import "dotenv/config";

import cors from "cors";
import express from "express";

import { getFoodImagesDir, getFoodImagesStartupStatus } from "./services/food-image.util.js";
import { correctRouter } from "./routes/correct.route.js";
import { docsRouter } from "./routes/docs.route.js";
import { healthRouter } from "./routes/health.route.js";
import { recommendRouter } from "./routes/recommend.route.js";
import { transcribeRouter } from "./routes/transcribe.route.js";

const app = express();
const port = Number(process.env.PORT ?? 8000);

app.use(cors());
app.use(express.json());
app.use("/images", express.static(getFoodImagesDir()));

app.use("/health", healthRouter);
app.use("/docs", docsRouter);
app.use("/api/recommend", recommendRouter);
app.use("/api/correct", correctRouter);
app.use("/api/transcribe", transcribeRouter);

app.listen(port, () => {
  const imageStatus = getFoodImagesStartupStatus();

  console.log(`Backend is running on http://localhost:${port}`);
  console.log(`API docs available at http://localhost:${port}/docs`);
  console.log(`Public API base URL for images: ${imageStatus.publicBaseUrl}`);

  if (!imageStatus.exists || imageStatus.fileCount === 0) {
    console.warn(
      "Food images directory is missing or empty. Set FOOD_IMAGES_DIR and deploy data/images.",
      {
        imagesDir: imageStatus.imagesDir,
        tried: imageStatus.candidates,
      },
    );
  } else {
    console.log(
      `Serving ${imageStatus.fileCount} food images from ${imageStatus.imagesDir}`,
    );
  }
});
