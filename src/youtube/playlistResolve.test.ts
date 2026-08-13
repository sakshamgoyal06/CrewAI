import { describe, expect, it } from "vitest";

import { scorePlaylistTitle, formatPlaylistDisambiguation, prefersYoutubeAccountPlaylist } from "./playlistResolve.js";

describe("scorePlaylistTitle", () => {
  it("scores exact and partial title matches", () => {
    expect(scorePlaylistTitle("High Energy Workout Mix", "High Energy Workout Mix")).toBe(100);
    expect(scorePlaylistTitle("high energy workout", "High Energy Workout Mix")).toBeGreaterThanOrEqual(75);
    expect(scorePlaylistTitle("Magnus", "Guitar Learning")).toBe(0);
  });
});

describe("formatPlaylistDisambiguation", () => {
  it("formats numbered suggestions for a missing playlist name", () => {
    const text = formatPlaylistDisambiguation({
      requestedName: "High Energy Workout",
      suggestions: [
        { playlistId: "PLabc", title: "High Energy Workout Mix", score: 85, itemCount: 57 },
        { playlistId: "PLdef", title: "Magnus", score: 0, itemCount: 5 },
      ],
      actionHint: "add to",
    });
    expect(text).toContain('couldn\'t find an exact playlist');
    expect(text).toContain("1. High Energy Workout Mix");
    expect(text).toContain("PLabc");
  });
});

describe("prefersYoutubeAccountPlaylist", () => {
  it("prefers YT account playlists when user mentions youtube music", () => {
    expect(
      prefersYoutubeAccountPlaylist(
        "High Energy Workout Mix",
        "Add songs to my high energy workout playlist in youtube music",
      ),
    ).toBe(true);
    expect(prefersYoutubeAccountPlaylist("wisdom", "add to wisdom playlist")).toBe(false);
    expect(prefersYoutubeAccountPlaylist("High Energy Workout", undefined)).toBe(true);
  });
});
