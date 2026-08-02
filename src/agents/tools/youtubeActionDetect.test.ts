import { describe, expect, it } from "vitest";

import { looksLikeYoutubeAction } from "./youtubeActionDetect.js";

describe("looksLikeYoutubeAction", () => {
  it("detects connect / link YouTube or Google", () => {
    expect(looksLikeYoutubeAction("connect YouTube")).toBe(true);
    expect(looksLikeYoutubeAction("link my yt music account")).toBe(true);
    expect(looksLikeYoutubeAction("connect Google")).toBe(true);
    expect(looksLikeYoutubeAction("connect my calendar")).toBe(true);
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
