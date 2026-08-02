/**
 * YouTube / YT Music as Magnus tools. Plain text for the model (same style as calendar).
 *
 * Ids (video, playlist, playlist-item, bookmark, cue) are for the model — the system prompt
 * says not to dump them on the user unless needed to disambiguate.
 */
import {
  youtubeApiKeyConfigured,
  youtubeConfigured,
  youtubeOauthConfiguredForUser,
} from "../../integrations/youtube/auth.js";
import {
  addToPlaylist,
  createPlaylist,
  getPlaylist,
  getVideo,
  listLikedVideos,
  listPlaylists,
  loadPlaylistItems,
  rateVideo,
  recommendVideos,
  removeFromPlaylist,
  searchVideos,
} from "../../integrations/youtube/operations.js";
import type { YoutubeItemKind, YoutubeVideoBrief } from "../../integrations/youtube/types.js";
import {
  clearCue,
  enqueueCue,
  getYoutubeState,
  listBookmarks,
  listCue,
  popCue,
  removeBookmark,
  removeCueItem,
  setMagnusPlaylistId,
  upsertBookmark,
} from "../../youtube/youtubeStore.js";

const NOT_CONFIGURED =
  "YouTube is not connected for this user. Ask me to connect Google (one link covers Calendar and YouTube), or set YOUTUBE_API_KEY on the host for search-only. See docs/YOUTUBE.md.";

const OAUTH_REQUIRED =
  "That needs YouTube account access. Ask me to connect Google (in-chat link for Calendar + YouTube), or run CLI auth + upsert (YOUTUBE_API_KEY alone can only search).";

async function youtubeDataReady(userProfileId?: string): Promise<boolean> {
  if (youtubeApiKeyConfigured()) {
    return true;
  }
  return youtubeOauthConfiguredForUser(userProfileId);
}

function formatItem(v: YoutubeVideoBrief, index?: number): string {
  const n = index === undefined ? "-" : `${index + 1}.`;
  const dur = v.duration ? ` · ${v.duration}` : "";
  const kind = v.kind === "song" ? "song" : "video";
  return `${n} ${v.title} — ${v.channelTitle}${dur} [${kind}] ${v.url} [video_id: ${v.videoId}]`;
}

function parseKind(raw: unknown): YoutubeItemKind | "all" | undefined {
  if (raw === "song" || raw === "video" || raw === "all") {
    return raw;
  }
  return undefined;
}

