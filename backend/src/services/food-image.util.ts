import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_IMAGES_DIR = path.resolve(__dirname, "../../../data/images");

export function getFoodImagesDir(): string {
  const configured = process.env.FOOD_IMAGES_DIR;

  if (!configured) {
    return DEFAULT_IMAGES_DIR;
  }

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

export function getPublicApiBaseUrl(): string {
  const configured = process.env.PUBLIC_API_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const port = process.env.PORT ?? "8000";
  return `http://localhost:${port}`;
}

export function resolveFoodImageUrl(foodId: string): string | undefined {
  const imagesDir = getFoodImagesDir();

  for (const extension of IMAGE_EXTENSIONS) {
    const filename = `${foodId}${extension}`;

    if (existsSync(path.join(imagesDir, filename))) {
      return `${getPublicApiBaseUrl()}/images/${filename}`;
    }
  }

  return undefined;
}

export function attachFoodImageUrl<T extends { id: string }>(
  food: T,
): T & { image_url?: string } {
  const image_url = resolveFoodImageUrl(food.id);

  if (!image_url) {
    return food;
  }

  return {
    ...food,
    image_url,
  };
}
