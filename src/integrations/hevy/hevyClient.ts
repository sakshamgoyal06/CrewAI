import { hevyFetchTimeoutMs } from "./hevyEnv.js";
import type {
  HevyExerciseTemplateBrief,
  HevyExerciseTemplatesPage,
  HevyPostRoutineBody,
  HevyPostWorkoutBody,
  HevyRoutine,
  HevyRoutinesPage,
  HevyWorkout,
  HevyWorkoutsPage,
} from "./types.js";

const DEFAULT_BASE = "https://api.hevyapp.com";

/** Hevy sometimes returns the created entity at the top level; sometimes under `routine` / `workout`. */
function pickHevyRoutineFromCreateResponse(data: unknown): HevyRoutine | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (typeof o.id === "string") {
    return o as HevyRoutine;
  }
  const inner = o.routine;
  if (inner && typeof inner === "object" && typeof (inner as Record<string, unknown>).id === "string") {
    return inner as HevyRoutine;
  }
  return null;
}

function pickHevyWorkoutFromCreateResponse(data: unknown): HevyWorkout | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const o = data as Record<string, unknown>;
  if (typeof o.id === "string") {
    return o as HevyWorkout;
  }
  const inner = o.workout;
  if (inner && typeof inner === "object" && typeof (inner as Record<string, unknown>).id === "string") {
    return inner as HevyWorkout;
  }
  return null;
}

export function hevyApiBaseUrl(): string {
  const u = process.env.MAGNUS_HEVY_API_BASE_URL?.trim();
  return u || DEFAULT_BASE;
}

async function hevyGetJson<T>(
  path: string,
  apiKey: string,
  searchParams: Record<string, string>,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: true; data: T } | { ok: false; error: string; status?: number }> {
  const base = hevyApiBaseUrl().replace(/\/$/, "");
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(searchParams)) {
    url.searchParams.set(k, v);
  }
  const timeoutMs = options.timeoutMs ?? hevyFetchTimeoutMs();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(url.toString(), {
      method: "GET",
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "api-key": apiKey,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: text.slice(0, 500) || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, error: "Invalid JSON from Hevy API", status: res.status };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

async function hevyWriteJson<TBody>(
  method: "POST" | "PUT",
  path: string,
  apiKey: string,
  body: TBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  const base = hevyApiBaseUrl().replace(/\/$/, "");
  const url = `${base}${path}`;
  const timeoutMs = options.timeoutMs ?? hevyFetchTimeoutMs();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  try {
    const res = await fetchFn(url, {
      method,
      signal: ac.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        error: text.slice(0, 800) || `HTTP ${res.status}`,
        status: res.status,
      };
    }
    try {
      return { ok: true, data: text ? (JSON.parse(text) as unknown) : {} };
    } catch {
      return { ok: false, error: "Invalid JSON from Hevy API", status: res.status };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(t);
  }
}

async function hevyPostJson<TBody>(
  path: string,
  apiKey: string,
  body: TBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  return hevyWriteJson("POST", path, apiKey, body, options);
}

async function hevyPutJson<TBody>(
  path: string,
  apiKey: string,
  body: TBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  return hevyWriteJson("PUT", path, apiKey, body, options);
}

export async function fetchHevyExerciseTemplatesPage(
  apiKey: string,
  page: number,
  pageSize: number,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<
  { ok: true; data: HevyExerciseTemplatesPage } | { ok: false; error: string; status?: number }
> {
  return hevyGetJson<HevyExerciseTemplatesPage>(
    "/v1/exercise_templates",
    apiKey,
    {
      page: String(Math.max(1, page)),
      pageSize: String(Math.min(100, Math.max(1, pageSize))),
    },
    options,
  );
}

/**
 * Walks paginated exercise templates (pageSize 100) until empty or `maxPages`.
 */
export async function fetchHevyExerciseTemplateCatalog(
  apiKey: string,
  options: { maxPages?: number; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; templates: HevyExerciseTemplateBrief[] } | { ok: false; error: string }> {
  const maxPages = options.maxPages ?? 20;
  const templates: HevyExerciseTemplateBrief[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetchHevyExerciseTemplatesPage(apiKey, page, 100, options);
    if (!r.ok) {
      return { ok: false, error: r.error };
    }
    const batch = r.data.exercise_templates ?? [];
    if (batch.length === 0) {
      break;
    }
    for (const row of batch) {
      const id = row.id?.trim();
      const title = row.title?.trim();
      if (id && title) {
        templates.push({ id, title });
      }
    }
    const pageCount = r.data.page_count ?? page;
    if (page >= pageCount) {
      break;
    }
  }
  return { ok: true, templates };
}

export async function createHevyRoutine(
  apiKey: string,
  body: HevyPostRoutineBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; routine: HevyRoutine } | { ok: false; error: string; status?: number }> {
  const r = await hevyPostJson("/v1/routines", apiKey, body, options);
  if (!r.ok) {
    return r;
  }
  const routine = pickHevyRoutineFromCreateResponse(r.data);
  if (!routine?.id) {
    return {
      ok: false,
      error: `Hevy returned no routine id (body: ${JSON.stringify(r.data).slice(0, 400)})`,
    };
  }
  return { ok: true, routine };
}

/** PUT /v1/routines/{id} — omit `folder_id` per OpenAPI `PutRoutinesRequestBody`. */
export async function updateHevyRoutine(
  apiKey: string,
  routineId: string,
  body: HevyPostRoutineBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; routine: HevyRoutine } | { ok: false; error: string; status?: number }> {
  const putBody = {
    routine: {
      title: body.routine.title,
      notes: body.routine.notes ?? null,
      exercises: body.routine.exercises,
    },
  };
  const path = `/v1/routines/${encodeURIComponent(routineId)}`;
  const r = await hevyPutJson(path, apiKey, putBody, options);
  if (!r.ok) {
    return r;
  }
  const routine = pickHevyRoutineFromCreateResponse(r.data);
  if (!routine?.id) {
    return {
      ok: false,
      error: `Hevy returned no routine id (body: ${JSON.stringify(r.data).slice(0, 400)})`,
    };
  }
  return { ok: true, routine };
}

export async function createHevyWorkout(
  apiKey: string,
  body: HevyPostWorkoutBody,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; workout: HevyWorkout } | { ok: false; error: string; status?: number }> {
  const r = await hevyPostJson("/v1/workouts", apiKey, body, options);
  if (!r.ok) {
    return r;
  }
  const workout = pickHevyWorkoutFromCreateResponse(r.data);
  if (!workout?.id) {
    return {
      ok: false,
      error: `Hevy returned no workout id (body: ${JSON.stringify(r.data).slice(0, 400)})`,
    };
  }
  return { ok: true, workout };
}

export async function fetchHevyWorkoutsPage(
  apiKey: string,
  page: number,
  pageSize: number,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; data: HevyWorkoutsPage } | { ok: false; error: string; status?: number }> {
  return hevyGetJson<HevyWorkoutsPage>(
    "/v1/workouts",
    apiKey,
    {
      page: String(Math.max(1, page)),
      pageSize: String(Math.min(10, Math.max(1, pageSize))),
    },
    options,
  );
}

export async function fetchHevyRoutinesPage(
  apiKey: string,
  page: number,
  pageSize: number,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: true; data: HevyRoutinesPage } | { ok: false; error: string; status?: number }> {
  return hevyGetJson<HevyRoutinesPage>(
    "/v1/routines",
    apiKey,
    {
      page: String(Math.max(1, page)),
      pageSize: String(Math.min(10, Math.max(1, pageSize))),
    },
    options,
  );
}