function extractVideoId(raw: string): string | null {
  const t = raw.trim();
  if (/^[\w-]{11}$/.test(t)) {
    return t;
  }
  try {
    const u = new URL(t);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace(/^\//, "").slice(0, 11);
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) {
      return v;
    }
    // /shorts/ID or /embed/ID
    const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function resolveVideo(input: {
  videoId?: string;
  url?: string;
  query?: string;
  kind?: YoutubeItemKind | "all";
  userProfileId?: string;
}): Promise<{ video?: YoutubeVideoBrief; error?: string }> {
  const fromId = input.videoId?.trim() || (input.url ? extractVideoId(input.url) : null);
  if (fromId) {
    const video = await getVideo(fromId, input.userProfileId);
    if (!video) {
      return { error: `No YouTube video found for id ${fromId}.` };
    }
    return { video };
  }
  if (input.query?.trim()) {
    const hits = await searchVideos({
      query: input.query.trim(),
      kind: input.kind ?? "all",
      maxResults: 1,
      userProfileId: input.userProfileId,
    });
    if (hits.length === 0) {
      return { error: `Nothing matched "${input.query.trim()}".` };
    }
    return { video: hits[0] };
  }
  return { error: "Need a video_id, url, or search query." };
}

async function ensureMagnusPlaylist(userProfileId: string): Promise<
  { ok: true; playlistId: string; title: string; created: boolean } | { ok: false; error: string }
> {
  const state = await getYoutubeState(userProfileId);
  if (!state.ok) {
    return { ok: false, error: state.error };
  }
  if (state.data?.magnus_playlist_id) {
    const existing = await getPlaylist(state.data.magnus_playlist_id, userProfileId);
    if (existing) {
      return {
        ok: true,
        playlistId: existing.playlistId,
        title: existing.title,
        created: false,
      };
    }
  }

  const title =
    process.env.YOUTUBE_MAGNUS_PLAYLIST_TITLE?.trim() ||
    state.data?.magnus_playlist_title ||
    "Magnus";
  const created = await createPlaylist({
    title,
    description: "Managed by Magnus — songs and videos queued from chat.",
    privacyStatus: "private",
    userProfileId,
  });
  const saved = await setMagnusPlaylistId({
    userProfileId,
    playlistId: created.playlistId,
    playlistTitle: created.title,
  });
  if (!saved.ok) {
    return { ok: false, error: saved.error };
  }
  return { ok: true, playlistId: created.playlistId, title: created.title, created: true };
}

export async function youtubeSearchTool(input: {
  query: string;
  kind?: string;
  maxResults?: number;
  userProfileId?: string;
}): Promise<string> {
  if (!(await youtubeDataReady(input.userProfileId))) {
    return NOT_CONFIGURED;
  }
  const query = input.query.trim();
  if (!query) {
    return "Give a search query.";
  }
  const kind = parseKind(input.kind) ?? "all";
  const items = await searchVideos({
    query,
    kind,
    maxResults: input.maxResults,
    userProfileId: input.userProfileId,
  });
  if (items.length === 0) {
    return `No results for "${query}".`;
  }
  return `Search results for "${query}":\n${items.map((v, i) => formatItem(v, i)).join("\n")}`;
}

export async function youtubeRecommendTool(input: {
  seedVideoId?: string;
  query?: string;
  kind?: string;
  maxResults?: number;
  userProfileId?: string;
}): Promise<string> {
  if (!(await youtubeDataReady(input.userProfileId))) {
    return NOT_CONFIGURED;
  }
  const kind = parseKind(input.kind) ?? "all";
  const { seed, items } = await recommendVideos({
    seedVideoId: input.seedVideoId,
    query: input.query,
    kind,
    maxResults: input.maxResults,
    userProfileId: input.userProfileId,
  });
  if (items.length === 0) {
    return "No recommendations came back — try a different seed or mood.";
  }
  const header = seed
    ? `Because you liked "${seed.title}":`
    : input.query?.trim()
      ? `Recommendations for "${input.query.trim()}":`
      : "Trending picks:";
  return `${header}\n${items.map((v, i) => formatItem(v, i)).join("\n")}`;
}

export async function youtubePlaylistTool(input: {
  action: string;
  userProfileId: string;
  playlistId?: string;
  title?: string;
  description?: string;
  videoId?: string;
  url?: string;
  query?: string;
  playlistItemId?: string;
  privacyStatus?: string;
  maxResults?: number;
}): Promise<string> {
  if (!youtubeConfigured()) {
    return NOT_CONFIGURED;
  }
  if (!(await youtubeOauthConfiguredForUser(input.userProfileId))) {
    return OAUTH_REQUIRED;
  }

  const action = input.action.trim().toLowerCase();
  const uid = input.userProfileId;

  switch (action) {
    case "list": {
      const playlists = await listPlaylists({ maxResults: input.maxResults, userProfileId: uid });
      if (playlists.length === 0) {
        return "No playlists on this YouTube account yet.";
      }
      return playlists
        .map((p, i) => {
          const count = p.itemCount === undefined ? "" : ` · ${p.itemCount} items`;
          return `${i + 1}. ${p.title}${count} [${p.privacyStatus ?? "?"}] ${p.url} [playlist_id: ${p.playlistId}]`;
        })
        .join("\n");
    }
    case "ensure_magnus":
    case "ensure": {
      const ensured = await ensureMagnusPlaylist(input.userProfileId);
      if (!ensured.ok) {
        return `Could not ensure Magnus playlist: ${ensured.error}`;
      }
      return ensured.created
        ? `Created private playlist "${ensured.title}" [playlist_id: ${ensured.playlistId}].`
        : `Magnus playlist ready: "${ensured.title}" [playlist_id: ${ensured.playlistId}].`;
    }
    case "load":
    case "get": {
      let playlistId = input.playlistId?.trim();
      if (!playlistId || playlistId === "magnus") {
        const ensured = await ensureMagnusPlaylist(input.userProfileId);
        if (!ensured.ok) {
          return `Could not resolve Magnus playlist: ${ensured.error}`;
        }
        playlistId = ensured.playlistId;
      }
      const meta = await getPlaylist(playlistId, uid);
      const items = await loadPlaylistItems({
        playlistId,
        maxResults: input.maxResults,
        userProfileId: uid,
      });
      const title = meta?.title ?? playlistId;
      if (items.length === 0) {
        return `Playlist "${title}" is empty. [playlist_id: ${playlistId}]`;
      }
      return `Playlist "${title}" (${items.length} shown) [playlist_id: ${playlistId}]:\n${items
        .map(
          (it, i) =>
            `${i + 1}. ${it.title} — ${it.channelTitle} [${it.kind}] ${it.url} [video_id: ${it.videoId}] [playlist_item_id: ${it.playlistItemId}]`,
        )
        .join("\n")}`;
    }
    case "create": {
      const title = input.title?.trim();
      if (!title) {
        return "Creating a playlist needs a title.";
      }
      const privacy =
        input.privacyStatus === "public" || input.privacyStatus === "unlisted"
          ? input.privacyStatus
          : "private";
      const created = await createPlaylist({
        title,
        description: input.description,
        privacyStatus: privacy,
        userProfileId: uid,
      });
      return `Created playlist "${created.title}" (${created.privacyStatus}) ${created.url} [playlist_id: ${created.playlistId}].`;
    }
    case "add": {
      let playlistId = input.playlistId?.trim();
      if (!playlistId || playlistId === "magnus") {
        const ensured = await ensureMagnusPlaylist(input.userProfileId);
        if (!ensured.ok) {
          return `Could not resolve playlist: ${ensured.error}`;
        }
        playlistId = ensured.playlistId;
      }
      const resolved = await resolveVideo({
        videoId: input.videoId,
        url: input.url,
        query: input.query,
        userProfileId: uid,
      });
      if (resolved.error || !resolved.video) {
        return resolved.error ?? "Could not resolve video.";
      }
      const added = await addToPlaylist({
        playlistId,
        videoId: resolved.video.videoId,
        userProfileId: uid,
      });
      return `Added "${added.title}" to playlist [playlist_id: ${playlistId}] [video_id: ${added.videoId}].`;
    }
    case "remove": {
      if (!input.playlistItemId?.trim()) {
        return "Removing needs playlist_item_id from a prior load.";
      }
      await removeFromPlaylist({
        playlistItemId: input.playlistItemId.trim(),
        userProfileId: uid,
      });
      return "Removed that item from the playlist.";
    }
    default:
      return `Unknown playlist action "${input.action}". Use list, load, create, add, remove, or ensure_magnus.`;
  }
}

export async function youtubeBookmarkTool(input: {
  action: string;
  userProfileId: string;
  videoId?: string;
  url?: string;
  query?: string;
  kind?: string;
  note?: string;
  bookmarkId?: string;
  alsoLike?: boolean;
  maxResults?: number;
}): Promise<string> {
  if (!youtubeConfigured()) {
    return NOT_CONFIGURED;
  }

  const action = input.action.trim().toLowerCase();

  if (action === "list") {
    const kind = parseKind(input.kind);
    const result = await listBookmarks({
      userProfileId: input.userProfileId,
      kind: kind === "all" ? undefined : kind,
      limit: input.maxResults,
    });
    if (!result.ok) {
      return `Could not list bookmarks: ${result.error}`;
    }
    if (result.data.length === 0) {
      return "No Magnus bookmarks yet.";
    }
    return result.data
      .map((b, i) => {
        const note = b.note ? ` — ${b.note}` : "";
        return `${i + 1}. ${b.title} — ${b.channel_title ?? "?"}${note} [${b.kind}] ${b.url} [video_id: ${b.video_id}] [bookmark_id: ${b.id}]`;
      })
      .join("\n");
  }

  if (action === "remove" || action === "delete") {
    const result = await removeBookmark({
      userProfileId: input.userProfileId,
      videoId: input.videoId,
      bookmarkId: input.bookmarkId,
    });
    if (!result.ok) {
      return result.error;
    }
    if (result.data.removed === 0) {
      return "Nothing matched — that bookmark was not on the list.";
    }
    return `Removed ${result.data.removed} bookmark(s).`;
  }

  if (action === "add" || action === "save") {
    const resolved = await resolveVideo({
      videoId: input.videoId,
      url: input.url,
      query: input.query,
      kind: parseKind(input.kind) ?? "all",
      userProfileId: input.userProfileId,
    });
    if (resolved.error || !resolved.video) {
      return resolved.error ?? "Could not resolve video.";
    }
    const v = resolved.video;
    const saved = await upsertBookmark({
      userProfileId: input.userProfileId,
      videoId: v.videoId,
      title: v.title,
      channelTitle: v.channelTitle,
      kind: v.kind,
      url: v.url,
      thumbnailUrl: v.thumbnailUrl,
      note: input.note,
    });
    if (!saved.ok) {
      return `Could not bookmark: ${saved.error}`;
    }

    let likeNote = "";
    if (input.alsoLike !== false && (await youtubeOauthConfiguredForUser(input.userProfileId))) {
      try {
        await rateVideo({
          videoId: v.videoId,
          rating: "like",
          userProfileId: input.userProfileId,
        });
        likeNote = " Also liked on YouTube.";
      } catch {
        likeNote = " (Could not like on YouTube — bookmark saved in Magnus anyway.)";
      }
    }

    return `Bookmarked "${v.title}" [${v.kind}] ${v.url}.${likeNote}`;
  }

  if (action === "liked") {
    if (!(await youtubeOauthConfiguredForUser(input.userProfileId))) {
      return OAUTH_REQUIRED;
    }
    const liked = await listLikedVideos({
      maxResults: input.maxResults ?? 15,
      userProfileId: input.userProfileId,
    });
    if (liked.length === 0) {
      return "No liked videos on this YouTube account (or the LL playlist is empty).";
    }
    return `Liked on YouTube:\n${liked.map((v, i) => formatItem(v, i)).join("\n")}`;
  }

  return `Unknown bookmark action "${input.action}". Use add, list, remove, or liked.`;
}

export async function youtubeCueTool(input: {
  action: string;
  userProfileId: string;
  videoId?: string;
  url?: string;
  query?: string;
  kind?: string;
  note?: string;
  cueId?: string;
  maxResults?: number;
}): Promise<string> {
  if (!youtubeConfigured()) {
    return NOT_CONFIGURED;
  }

  const action = input.action.trim().toLowerCase();

  if (action === "list") {
    const result = await listCue({
      userProfileId: input.userProfileId,
      limit: input.maxResults,
    });
    if (!result.ok) {
      return `Could not list cue: ${result.error}`;
    }
    if (result.data.length === 0) {
      return "Cue is empty.";
    }
    return result.data
      .map((c, i) => {
        const note = c.note ? ` — ${c.note}` : "";
        return `${i + 1}. ${c.title} — ${c.channel_title ?? "?"}${note} [${c.kind}] ${c.url} [video_id: ${c.video_id}] [cue_id: ${c.id}]`;
      })
      .join("\n");
  }

  if (action === "add" || action === "enqueue") {
    const resolved = await resolveVideo({
      videoId: input.videoId,
      url: input.url,
      query: input.query,
      kind: parseKind(input.kind) ?? "all",
      userProfileId: input.userProfileId,
    });
    if (resolved.error || !resolved.video) {
      return resolved.error ?? "Could not resolve video.";
    }
    const v = resolved.video;
    const queued = await enqueueCue({
      userProfileId: input.userProfileId,
      videoId: v.videoId,
      title: v.title,
      channelTitle: v.channelTitle,
      kind: v.kind,
      url: v.url,
      thumbnailUrl: v.thumbnailUrl,
      note: input.note,
    });
    if (!queued.ok) {
      return `Could not cue: ${queued.error}`;
    }
    return `Queued #${queued.data.position}: "${v.title}" [${v.kind}] ${v.url}`;
  }

  if (action === "next" || action === "pop" || action === "play") {
    const result = await popCue({
      userProfileId: input.userProfileId,
      as: "played",
    });
    if (!result.ok) {
      return `Could not pop cue: ${result.error}`;
    }
    if (!result.data) {
      return "Cue is empty — nothing up next.";
    }
    const c = result.data;
    return `Up next: "${c.title}" — ${c.channel_title ?? "?"} [${c.kind}] ${c.url}`;
  }

  if (action === "skip") {
    const result = await popCue({
      userProfileId: input.userProfileId,
      as: "skipped",
    });
    if (!result.ok) {
      return `Could not skip: ${result.error}`;
    }
    if (!result.data) {
      return "Cue is empty.";
    }
    return `Skipped "${result.data.title}".`;
  }

  if (action === "remove") {
    const result = await removeCueItem({
      userProfileId: input.userProfileId,
      cueId: input.cueId,
      videoId: input.videoId,
    });
    if (!result.ok) {
      return result.error;
    }
    if (result.data.removed === 0) {
      return "Nothing matched in the cue.";
    }
    return `Removed ${result.data.removed} from the cue.`;
  }

  if (action === "clear") {
    const result = await clearCue({ userProfileId: input.userProfileId });
    if (!result.ok) {
      return `Could not clear cue: ${result.error}`;
    }
    return result.data.removed === 0
      ? "Cue was already empty."
      : `Cleared ${result.data.removed} item(s) from the cue.`;
  }

  return `Unknown cue action "${input.action}". Use add, list, next, skip, remove, or clear.`;
}

/** Exported for tests. */
export const _youtubeToolInternals = {
  extractVideoId,
  formatItem,
  parseKind,
  youtubeApiKeyConfigured,
};
