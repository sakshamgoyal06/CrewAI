/**
 * YouTube Data API v3 operations used by Magnus tools.
 *
 * There is no official YouTube Music API. Music playlists and searches use the
 * standard YouTube API (category 10 + music.youtube.com links). Playlists created
 * here show up in YouTube Music when the items are music.
 */
import type { youtube_v3 } from "googleapis";

import {
  getApiKeyYoutubeClient,
  getAuthenticatedYoutubeClient,
  youtubeOauthConfiguredForUser,
} from "./auth.js";
import { YOUTUBE_MUSIC_CATEGORY_ID } from "./paths.js";
import {
  formatDuration,
  inferKind,
  musicWatchUrl,
  playlistUrl,
  videoUrl,
  type YoutubeItemKind,
  type YoutubePlaylistBrief,
  type YoutubePlaylistItemBrief,
  type YoutubeVideoBrief,
} from "./types.js";

async function youtubeClient(
  preferOauth = false,
  userProfileId?: string,
): Promise<youtube_v3.Youtube> {
  const oauthReady = await youtubeOauthConfiguredForUser(userProfileId);
  if (preferOauth || oauthReady) {
    if (oauthReady) {
      const { youtube } = await getAuthenticatedYoutubeClient(userProfileId);
      return youtube;
    }
  }
  return getApiKeyYoutubeClient();
}

function thumbUrl(snippet?: youtube_v3.Schema$SearchResultSnippet | youtube_v3.Schema$VideoSnippet | null): string | undefined {
  const t = snippet?.thumbnails;
  return (
    t?.medium?.url ??
    t?.high?.url ??
    t?.default?.url ??
    undefined
  );
}

function briefFromVideo(v: youtube_v3.Schema$Video): YoutubeVideoBrief | null {
  if (!v.id) {
    return null;
  }
  const kind = inferKind({
    categoryId: v.snippet?.categoryId,
    title: v.snippet?.title,
    channelTitle: v.snippet?.channelTitle,
  });
  return {
    videoId: v.id,
    title: v.snippet?.title ?? "(no title)",
    channelTitle: v.snippet?.channelTitle ?? "",
    channelId: v.snippet?.channelId ?? undefined,
    description: v.snippet?.description ?? undefined,
    publishedAt: v.snippet?.publishedAt ?? undefined,
    duration: formatDuration(v.contentDetails?.duration),
    viewCount: v.statistics?.viewCount ?? undefined,
    likeCount: v.statistics?.likeCount ?? undefined,
    thumbnailUrl: thumbUrl(v.snippet),
    url: kind === "song" ? musicWatchUrl(v.id) : videoUrl(v.id),
    kind,
  };
}

export async function getVideos(
  videoIds: string[],
  userProfileId?: string,
): Promise<YoutubeVideoBrief[]> {
  const ids = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const youtube = await youtubeClient(false, userProfileId);
  const res = await youtube.videos.list({
    part: ["snippet", "contentDetails", "statistics"],
    id: ids,
    maxResults: Math.min(ids.length, 50),
  });
  return (res.data.items ?? [])
    .map(briefFromVideo)
    .filter((v): v is YoutubeVideoBrief => v !== null);
}

export async function getVideo(
  videoId: string,
  userProfileId?: string,
): Promise<YoutubeVideoBrief | null> {
  const [v] = await getVideos([videoId], userProfileId);
  return v ?? null;
}

export async function searchVideos(input: {
  query: string;
  kind?: YoutubeItemKind | "all";
  maxResults?: number;
  userProfileId?: string;
}): Promise<YoutubeVideoBrief[]> {
  const q = input.query.trim();
  if (!q) {
    return [];
  }
  const maxResults = Math.min(Math.max(input.maxResults ?? 8, 1), 25);
  const youtube = await youtubeClient(false, input.userProfileId);
  const kind = input.kind ?? "all";

  const res = await youtube.search.list({
    part: ["snippet"],
    q,
    type: ["video"],
    maxResults,
    videoCategoryId: kind === "song" ? YOUTUBE_MUSIC_CATEGORY_ID : undefined,
    // Relevance for recommendations/search; safe for a personal bot.
    safeSearch: "none",
  });

  const ids = (res.data.items ?? [])
    .map((item) => item.id?.videoId)
    .filter((id): id is string => Boolean(id));

  const videos = await getVideos(ids, input.userProfileId);
  if (kind === "video") {
    return videos.filter((v) => v.kind === "video");
  }
  if (kind === "song") {
    // Prefer inferred songs, but keep Music-category results even if heuristic says video.
    return videos.map((v) => (v.kind === "song" ? v : { ...v, kind: "song" as const, url: musicWatchUrl(v.videoId) }));
  }
  return videos;
}

