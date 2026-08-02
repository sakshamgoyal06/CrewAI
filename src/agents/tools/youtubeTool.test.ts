import { beforeEach, describe, expect, it, vi } from "vitest";

const configured = vi.hoisted(() => ({
  youtubeReadyForUser: true,
  youtubeOauthReadyForUser: true,
  youtubeApiKeyConfigured: false,
}));

vi.mock("../../integrations/youtube/auth.js", () => ({
  youtubeReadyForUser: async () => configured.youtubeReadyForUser,
  youtubeOauthReadyForUser: async () => configured.youtubeOauthReadyForUser,
  youtubeApiKeyConfigured: () => configured.youtubeApiKeyConfigured,
}));

const searchVideos = vi.hoisted(() => vi.fn());
const recommendVideos = vi.hoisted(() => vi.fn());
const getVideo = vi.hoisted(() => vi.fn());
const listPlaylists = vi.hoisted(() => vi.fn());
const createPlaylist = vi.hoisted(() => vi.fn());
const loadPlaylistItems = vi.hoisted(() => vi.fn());
const getPlaylist = vi.hoisted(() => vi.fn());
const addToPlaylist = vi.hoisted(() => vi.fn());
const removeFromPlaylist = vi.hoisted(() => vi.fn());
const rateVideo = vi.hoisted(() => vi.fn());
const listLikedVideos = vi.hoisted(() => vi.fn());

vi.mock("../../integrations/youtube/operations.js", () => ({
  searchVideos,
  recommendVideos,
  getVideo,
  listPlaylists,
  createPlaylist,
  loadPlaylistItems,
  getPlaylist,
  addToPlaylist,
  removeFromPlaylist,
  rateVideo,
  listLikedVideos,
}));

const upsertBookmark = vi.hoisted(() => vi.fn());
const listBookmarks = vi.hoisted(() => vi.fn());
const removeBookmark = vi.hoisted(() => vi.fn());
const enqueueCue = vi.hoisted(() => vi.fn());
const listCue = vi.hoisted(() => vi.fn());
const popCue = vi.hoisted(() => vi.fn());
const removeCueItem = vi.hoisted(() => vi.fn());
const clearCue = vi.hoisted(() => vi.fn());
const getYoutubeState = vi.hoisted(() => vi.fn());
const setMagnusPlaylistId = vi.hoisted(() => vi.fn());

vi.mock("../../youtube/youtubeStore.js", () => ({
  upsertBookmark,
  listBookmarks,
  removeBookmark,
  enqueueCue,
  listCue,
  popCue,
  removeCueItem,
  clearCue,
  getYoutubeState,
  setMagnusPlaylistId,
}));

import {
  _youtubeToolInternals,
  youtubeBookmarkTool,
  youtubeCueTool,
  youtubePlaylistTool,
  youtubeRecommendTool,
  youtubeSearchTool,
} from "./youtubeTool.js";

const sampleVideo = {
  videoId: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  channelTitle: "Rick Astley",
  duration: "3:33",
  url: "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
  kind: "song" as const,
};

describe("youtube tools — configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured.youtubeReadyForUser = true;
    configured.youtubeOauthReadyForUser = true;
  });

  it("explains when YouTube is not connected for the user", async () => {
    configured.youtubeReadyForUser = false;
    const out = await youtubeSearchTool({ query: "lofi", userProfileId: "user-1" });
    expect(out).toContain("not connected");
    expect(searchVideos).not.toHaveBeenCalled();
  });

  it("requires OAuth for playlists when the user has no YouTube token", async () => {
    configured.youtubeOauthReadyForUser = false;
    const out = await youtubePlaylistTool({
      action: "list",
      userProfileId: "user-1",
    });
    expect(out).toMatch(/account connected|YouTube account/i);
    expect(listPlaylists).not.toHaveBeenCalled();
  });
});

describe("youtube_search / recommend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured.youtubeReadyForUser = true;
    configured.youtubeOauthReadyForUser = true;
  });

  it("formats search hits with links and ids", async () => {
    searchVideos.mockResolvedValue([sampleVideo]);
    const out = await youtubeSearchTool({
      query: "rick astley",
      kind: "song",
      userProfileId: "user-1",
    });
    expect(searchVideos).toHaveBeenCalledWith(
      expect.objectContaining({ query: "rick astley", kind: "song" }),
    );
    expect(out).toContain("Never Gonna Give You Up");
    expect(out).toContain("video_id: dQw4w9WgXcQ");
    expect(out).toContain("music.youtube.com");
  });

  it("formats recommendations from a seed", async () => {
    recommendVideos.mockResolvedValue({
      seed: sampleVideo,
      items: [{ ...sampleVideo, videoId: "abcdef12345", title: "Together Forever" }],
    });
    const out = await youtubeRecommendTool({
      seedVideoId: "dQw4w9WgXcQ",
      userProfileId: "user-1",
    });
    expect(out).toContain('Because you liked "Never Gonna Give You Up"');
    expect(out).toContain("Together Forever");
  });
});

describe("youtube_playlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured.youtubeReadyForUser = true;
    configured.youtubeOauthReadyForUser = true;
  });

  it("creates the Magnus playlist when missing", async () => {
    getYoutubeState.mockResolvedValue({ ok: true, data: null });
    createPlaylist.mockResolvedValue({
      playlistId: "PLmagnus",
      title: "Magnus",
      url: "https://www.youtube.com/playlist?list=PLmagnus",
      privacyStatus: "private",
    });
    setMagnusPlaylistId.mockResolvedValue({
      ok: true,
      data: { magnus_playlist_id: "PLmagnus" },
    });

    const out = await youtubePlaylistTool({
      action: "ensure_magnus",
      userProfileId: "user-1",
    });
    expect(createPlaylist).toHaveBeenCalled();
    expect(out).toContain("Created private playlist");
    expect(out).toContain("PLmagnus");
  });
});

describe("youtube_bookmark / cue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configured.youtubeReadyForUser = true;
    configured.youtubeOauthReadyForUser = true;
  });

  it("bookmarks by url and likes on YouTube", async () => {
    getVideo.mockResolvedValue(sampleVideo);
    upsertBookmark.mockResolvedValue({ ok: true, data: { id: "b1" } });
    rateVideo.mockResolvedValue(undefined);

    const out = await youtubeBookmarkTool({
      action: "add",
      userProfileId: "user-1",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(upsertBookmark).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "dQw4w9WgXcQ", userProfileId: "user-1" }),
    );
    expect(rateVideo).toHaveBeenCalledWith({
      videoId: "dQw4w9WgXcQ",
      rating: "like",
      userProfileId: "user-1",
    });
    expect(out).toContain("Bookmarked");
  });

  it("queues and pops the cue", async () => {
    getVideo.mockResolvedValue(sampleVideo);
    enqueueCue.mockResolvedValue({
      ok: true,
      data: { position: 1, title: sampleVideo.title },
    });
    popCue.mockResolvedValue({
      ok: true,
      data: {
        title: sampleVideo.title,
        channel_title: sampleVideo.channelTitle,
        kind: "song",
        url: sampleVideo.url,
      },
    });

    const queued = await youtubeCueTool({
      action: "add",
      userProfileId: "user-1",
      videoId: "dQw4w9WgXcQ",
    });
    expect(queued).toContain("Queued #1");

    const next = await youtubeCueTool({ action: "next", userProfileId: "user-1" });
    expect(next).toContain("Up next");
    expect(next).toContain(sampleVideo.url);
  });
});

describe("extractVideoId", () => {
  it("parses watch, short, and bare ids", () => {
    const { extractVideoId } = _youtubeToolInternals;
    expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
});
