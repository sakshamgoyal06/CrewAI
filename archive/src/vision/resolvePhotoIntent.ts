import type { Intent } from "../intent.js";
import type { PhotoContext } from "./types.js";

/** Resolve top-level intent from vision analysis (deterministic override before NL classifier). */
export function resolvePhotoIntent(photoContext: PhotoContext): Intent {
  const { analysis } = photoContext;

  if (analysis.confidence >= 0.45) {
    return analysis.intent_hint;
  }

  const caption = photoContext.caption ?? "";
  if (analysis.purpose === "meal_log" || /\b(meal|food|ate|lunch|dinner|breakfast)\b/i.test(caption)) {
    return "HEALTH";
  }

  return analysis.intent_hint;
}

/** True when HEALTH should run the meal photo log pipeline. */
export function isMealPhotoPurpose(photoContext: PhotoContext | undefined): boolean {
  if (!photoContext) {
    return false;
  }
  return photoContext.analysis.purpose === "meal_log";
}
