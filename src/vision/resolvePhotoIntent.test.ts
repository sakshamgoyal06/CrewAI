import { describe, expect, it } from "vitest";

import { isMealPhotoPurpose, resolvePhotoIntent } from "./resolvePhotoIntent.js";
import type { PhotoContext } from "./types.js";

function photo(partial: Partial<PhotoContext["analysis"]> & { caption?: string }): PhotoContext {
  const { caption, ...analysisPartial } = partial;
  return {
    fileId: "f",
    caption: caption ?? null,
    downloaded: { base64: "x", mediaType: "image/jpeg" },
    analysis: {
      purpose: "general",
      intent_hint: "GENERAL",
      description: "A photo",
      confidence: 0.8,
      ...analysisPartial,
    },
  };
}

describe("resolvePhotoIntent", () => {
  it("routes list_items photos to GENERAL", () => {
    const intent = resolvePhotoIntent(
      photo({
        purpose: "list_items",
        intent_hint: "GENERAL",
        extracted_items: ["Dune", "Foundation"],
        confidence: 0.9,
        caption: "These are the books",
      }),
    );
    expect(intent).toBe("GENERAL");
  });

  it("routes meal_log photos to HEALTH", () => {
    const intent = resolvePhotoIntent(
      photo({
        purpose: "meal_log",
        intent_hint: "HEALTH",
        confidence: 0.9,
      }),
    );
    expect(intent).toBe("HEALTH");
  });
});

describe("isMealPhotoPurpose", () => {
  it("is true only for meal_log purpose", () => {
    expect(isMealPhotoPurpose(photo({ purpose: "meal_log" }))).toBe(true);
    expect(isMealPhotoPurpose(photo({ purpose: "list_items" }))).toBe(false);
    expect(isMealPhotoPurpose(undefined)).toBe(false);
  });
});
