import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_IMAGES_DIR = path.resolve(__dirname, "../../../data/images");

function getFoodImagesDirCandidates(): string[] {
  const candidates: string[] = [];

  if (process.env.FOOD_IMAGES_DIR) {
    const configured = process.env.FOOD_IMAGES_DIR;
    candidates.push(
      path.isAbsolute(configured)
        ? configured
        : path.resolve(process.cwd(), configured),
    );
  }

  candidates.push(
    path.resolve(process.cwd(), "../data/images"),
    path.resolve(process.cwd(), "data/images"),
    path.resolve(__dirname, "../../../data/images"),
    path.resolve(__dirname, "../../data/images"),
    DEFAULT_IMAGES_DIR,
  );

  return [...new Set(candidates)];
}

export function getFoodImagesDir(): string {
  for (const candidate of getFoodImagesDirCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return DEFAULT_IMAGES_DIR;
}

export function getPublicApiBaseUrl(): string {
  const configured = process.env.PUBLIC_API_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const renderUrl = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderUrl) {
    return renderUrl.replace(/\/$/, "");
  }

  const port = process.env.PORT ?? "8000";
  return `http://localhost:${port}`;
}

export function resolveFoodImageUrl(foodId: string): string | undefined {
  const imagesDir = getFoodImagesDir();

  if (!existsSync(imagesDir)) {
    return undefined;
  }

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

export function getFoodImagesStartupStatus(): {
  imagesDir: string;
  exists: boolean;
  fileCount: number;
  publicBaseUrl: string;
  candidates: string[];
} {
  const imagesDir = getFoodImagesDir();
  const exists = existsSync(imagesDir);
  let fileCount = 0;

  if (exists) {
    fileCount = readdirSync(imagesDir).filter((name) =>
      IMAGE_EXTENSIONS.some((extension) => name.endsWith(extension)),
    ).length;
  }

  return {
    imagesDir,
    exists,
    fileCount,
    publicBaseUrl: getPublicApiBaseUrl(),
    candidates: getFoodImagesDirCandidates(),
  };
}
