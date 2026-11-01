import type { Intent } from "../intent.js";
import type { TelegramPhotoPayload } from "../meals/telegramPhotoDownload.js";

/** What the user likely wants to do with this image. */
export type PhotoPurpose =
  | "meal_log"
  | "list_items"
  | "receipt"
  | "workout"
  | "document"
  | "schedule"
  | "general";

export type PhotoVisionAnalysis = {
  purpose: PhotoPurpose;
  intent_hint: Intent;
  /** Plain-language description of what is visible. */
  description: string;
  /** OCR / on-image text when readable. */
  extracted_text?: string | null;
  /** Structured items (book titles, foods, line items, …). */
  extracted_items?: string[];
  confidence: number;
};

export type PhotoAttachment = {
  fileId: string;
  caption?: string | null;
};

export type PhotoContext = {
  fileId: string;
  caption: string | null;
  downloaded: TelegramPhotoPayload;
  analysis: PhotoVisionAnalysis;
};
