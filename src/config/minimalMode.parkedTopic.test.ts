import { describe, expect, it } from "vitest";

import { parkedFeatureReplyForTopic } from "./minimalMode.js";

describe("parkedFeatureReplyForTopic", () => {
  it("parks wealth topics in minimal mode phrasing", () => {
    expect(parkedFeatureReplyForTopic("wealth")).toContain("temporarily parked");
  });

  it("parks notion connect", () => {
    expect(parkedFeatureReplyForTopic("notion")).toContain("temporarily parked");
  });

  it("parks happiness movie recommend", () => {
    expect(parkedFeatureReplyForTopic("happiness")).toContain("temporarily parked");
  });

  it("returns null for live minimal capabilities", () => {
    expect(parkedFeatureReplyForTopic(null)).toBeNull();
  });
});