/**
 * Recommendations without the deprecated relatedToVideoId:
 * seed video → search on title/channel; else mood query; else trending music or bookmarks seed.
 */
export async function recommendVideos(input: {
  seedVideoId?: string;
  query?: string;
  kind?: YoutubeItemKind | "all";
  maxResults?: number;
  userProfileId?: string;
}): Promise<{ seed?: YoutubeVideoBrief; items: YoutubeVideoBrief[] }> {
  const maxResults = Math.min(Math.max(input.maxResults ?? 8, 1), 15);
  const kind = input.kind ?? "all";

  let seed: YoutubeVideoBrief | undefined;
  let query = input.query?.trim() ?? "";

  if (input.seedVideoId?.trim()) {
    seed = (await getVideo(input.seedVideoId.trim(), input.userProfileId)) ?? undefined;
    if (seed) {
      // Strip common trailer/noise suffixes; keep artist + title signal.
      const cleaned = seed.title
        .replace(/\(.*?\)/g, " ")
        .replace(/\[.*?\]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      query = query || `${cleaned} ${seed.channelTitle}`.trim();
    }
  }

  if (!query) {
    const youtube = await youtubeClient(false, input.userProfileId);
    const chart = await youtube.videos.list({
      part: ["snippet", "contentDetails", "statistics"],
      chart: "mostPopular",
      regionCode: process.env.YOUTUBE_REGION_CODE?.trim() || "US",
      videoCategoryId: kind === "video" ? undefined : YOUTUBE_MUSIC_CATEGORY_ID,
      maxResults,
    });
    const items = (chart.data.items ?? [])
      .map(briefFromVideo)
      .filter((v): v is YoutubeVideoBrief => v !== null);
    return { items };
  }

  const items = await searchVideos({
    query,
    kind,
    maxResults,
    userProfileId: input.userProfileId,
  });
  const filtered = seed
    ? items.filter((v) => v.videoId !== seed.videoId)
    : items;
  return { seed, items: filtered };
}

export async function listPlaylists(input?: {
  maxResults?: number;
  userProfileId?: string;
}): Promise<YoutubePlaylistBrief[]> {
  const youtube = await youtubeClient(true, input?.userProfileId);
  const maxResults = Math.min(Math.max(input?.maxResults ?? 25, 1), 50);
  const res = await youtube.playlists.list({
    part: ["snippet", "contentDetails", "status"],
    mine: true,
    maxResults,
  });
  return (res.data.items ?? [])
    .filter((p): p is youtube_v3.Schema$Playlist & { id: string } => Boolean(p.id))
    .map((p) => ({
      playlistId: p.id,
      title: p.snippet?.title ?? "(untitled)",
      description: p.snippet?.description ?? undefined,
      itemCount: p.contentDetails?.itemCount ?? undefined,
      privacyStatus: p.status?.privacyStatus ?? undefined,
      url: playlistUrl(p.id),
    }));
}

export async function getPlaylist(
  playlistId: string,
  userProfileId?: string,
): Promise<YoutubePlaylistBrief | null> {
  const youtube = await youtubeClient(true, userProfileId);
  const res = await youtube.playlists.list({
    part: ["snippet", "contentDetails", "status"],
    id: [playlistId],
    maxResults: 1,
  });
  const p = res.data.items?.[0];
  if (!p?.id) {
    return null;
  }
  return {
    playlistId: p.id,
    title: p.snippet?.title ?? "(untitled)",
    description: p.snippet?.description ?? undefined,
    itemCount: p.contentDetails?.itemCount ?? undefined,
    privacyStatus: p.status?.privacyStatus ?? undefined,
    url: playlistUrl(p.id),
  };
}

export async function createPlaylist(input: {
  title: string;
  description?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  userProfileId?: string;
}): Promise<YoutubePlaylistBrief> {
  const youtube = await youtubeClient(true, input.userProfileId);
  const title = input.title.trim();
  if (!title) {
    throw new Error("A playlist needs a title.");
  }
  const res = await youtube.playlists.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title,
        description: input.description?.trim() || undefined,
      },
      status: {
        privacyStatus: input.privacyStatus ?? "private",
      },
    },
  });
  const p = res.data;
  if (!p.id) {
    throw new Error("YouTube did not return a playlist id.");
  }
  return {
    playlistId: p.id,
    title: p.snippet?.title ?? title,
    description: p.snippet?.description ?? undefined,
    itemCount: 0,
    privacyStatus: p.status?.privacyStatus ?? input.privacyStatus ?? "private",
    url: playlistUrl(p.id),
  };
}

