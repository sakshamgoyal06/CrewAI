/**
 * Supabase access for Magnus YouTube bookmarks, cue queue, and per-user playlist state.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import { supabase as defaultClient } from "../tools/clients.js";
import type { YoutubeItemKind } from "../integrations/youtube/types.js";

export type StoreResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type YoutubeStoreDeps = { client?: SupabaseClient };

export type BookmarkRow = {
  id: string;
  user_profile_id: string;
  video_id: string;
  title: string;
  channel_title: string | null;
  kind: YoutubeItemKind;
  url: string;
  thumbnail_url: string | null;
  note: string | null;
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CueRow = {
  id: string;
  user_profile_id: string;
  video_id: string;
  title: string;
  channel_title: string | null;
  kind: YoutubeItemKind;
  url: string;
  thumbnail_url: string | null;
  position: number;
  note: string | null;
  status: "queued" | "played" | "skipped";
  source: string;
  metadata: Record<string, unknown>;
  created_at: string;
  played_at: string | null;
};

export type YoutubeStateRow = {
  user_profile_id: string;
  magnus_playlist_id: string | null;
  magnus_playlist_title: string;
  updated_at: string;
};

const BOOKMARKS = "magnus_youtube_bookmarks";
const CUES = "magnus_youtube_cues";
const STATE = "magnus_youtube_state";

function client(deps?: YoutubeStoreDeps): SupabaseClient {
  return deps?.client ?? defaultClient;
}

function fail(context: string, error: unknown): { ok: false; error: string } {
  const message =
    (error as { message?: string } | null)?.message ??
    (error instanceof Error ? error.message : String(error));
  logger.warn({ err: loggableError(error), context }, "youtube store query failed");
  return { ok: false, error: message };
}

export type UpsertBookmarkInput = {
  userProfileId: string;
  videoId: string;
  title: string;
  channelTitle?: string | null;
  kind?: YoutubeItemKind;
  url: string;
  thumbnailUrl?: string | null;
  note?: string | null;
  source?: string;
  metadata?: Record<string, unknown> | null;
};

export async function upsertBookmark(
  input: UpsertBookmarkInput,
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<BookmarkRow>> {
  const row = {
    user_profile_id: input.userProfileId,
    video_id: input.videoId,
    title: input.title,
    channel_title: input.channelTitle ?? null,
    kind: input.kind ?? "video",
    url: input.url,
    thumbnail_url: input.thumbnailUrl ?? null,
    note: input.note ?? null,
    source: input.source ?? "telegram",
    metadata: input.metadata ?? {},
  };

  const { data, error } = await client(deps)
    .from(BOOKMARKS)
    .upsert(row, { onConflict: "user_profile_id,video_id" })
    .select("*")
    .single();

  if (error || !data) {
    return fail("upsertBookmark", error ?? new Error("no row returned"));
  }
  return { ok: true, data: data as BookmarkRow };
}

export async function listBookmarks(
  input: { userProfileId: string; kind?: YoutubeItemKind; limit?: number },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<BookmarkRow[]>> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  let q = client(deps)
    .from(BOOKMARKS)
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (input.kind) {
    q = q.eq("kind", input.kind);
  }
  const { data, error } = await q;
  if (error) {
    return fail("listBookmarks", error);
  }
  return { ok: true, data: (data ?? []) as BookmarkRow[] };
}

export async function removeBookmark(
  input: { userProfileId: string; videoId?: string; bookmarkId?: string },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<{ removed: number }>> {
  let q = client(deps).from(BOOKMARKS).delete().eq("user_profile_id", input.userProfileId);
  if (input.bookmarkId?.trim()) {
    q = q.eq("id", input.bookmarkId.trim());
  } else if (input.videoId?.trim()) {
    q = q.eq("video_id", input.videoId.trim());
  } else {
    return { ok: false, error: "Need a video id or bookmark id to remove." };
  }
  const { data, error } = await q.select("id");
  if (error) {
    return fail("removeBookmark", error);
  }
  return { ok: true, data: { removed: data?.length ?? 0 } };
}

export type EnqueueCueInput = {
  userProfileId: string;
  videoId: string;
  title: string;
  channelTitle?: string | null;
  kind?: YoutubeItemKind;
  url: string;
  thumbnailUrl?: string | null;
  note?: string | null;
  source?: string;
  metadata?: Record<string, unknown> | null;
};

export async function enqueueCue(
  input: EnqueueCueInput,
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<CueRow>> {
  const c = client(deps);

  const existing = await c
    .from(CUES)
    .select("id, position")
    .eq("user_profile_id", input.userProfileId)
    .eq("video_id", input.videoId)
    .eq("status", "queued")
    .maybeSingle();

  if (existing.error) {
    return fail("enqueueCue.dedupe", existing.error);
  }
  if (existing.data) {
    const full = await c.from(CUES).select("*").eq("id", existing.data.id).single();
    if (full.error || !full.data) {
      return fail("enqueueCue.dedupeFetch", full.error ?? new Error("missing cue"));
    }
    return { ok: true, data: full.data as CueRow };
  }

  const maxPos = await c
    .from(CUES)
    .select("position")
    .eq("user_profile_id", input.userProfileId)
    .eq("status", "queued")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxPos.error) {
    return fail("enqueueCue.maxPos", maxPos.error);
  }

  const position = (maxPos.data?.position ?? 0) + 1;
  const { data, error } = await c
    .from(CUES)
    .insert({
      user_profile_id: input.userProfileId,
      video_id: input.videoId,
      title: input.title,
      channel_title: input.channelTitle ?? null,
      kind: input.kind ?? "video",
      url: input.url,
      thumbnail_url: input.thumbnailUrl ?? null,
      position,
      note: input.note ?? null,
      status: "queued",
      source: input.source ?? "telegram",
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    return fail("enqueueCue.insert", error ?? new Error("no row"));
  }
  return { ok: true, data: data as CueRow };
}

export async function listCue(
  input: { userProfileId: string; includeDone?: boolean; limit?: number },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<CueRow[]>> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  let q = client(deps)
    .from(CUES)
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .order("position", { ascending: true })
    .limit(limit);
  if (!input.includeDone) {
    q = q.eq("status", "queued");
  }
  const { data, error } = await q;
  if (error) {
    return fail("listCue", error);
  }
  return { ok: true, data: (data ?? []) as CueRow[] };
}

export async function popCue(
  input: { userProfileId: string; as?: "played" | "skipped" },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<CueRow | null>> {
  const c = client(deps);
  const next = await c
    .from(CUES)
    .select("*")
    .eq("user_profile_id", input.userProfileId)
    .eq("status", "queued")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (next.error) {
    return fail("popCue.read", next.error);
  }
  if (!next.data) {
    return { ok: true, data: null };
  }

  const status = input.as ?? "played";
  const { data, error } = await c
    .from(CUES)
    .update({
      status,
      played_at: new Date().toISOString(),
    })
    .eq("id", next.data.id)
    .select("*")
    .single();

  if (error || !data) {
    return fail("popCue.update", error ?? new Error("no row"));
  }
  return { ok: true, data: data as CueRow };
}

export async function removeCueItem(
  input: { userProfileId: string; cueId?: string; videoId?: string },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<{ removed: number }>> {
  let q = client(deps)
    .from(CUES)
    .delete()
    .eq("user_profile_id", input.userProfileId)
    .eq("status", "queued");
  if (input.cueId?.trim()) {
    q = q.eq("id", input.cueId.trim());
  } else if (input.videoId?.trim()) {
    q = q.eq("video_id", input.videoId.trim());
  } else {
    return { ok: false, error: "Need a cue id or video id to remove." };
  }
  const { data, error } = await q.select("id");
  if (error) {
    return fail("removeCueItem", error);
  }
  return { ok: true, data: { removed: data?.length ?? 0 } };
}

export async function clearCue(
  input: { userProfileId: string },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<{ removed: number }>> {
  const { data, error } = await client(deps)
    .from(CUES)
    .delete()
    .eq("user_profile_id", input.userProfileId)
    .eq("status", "queued")
    .select("id");
  if (error) {
    return fail("clearCue", error);
  }
  return { ok: true, data: { removed: data?.length ?? 0 } };
}

export async function getYoutubeState(
  userProfileId: string,
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<YoutubeStateRow | null>> {
  const { data, error } = await client(deps)
    .from(STATE)
    .select("*")
    .eq("user_profile_id", userProfileId)
    .maybeSingle();
  if (error) {
    return fail("getYoutubeState", error);
  }
  return { ok: true, data: (data as YoutubeStateRow | null) ?? null };
}

export async function setMagnusPlaylistId(
  input: {
    userProfileId: string;
    playlistId: string;
    playlistTitle?: string;
  },
  deps?: YoutubeStoreDeps,
): Promise<StoreResult<YoutubeStateRow>> {
  const { data, error } = await client(deps)
    .from(STATE)
    .upsert(
      {
        user_profile_id: input.userProfileId,
        magnus_playlist_id: input.playlistId,
        magnus_playlist_title: input.playlistTitle ?? "Magnus",
      },
      { onConflict: "user_profile_id" },
    )
    .select("*")
    .single();
  if (error || !data) {
    return fail("setMagnusPlaylistId", error ?? new Error("no row"));
  }
  return { ok: true, data: data as YoutubeStateRow };
}
