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

export type PlaylistCandidate = {
  playlistId: string;
  title: string;
  itemCount?: number;
  score: number;
};

export type PlaylistResolveResult =
  | { ok: true; playlist: ResolvedPlaylist }
  | {
      ok: false;
      error: string;
      /** Close title matches when the requested name was not exact. */
      suggestions?: PlaylistCandidate[];
      /** True when no name was given — show the user's playlists to pick from. */
      listAll?: boolean;
      requestedName?: string;
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

function normalizeTitleText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Score how well a playlist title matches a free-text query (0–100). */
export function scorePlaylistTitle(query: string, title: string): number {
  const q = normalizeTitleText(query);
  const t = normalizeTitleText(title);
  if (!q || !t) {
    return 0;
  }
  if (t === q) {
    return 100;
  }
  if (t.includes(q) || q.includes(t)) {
    return 85;
  }
  const qWords = q.split(" ").filter((w) => w.length > 2);
  const tWords = new Set(t.split(" ").filter((w) => w.length > 2));
  if (!qWords.length) {
    return 0;
  }
  let overlap = 0;
  for (const w of qWords) {
    if (tWords.has(w)) {
      overlap += 1;
    }
  }
  return Math.round((overlap / qWords.length) * 75);
}

const STRONG_MATCH_THRESHOLD = 78;

export function formatPlaylistDisambiguation(input: {
  requestedName?: string;
  suggestions: PlaylistCandidate[];
  listAll?: boolean;
  actionHint?: string;
}): string {
  const action = input.actionHint ?? "use";
  const lines: string[] = [];

  if (input.requestedName?.trim()) {
    lines.push(
      `I couldn't find an exact playlist named "${input.requestedName.trim()}".`,
    );
    if (input.suggestions.length > 0) {
      lines.push(`Did you mean one of these? Reply with the number or exact name to ${action}:`);
    } else {
      lines.push(`Here are your YouTube playlists — reply with a number or name to ${action}, or ask me to create a new one:`);
    }
  } else if (input.listAll) {
    lines.push(
      `Which playlist should I ${action}? Here are your YouTube playlists — reply with the number or name, or ask me to create a new one:`,
    );
  } else {
    lines.push(`Pick a playlist (reply with the number or name) to ${action}:`);
  }

  for (let i = 0; i < input.suggestions.length; i += 1) {
    const s = input.suggestions[i]!;
    const count =
      s.itemCount === undefined ? "" : ` · ${s.itemCount} item${s.itemCount === 1 ? "" : "s"}`;
    lines.push(`${i + 1}. ${s.title}${count} [playlist_id: ${s.playlistId}]`);
  }

  return lines.join("\n");
}

export async function rankPlaylistsByTitle(
  userProfileId: string,
  query: string,
  maxResults = 5,
): Promise<PlaylistCandidate[]> {
  const playlists = await listPlaylists({ maxResults: 50, userProfileId });
  const scored = playlists
    .map((p) => ({
      playlistId: p.playlistId,
      title: p.title,
      itemCount: p.itemCount,
      score: scorePlaylistTitle(query, p.title),
    }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  return scored.slice(0, maxResults);
}

export async function listAllPlaylistCandidates(
  userProfileId: string,
  maxResults = 8,
): Promise<PlaylistCandidate[]> {
  const playlists = await listPlaylists({ maxResults, userProfileId });
  return playlists.map((p) => ({
    playlistId: p.playlistId,
    title: p.title,
    itemCount: p.itemCount,
    score: 0,
  }));
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
  const ranked = await rankPlaylistsByTitle(userProfileId, alias, 1);
  if (ranked.length > 0 && ranked[0]!.score >= STRONG_MATCH_THRESHOLD) {
    return { playlistId: ranked[0]!.playlistId, title: ranked[0]!.title };
  }
  return null;
}

async function ensureMagnusPlaylistRef(
  userProfileId: string,
): Promise<PlaylistResolveResult> {
  const state = await getYoutubeState(userProfileId);
  if (!state.ok) {
    return { ok: false, error: state.error };
  }
  if (state.data?.magnus_playlist_id) {
    const existing = await getPlaylist(state.data.magnus_playlist_id, userProfileId);
    if (existing) {
      return {
        ok: true,
        playlist: {
          playlistId: existing.playlistId,
          title: existing.title,
          alias: "magnus",
          fromCache: true,
        },
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
    return { ok: false, error: saved.error };
  }
  await setPlaylistAlias({
    userProfileId,
    alias: "magnus",
    playlistId: created.playlistId,
    title: created.title,
  });
  return {
    ok: true,
    playlist: {
      playlistId: created.playlistId,
      title: created.title,
      alias: "magnus",
      fromCache: false,
    },
  };
}

async function resolveFreeTextTitle(
  userProfileId: string,
  raw: string,
): Promise<PlaylistResolveResult> {
  const ranked = await rankPlaylistsByTitle(userProfileId, raw, 5);
  if (ranked.length === 1 && ranked[0]!.score >= STRONG_MATCH_THRESHOLD) {
    const top = ranked[0]!;
    return {
      ok: true,
      playlist: {
        playlistId: top.playlistId,
        title: top.title,
        fromCache: false,
      },
    };
  }
  if (ranked.length > 0 && ranked[0]!.score >= STRONG_MATCH_THRESHOLD) {
    const top = ranked[0]!;
    const second = ranked[1];
    if (!second || top.score - second.score >= 12) {
      return {
        ok: true,
        playlist: {
          playlistId: top.playlistId,
          title: top.title,
          fromCache: false,
        },
      };
    }
  }

  const suggestions =
    ranked.length > 0 ? ranked : await listAllPlaylistCandidates(userProfileId, 8);

  return {
    ok: false,
    error: `No exact playlist match for "${raw}".`,
    suggestions,
    listAll: ranked.length === 0,
    requestedName: raw,
  };
}

/**
 * Resolve a playlist reference for tools. Accepts PL ids, pillar aliases, or title-like strings.
 */
export async function resolvePlaylistRef(
  userProfileId: string,
  ref: string | undefined,
  options?: { requireExplicit?: boolean },
): Promise<PlaylistResolveResult> {
  const raw = ref?.trim();

  if (!raw) {
    if (options?.requireExplicit) {
      const suggestions = await listAllPlaylistCandidates(userProfileId, 8);
      return {
        ok: false,
        error: "No playlist specified.",
        suggestions,
        listAll: true,
      };
    }
    const magnus = await ensureMagnusPlaylistRef(userProfileId);
    return magnus;
  }

  if (raw.toLowerCase() === "magnus") {
    return ensureMagnusPlaylistRef(userProfileId);
  }

  if (PLAYLIST_ID_RE.test(raw)) {
    const meta = await getPlaylist(raw, userProfileId);
    return {
      ok: true,
      playlist: {
        playlistId: raw,
        title: meta?.title ?? raw,
        fromCache: false,
      },
    };
  }

  const alias = normalizeAlias(raw);
  if (alias) {
    if (alias === "magnus") {
      return ensureMagnusPlaylistRef(userProfileId);
    }

    const state = await getYoutubeState(userProfileId);
    if (!state.ok) {
      return { ok: false, error: state.error };
    }

    const cached = aliasFromCachedState(state.data, alias);
    if (cached) {
      const meta = await getPlaylist(cached.playlistId, userProfileId);
      if (meta) {
        return {
          ok: true,
          playlist: { ...cached, title: meta.title, fromCache: true },
        };
      }
    }

    const found = await findPlaylistByTitle(userProfileId, alias);
    if (!found) {
      const suggestions = await rankPlaylistsByTitle(userProfileId, alias, 5);
      const fallback =
        suggestions.length > 0 ? suggestions : await listAllPlaylistCandidates(userProfileId, 8);
      return {
        ok: false,
        error: `No YouTube playlist titled "${alias}" found.`,
        suggestions: fallback,
        listAll: suggestions.length === 0,
        requestedName: alias,
      };
    }

    await setPlaylistAlias({
      userProfileId,
      alias,
      playlistId: found.playlistId,
      title: found.title,
    });

    return {
      ok: true,
      playlist: {
        playlistId: found.playlistId,
        title: found.title,
        alias,
        fromCache: false,
      },
    };
  }

  return resolveFreeTextTitle(userProfileId, raw);
}
