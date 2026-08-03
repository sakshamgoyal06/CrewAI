/**
 * Resolve playlist references: PL ids, pillar aliases (wisdom, wealth, magnus, …), or title match.
 */
import {
  getPlaylist,
  listPlaylists,
} from "../integrations/youtube/operations.js";
import {
  getYoutubeState,
  setMagnusPlaylistId,
  setPlaylistAlias,
  type YoutubeStateRow,
} from "./youtubeStore.js";

export const PILLAR_PLAYLIST_ALIASES = [
  "magnus",
  "wisdom",
  "wealth",
  "happiness",
  "joy",
  "health",
] as const;

export type PillarPlaylistAlias = (typeof PILLAR_PLAYLIST_ALIASES)[number];

const PLAYLIST_ID_RE = /^PL[\w-]+$/i;

export type ResolvedPlaylist = {
  playlistId: string;
  title: string;
  alias?: string;
  fromCache: boolean;
};

function normalizeAlias(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) {
    return null;
  }
  if (t === "joy") {
    return "happiness";
  }
  return PILLAR_PLAYLIST_ALIASES.includes(t as PillarPlaylistAlias) ? t : null;
}

function aliasFromCachedState(
  state: YoutubeStateRow | null,
  alias: string,
): ResolvedPlaylist | null {
  const entry = state?.playlist_aliases?.[alias];
  if (!entry?.playlist_id) {
    return null;
  }
  return {
    playlistId: entry.playlist_id,
    title: entry.title ?? alias,
    alias,
    fromCache: true,
  };
}

async function findPlaylistByTitle(
  userProfileId: string,
  alias: string,
): Promise<{ playlistId: string; title: string } | null> {
  const playlists = await listPlaylists({ maxResults: 50, userProfileId });
  const wanted = alias.toLowerCase();
  const exact = playlists.find((p) => p.title.trim().toLowerCase() === wanted);
  if (exact) {
    return { playlistId: exact.playlistId, title: exact.title };
  }
  const contains = playlists.find((p) => p.title.trim().toLowerCase().includes(wanted));
  if (contains) {
    return { playlistId: contains.playlistId, title: contains.title };
  }
  return null;
}

async function ensureMagnusPlaylistRef(
  userProfileId: string,
): Promise<ResolvedPlaylist | { error: string }> {
  const state = await getYoutubeState(userProfileId);
  if (!state.ok) {
    return { error: state.error };
  }
  if (state.data?.magnus_playlist_id) {
    const existing = await getPlaylist(state.data.magnus_playlist_id, userProfileId);
    if (existing) {
      return {
        playlistId: existing.playlistId,
        title: existing.title,
        alias: "magnus",
        fromCache: true,
      };
    }
  }

  const title =
    process.env.YOUTUBE_MAGNUS_PLAYLIST_TITLE?.trim() ||
    state.data?.magnus_playlist_title ||
    "Magnus";
  const { createPlaylist } = await import("../integrations/youtube/operations.js");
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
    return { error: saved.error };
  }
  await setPlaylistAlias({
    userProfileId,
    alias: "magnus",
    playlistId: created.playlistId,
    title: created.title,
  });
  return {
    playlistId: created.playlistId,
    title: created.title,
    alias: "magnus",
    fromCache: false,
  };
}

/**
 * Resolve a playlist reference for tools. Accepts PL ids, pillar aliases, or title-like strings.
 */
export async function resolvePlaylistRef(
  userProfileId: string,
  ref: string | undefined,
): Promise<ResolvedPlaylist | { error: string }> {
  const raw = ref?.trim();
  if (!raw || raw.toLowerCase() === "magnus") {
    const magnus = await ensureMagnusPlaylistRef(userProfileId);
    if ("error" in magnus) {
      return magnus;
    }
    return magnus;
  }

  if (PLAYLIST_ID_RE.test(raw)) {
    const meta = await getPlaylist(raw, userProfileId);
    return {
      playlistId: raw,
      title: meta?.title ?? raw,
      fromCache: false,
    };
  }

  const alias = normalizeAlias(raw);
  if (!alias) {
    return { error: `Unknown playlist "${raw}". Use a pillar name (wisdom, wealth, magnus) or a playlist id (PL…).` };
  }

  if (alias === "magnus") {
    return ensureMagnusPlaylistRef(userProfileId);
  }

  const state = await getYoutubeState(userProfileId);
  if (!state.ok) {
    return { error: state.error };
  }

  const cached = aliasFromCachedState(state.data, alias);
  if (cached) {
    const meta = await getPlaylist(cached.playlistId, userProfileId);
    if (meta) {
      return { ...cached, title: meta.title, fromCache: true };
    }
  }

  const found = await findPlaylistByTitle(userProfileId, alias);
  if (!found) {
    return {
      error: `No YouTube playlist titled "${alias}" found. Create one or pass the playlist id (PL…).`,
    };
  }

  await setPlaylistAlias({
    userProfileId,
    alias,
    playlistId: found.playlistId,
    title: found.title,
  });

  return {
    playlistId: found.playlistId,
    title: found.title,
    alias,
    fromCache: false,
  };
}
