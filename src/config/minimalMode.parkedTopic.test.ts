import { describe, expect, it } from "vitest";

import { parkedFeatureReplyForTopic } from "./minimalMode.js";

describe("parkedFeatureReplyForTopic", () => {
  it("parks wealth topics and names what is live instead", () => {
    const reply = parkedFeatureReplyForTopic("wealth");
    expect(reply).toContain("Wealth");
    expect(reply).toContain("calendar");
  });

  it("parks notion connect", () => {
    expect(parkedFeatureReplyForTopic("notion")).toContain("Notion");
  });

  it("parks happiness movie recommend", () => {
    expect(parkedFeatureReplyForTopic("happiness")).toContain("Happiness");
  });

  it("returns null for live minimal capabilities", () => {
    expect(parkedFeatureReplyForTopic(null)).toBeNull();
  });

  it("never leaks host configuration to the user", () => {
    for (const topic of ["meals", "notion", "wealth", "happiness", "wisdom"] as const) {
      const reply = parkedFeatureReplyForTopic(topic) ?? "";
      expect(reply, topic).not.toMatch(/MAGNUS_MINIMAL_MODE|on the host|minimal mode/i);
    }
  });
});
