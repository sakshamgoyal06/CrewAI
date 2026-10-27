import { describe, expect, it } from "vitest";

import { augmentMessageWithPhotoContext } from "./augmentMessageWithPhoto.js";
import type { PhotoContext } from "./types.js";

describe("augmentMessageWithPhotoContext", () => {
  it("includes description and extracted items for agents", () => {
    const ctx: PhotoContext = {
      fileId: "f",
      caption: "These are the books",
      downloaded: { base64: "x", mediaType: "image/jpeg" },
      analysis: {
        purpose: "list_items",
        intent_hint: "GENERAL",
        description: "Photo of four book covers on a shelf",
        extracted_items: ["Atomic Habits", "Deep Work"],
        confidence: 0.9,
      },
    };

    const out = augmentMessageWithPhotoContext("These are the books", ctx);
    expect(out).toContain("Photo of four book covers");
    expect(out).toContain("Atomic Habits");
    expect(out).toContain("Deep Work");
  });
});
