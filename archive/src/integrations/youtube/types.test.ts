import { describe, expect, it } from "vitest";

import { formatDuration, inferKind, musicWatchUrl, videoUrl } from "./types.js";

describe("youtube types helpers", () => {
  it("infers songs from Music category and Topic channels", () => {
    expect(inferKind({ categoryId: "10", title: "Hello" })).toBe("song");
    expect(inferKind({ channelTitle: "Adele - Topic", title: "Hello" })).toBe("song");
    expect(inferKind({ title: "How batteries work", channelTitle: "Veritasium" })).toBe(
      "video",
    );
  });

  it("formats ISO durations", () => {
    expect(formatDuration("PT3M33S")).toBe("3:33");
    expect(formatDuration("PT1H2M3S")).toBe("1:02:03");
    expect(formatDuration(null)).toBeUndefined();
  });

  it("builds watch urls", () => {
    expect(videoUrl("abc")).toBe("https://www.youtube.com/watch?v=abc");
    expect(musicWatchUrl("abc")).toBe("https://music.youtube.com/watch?v=abc");
  });
});
