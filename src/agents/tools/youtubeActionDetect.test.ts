import { describe, expect, it } from "vitest";

import { looksLikeYoutubeAction } from "./youtubeActionDetect.js";

describe("looksLikeYoutubeAction", () => {
  it("detects explicit YouTube / YT Music actions", () => {
    expect(looksLikeYoutubeAction("search YouTube for lo-fi beats")).toBe(true);
    expect(looksLikeYoutubeAction("add this to my Magnus playlist")).toBe(true);
    expect(looksLikeYoutubeAction("bookmark that song for later")).toBe(true);
    expect(looksLikeYoutubeAction("cue this video")).toBe(true);
    expect(looksLikeYoutubeAction("create a focus playlist")).toBe(true);
    expect(looksLikeYoutubeAction("what's on my yt music playlist")).toBe(true);
  });

  it("detects YouTube URLs", () => {
    expect(
      looksLikeYoutubeAction("bookmark https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe(true);
    expect(looksLikeYoutubeAction("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(looksLikeYoutubeAction("https://music.youtube.com/watch?v=abc")).toBe(true);
  });

  it("leaves ordinary taste talk alone", () => {
    expect(looksLikeYoutubeAction("what should I read tonight?")).toBe(false);
    expect(looksLikeYoutubeAction("recommend a film that feels like Arrival")).toBe(false);
    expect(looksLikeYoutubeAction("I overspent on food this month")).toBe(false);
  });
});
