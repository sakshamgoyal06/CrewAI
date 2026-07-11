import { describe, expect, it, vi } from "vitest";

import {
  createHevyRoutine,
  fetchHevyWorkoutsPage,
  hevyApiBaseUrl,
  updateHevyRoutine,
} from "./hevyClient.js";

describe("fetchHevyWorkoutsPage", () => {
  it("sends api-key header and pageSize query", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ page: 1, page_count: 1, workouts: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const r = await fetchHevyWorkoutsPage("test-key-uuid", 1, 5, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.workouts).toEqual([]);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/workouts");
    expect(url).toContain("page=1");
    expect(url).toContain("pageSize=5");
    expect(init.headers).toMatchObject({
      "api-key": "test-key-uuid",
      Accept: "application/json",
    });
  });

  it("surfaces HTTP errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const r = await fetchHevyWorkoutsPage("bad", 1, 5, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toContain("nope");
    }
  });
});

describe("createHevyRoutine", () => {
  const minimalBody = {
    routine: {
      title: "Test",
      exercises: [
        {
          exercise_template_id: "ABC123",
          sets: [{ type: "normal" as const, reps: 5 }],
        },
      ],
    },
  };

  it("accepts top-level id in POST response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "rid-1", title: "Test" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const r = await createHevyRoutine("key", minimalBody, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.routine.id).toBe("rid-1");
    }
  });

  it("PUT update accepts nested routine in response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ routine: { id: "rid-put", title: "Updated" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const r = await updateHevyRoutine("key", "rid-put", minimalBody, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.routine.id).toBe("rid-put");
    }
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/routines/rid-put");
    expect(init.method).toBe("PUT");
  });

  it("accepts nested routine object in POST response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ routine: { id: "rid-2", title: "Test" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const r = await createHevyRoutine("key", minimalBody, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.routine.id).toBe("rid-2");
    }
  });

  it("accepts routine as one-element array (live Hevy API shape)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          routine: [{ id: "rid-arr", title: "Heavy Push Day", exercises: [] }],
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    const r = await createHevyRoutine("key", minimalBody, { fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.routine.id).toBe("rid-arr");
    }
  });

  it("sends folder_id null when omitted (Hevy rejects undefined)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "rid-null-folder", title: "Test" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await createHevyRoutine("key", minimalBody, { fetchImpl });
    const [, , , sentBody] = fetchImpl.mock.calls[0] as [string, unknown, unknown, unknown];
    // fetchImpl is called as fetch(url, init) — body is in init.body
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    const parsed = JSON.parse(init.body as string) as { routine: { folder_id: null } };
    expect(parsed.routine.folder_id).toBeNull();
  });
});

describe("hevyApiBaseUrl", () => {
  it("defaults to production host", () => {
    const prev = process.env.MAGNUS_HEVY_API_BASE_URL;
    delete process.env.MAGNUS_HEVY_API_BASE_URL;
    expect(hevyApiBaseUrl()).toBe("https://api.hevyapp.com");
    if (prev === undefined) {
      delete process.env.MAGNUS_HEVY_API_BASE_URL;
    } else {
      process.env.MAGNUS_HEVY_API_BASE_URL = prev;
    }
  });
});
