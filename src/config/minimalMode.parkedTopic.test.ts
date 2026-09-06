import { afterEach, describe, expect, it } from "vitest";

import { parkedGeneralTopicReply } from "./minimalMode.js";

describe("parkedGeneralTopicReply", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("parks wealth topics in minimal mode phrasing", () => {
    process.env.MAGNUS_MINIMAL_MODE = "true";
    expect(parkedGeneralTopicReply("show my zerodha portfolio")).toContain("temporarily parked");
  });

  it("parks notion connect", () => {
    expect(parkedGeneralTopicReply("connect notion")).toContain("temporarily parked");
  });

  it("parks happiness movie recommend", () => {
    expect(parkedGeneralTopicReply("recommend a movie for tonight")).toContain("temporarily parked");
  });

  it("returns null for live minimal capabilities", () => {
    expect(parkedGeneralTopicReply("what's on my calendar tomorrow?")).toBeNull();
  });
});
