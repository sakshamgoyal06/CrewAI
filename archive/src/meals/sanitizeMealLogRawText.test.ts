import { describe, expect, it } from "vitest";

import { sanitizeMealLogRawText } from "./sanitizeMealLogRawText.js";

describe("sanitizeMealLogRawText", () => {
  it("strips step scaffolding from persisted meal text", () => {
    expect(
      sanitizeMealLogRawText(
        "moong dal and aloo palak\n\n---\nPrior steps completed:\n[Prior step 1]",
      ),
    ).toBe("moong dal and aloo palak");
  });

  it("strips step focus scaffolding", () => {
    expect(
      sanitizeMealLogRawText("2 rotis\n\n---\nStep focus: Add rotis to lunch"),
    ).toBe("2 rotis");
  });
});