export async function loadPlaylistItems(input: {
  playlistId: string;
  maxResults?: number;
  userProfileId?: string;
}): Promise<YoutubePlaylistItemBrief[]> {
  const youtube = await youtubeClient(true, input.userProfileId);
  const maxResults = Math.min(Math.max(input.maxResults ?? 50, 1), 50);
  const res = await youtube.playlistItems.list({
    part: ["snippet", "contentDetails"],
    playlistId: input.playlistId,
    maxResults,
  });

  const items = res.data.items ?? [];
  const videoIds = items
    .map((i) => i.contentDetails?.videoId ?? i.snippet?.resourceId?.videoId)
    .filter((id): id is string => Boolean(id));
  const details = await getVideos(videoIds);
  const byId = new Map(details.map((v) => [v.videoId, v]));

  return items
    .map((item, index): YoutubePlaylistItemBrief | null => {
      const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      if (!videoId || !item.id) {
        return null;
      }
      const detail = byId.get(videoId);
      const kind = detail?.kind ?? inferKind({
        title: item.snippet?.title,
        channelTitle: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle,
      });
      return {
        playlistItemId: item.id,
        videoId,
        title: detail?.title ?? item.snippet?.title ?? "(no title)",
        channelTitle:
          detail?.channelTitle ??
          item.snippet?.videoOwnerChannelTitle ??
          item.snippet?.channelTitle ??
          "",
        position: item.snippet?.position ?? index,
        url: kind === "song" ? musicWatchUrl(videoId) : videoUrl(videoId),
        kind,
      };
    })
    .filter((i): i is YoutubePlaylistItemBrief => i !== null);
}

export async function addToPlaylist(input: {
  playlistId: string;
  videoId: string;
  userProfileId?: string;
}): Promise<YoutubePlaylistItemBrief> {
  const youtube = await youtubeClient(true, input.userProfileId);
  const videoId = input.videoId.trim();
  const playlistId = input.playlistId.trim();
  if (!videoId || !playlistId) {
    throw new Error("Adding to a playlist needs both playlist id and video id.");
  }

  const res = await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: "youtube#video",
          videoId,
        },
      },
    },
  });

  const video = await getVideo(videoId);
  const kind = video?.kind ?? "video";
  return {
    playlistItemId: res.data.id ?? "",
    videoId,
    title: video?.title ?? res.data.snippet?.title ?? videoId,
    channelTitle: video?.channelTitle ?? "",
    position: res.data.snippet?.position ?? 0,
    url: kind === "song" ? musicWatchUrl(videoId) : videoUrl(videoId),
    kind,
  };
}

export async function removeFromPlaylist(input: {
  playlistItemId: string;
  userProfileId?: string;
}): Promise<void> {
  const youtube = await youtubeClient(true, input.userProfileId);
  const id = input.playlistItemId.trim();
  if (!id) {
    throw new Error("Removing from a playlist needs the playlist item id.");
  }
  await youtube.playlistItems.delete({ id });
}

/** Like (rate=like) — YouTube's native bookmark for a video. */
export async function rateVideo(input: {
  videoId: string;
  rating: "like" | "dislike" | "none";
  userProfileId?: string;
}): Promise<void> {
  const youtube = await youtubeClient(true, input.userProfileId);
  await youtube.videos.rate({
    id: input.videoId.trim(),
    rating: input.rating,
  });
}

export async function listLikedVideos(input?: {
  maxResults?: number;
  userProfileId?: string;
}): Promise<YoutubeVideoBrief[]> {
  const items = await loadPlaylistItems({
    playlistId: "LL",
    maxResults: input?.maxResults ?? 20,
    userProfileId: input?.userProfileId,
  });
  return items.map((i) => ({
    videoId: i.videoId,
    title: i.title,
    channelTitle: i.channelTitle,
    url: i.url,
    kind: i.kind,
  }));
}
