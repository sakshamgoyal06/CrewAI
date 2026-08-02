export type YoutubeItemKind = "video" | "song";

export type YoutubeVideoBrief = {
  videoId: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  description?: string;
  publishedAt?: string;
  duration?: string;
  viewCount?: string;
  likeCount?: string;
  thumbnailUrl?: string;
  url: string;
  kind: YoutubeItemKind;
};

export type YoutubePlaylistBrief = {
  playlistId: string;
  title: string;
  description?: string;
  itemCount?: number;
  privacyStatus?: string;
  url: string;
};

export type YoutubePlaylistItemBrief = {
  playlistItemId: string;
  videoId: string;
  title: string;
  channelTitle: string;
  position: number;
  url: string;
  kind: YoutubeItemKind;
};

export function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function playlistUrl(playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${playlistId}`;
}

export function musicWatchUrl(videoId: string): string {
  return `https://music.youtube.com/watch?v=${videoId}`;
}

/** Heuristic: treat Music-category or "Official Audio"/Topic channel as a song. */
export function inferKind(input: {
  categoryId?: string | null;
  title?: string | null;
  channelTitle?: string | null;
}): YoutubeItemKind {
  if (input.categoryId === "10") {
    return "song";
  }
  const title = (input.title ?? "").toLowerCase();
  const channel = (input.channelTitle ?? "").toLowerCase();
  if (
    channel.includes("topic") ||
    title.includes("official audio") ||
    title.includes("lyric video") ||
    title.includes("lyrics")
  ) {
    return "song";
  }
  return "video";
}

/** ISO 8601 duration (PT4M13S) → "4:13". */
export function formatDuration(iso?: string | null): string | undefined {
  if (!iso) {
    return undefined;
  }
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) {
    return iso;
  }
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  if (h > 0) {
    return `${h}:${String(min).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${min}:${String(s).padStart(2, "0")}`;
}
