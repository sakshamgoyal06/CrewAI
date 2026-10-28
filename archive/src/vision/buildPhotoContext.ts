import { logger } from "../logger.js";
import { downloadTelegramPhoto } from "../meals/telegramPhotoDownload.js";
import { analyzePhotoInContext, type PhotoTurnPreview } from "./analyzePhotoInContext.js";
import type { PhotoAttachment, PhotoContext } from "./types.js";

export async function buildPhotoContext(input: {
  photo: PhotoAttachment;
  recentTurns?: PhotoTurnPreview[];
}): Promise<PhotoContext> {
  const downloaded = await downloadTelegramPhoto(input.photo.fileId);
  const caption = input.photo.caption?.trim() ?? null;

  try {
    const analysis = await analyzePhotoInContext({
      photo: downloaded,
      caption,
      recentTurns: input.recentTurns,
    });
    return {
      fileId: input.photo.fileId,
      caption,
      downloaded,
      analysis,
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "photo vision analysis failed — using caption fallback");
    const fallbackCaption = caption ?? "";
    const mealLike = /\b(meal|food|ate|lunch|dinner|breakfast|snack|plate)\b/i.test(fallbackCaption);
    return {
      fileId: input.photo.fileId,
      caption,
      downloaded,
      analysis: {
        purpose: mealLike ? "meal_log" : "general",
        intent_hint: mealLike ? "HEALTH" : "GENERAL",
        description: fallbackCaption
          ? `Photo with caption: ${fallbackCaption}`
          : "User shared a photo (vision analysis unavailable).",
        confidence: 0.25,
      },
    };
  }
}
