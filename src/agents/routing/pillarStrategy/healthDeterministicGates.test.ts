import { describe, expect, it } from "vitest";

import { healthDeterministicCapability } from "./healthDeterministicGates.js";
import type { AgentContext } from "../../types.js";

function ctx(partial: Partial<AgentContext>): AgentContext {
  return {
    userProfileId: "u",
    telegramUserId: "t",
    rawMessage: "test",
    intent: "HEALTH",
    ...partial,
  };
}

describe("healthDeterministicCapability photo gates", () => {
  it("routes meal photos to meal_log_photo", () => {
    const cap = healthDeterministicCapability(
      ctx({
        photoContext: {
          fileId: "f",
          caption: "lunch",
          downloaded: { base64: "x", mediaType: "image/jpeg" },
          analysis: {
            purpose: "meal_log",
            intent_hint: "HEALTH",
            description: "Plate of rice and dal",
            confidence: 0.9,
          },
        },
        mealPhoto: { fileId: "f" },
      }),
    );
    expect(cap).toBe("meal_log_photo");
  });

  it("does not treat book photos as meal_log_photo", () => {
    const cap = healthDeterministicCapability(
      ctx({
        photoContext: {
          fileId: "f",
          caption: "These are the books",
          downloaded: { base64: "x", mediaType: "image/jpeg" },
          analysis: {
            purpose: "list_items",
            intent_hint: "GENERAL",
            description: "Stack of book covers",
            extracted_items: ["Atomic Habits", "Deep Work"],
            confidence: 0.92,
          },
        },
        mealPhoto: { fileId: "f" },
      }),
    );
    expect(cap).toBeNull();
  });
});
