import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import {
  createHevyRoutine,
  createHevyWorkout,
  fetchHevyExerciseTemplateCatalog,
  updateHevyRoutine,
} from "../hevy/hevyClient.js";
import { hevyApiKeyForUser } from "../hevy/hevyEnv.js";
import { parseHevyWriteCommand } from "../hevy/parseHevyWriteCommand.js";
import type {
  HevyExerciseTemplateBrief,
  HevyPostRoutineBody,
  HevyPostWorkoutBody,
} from "../hevy/types.js";
import { logger } from "../../../../logger.js";
import { anthropic } from "../../../../tools/clients.js";
import type { AgentContext, AgentResult } from "../../../../agents/types.js";
import { extractJsonObject } from "../../../../agents/health/jsonExtract.js";
import { HEALTH_SPECIALIST_MODEL } from "../../../../agents/health/model.js";

const ROUTINE_JSON_SYSTEM = `You convert workout plans into JSON for the Hevy app's REST API (create routine).

Output exactly one JSON object, no markdown fences, no commentary. Shape:
{"routine":{"title":"string","notes":null or string,"folder_id":null,"exercises":[{"exercise_template_id":"ID_FROM_CATALOG","rest_seconds":90,"notes":null,"sets":[{"type":"normal","reps":10}]}]}}

Rules:
- exercise_template_id MUST be copied exactly from the provided catalog. Never invent an id.
- Match the user's exercises to the closest catalog titles (e.g. "bench" -> "Bench Press (Barbell)" if present).
- type per set: one of warmup, normal, failure, dropset.
- Include at least 1 set per exercise. Use integer reps unless the user gives a range; then use rep_range {"start":8,"end":12} instead of reps.
- Keep titles concise.`;

const ROUTINE_UPDATE_JSON_SYSTEM = `You convert workout plans into JSON for the Hevy app's REST API (update an existing routine via PUT).

Output exactly one JSON object, no markdown fences, no commentary. Shape:
{"routine":{"title":"string","notes":null or string,"exercises":[{"exercise_template_id":"ID_FROM_CATALOG","rest_seconds":90,"notes":null,"sets":[{"type":"normal","reps":10}]}]}}

Rules:
- Do NOT include folder_id (updates use title, notes, exercises only).
- exercise_template_id MUST be copied exactly from the provided catalog.
- type per set: warmup, normal, failure, dropset.
- Include at least 1 set per exercise.`;

const WORKOUT_JSON_SYSTEM = `You convert a completed-workout description into JSON for the Hevy app's REST API (log workout).

Output exactly one JSON object, no markdown fences, no commentary. Shape:
{"workout":{"title":"string","description":null or string,"start_time":"ISO8601 Z","end_time":"ISO8601 Z","is_private":false,"exercises":[{"exercise_template_id":"ID_FROM_CATALOG","notes":null,"sets":[{"type":"normal","reps":10,"weight_kg":60}]}]}}

Rules:
- exercise_template_id MUST be copied exactly from the provided catalog.
- start_time and end_time must be ISO 8601 with Z (UTC). Use the defaults the user message gives for times if the user did not specify times.
- type per set: warmup, normal, failure, or dropset.
- Include weights in kg when the user provides them; otherwise null.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

/** Prefer templates whose titles overlap the user's plan, then fill with the rest. */
export function narrowHevyTemplateCatalog(
  userPlan: string,
  catalog: HevyExerciseTemplateBrief[],
  maxItems: number,
): HevyExerciseTemplateBrief[] {
  const words = userPlan
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) {
    return catalog.slice(0, maxItems);
  }
  const scored = catalog.map((t) => {
    const tl = t.title.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (tl.includes(w)) {
        score += 2;
      }
    }
    return { t, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const high = scored.filter((s) => s.score > 0).map((s) => s.t);
  const highIds = new Set(high.map((x) => x.id));
  const rest = catalog.filter((x) => !highIds.has(x.id));
  return [...high, ...rest].slice(0, maxItems);
}

function isValidRoutineBody(o: unknown, allowedIds: Set<string>): o is HevyPostRoutineBody {
  if (!o || typeof o !== "object") {
    return false;
  }
  const r = (o as HevyPostRoutineBody).routine;
  if (!r || typeof r !== "object") {
    return false;
  }
  if (typeof r.title !== "string" || !r.title.trim()) {
    return false;
  }
  if (!Array.isArray(r.exercises) || r.exercises.length === 0) {
    return false;
  }
  for (const ex of r.exercises) {
    if (typeof ex.exercise_template_id !== "string" || !allowedIds.has(ex.exercise_template_id)) {
      return false;
    }
    if (!Array.isArray(ex.sets) || ex.sets.length === 0) {
      return false;
    }
  }
  return true;
}

function isValidWorkoutBody(o: unknown, allowedIds: Set<string>): o is HevyPostWorkoutBody {
  if (!o || typeof o !== "object") {
    return false;
  }
  const w = (o as HevyPostWorkoutBody).workout;
  if (!w || typeof w !== "object") {
    return false;
  }
  if (typeof w.title !== "string" || !w.title.trim()) {
    return false;
  }
  if (typeof w.start_time !== "string" || typeof w.end_time !== "string") {
    return false;
  }
  if (!Array.isArray(w.exercises) || w.exercises.length === 0) {
    return false;
  }
  for (const ex of w.exercises) {
    if (typeof ex.exercise_template_id !== "string" || !allowedIds.has(ex.exercise_template_id)) {
      return false;
    }
    if (!Array.isArray(ex.sets) || ex.sets.length === 0) {
      return false;
    }
  }
  return true;
}

async function llmHevyRoutineJson(
  userPlan: string,
  catalogJson: string,
  client: typeof anthropic,
  mode: "create" | "update",
  routineId?: string,
): Promise<unknown | null> {
  const system = mode === "update" ? ROUTINE_UPDATE_JSON_SYSTEM : ROUTINE_JSON_SYSTEM;
  const userBlock =
    mode === "update" && routineId
      ? `Exercise catalog (JSON array of {id,title}):\n${catalogJson}\n\nRoutine id to replace (PUT): ${routineId}\n\nNew program:\n${userPlan}`
      : `Exercise catalog (JSON array of {id,title}):\n${catalogJson}\n\nUser plan:\n${userPlan}`;
  const msg = await client.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userBlock }],
  });
  return extractJsonObject(textFromMessage(msg));
}

async function llmHevyWorkoutJson(
  userPlan: string,
  catalogJson: string,
  timeHint: string,
  client: typeof anthropic,
): Promise<unknown | null> {
  const msg = await client.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 4096,
    system: WORKOUT_JSON_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Exercise catalog (JSON array of {id,title}):\n${catalogJson}\n\n${timeHint}\n\nWorkout to log:\n${userPlan}`,
      },
    ],
  });
  return extractJsonObject(textFromMessage(msg));
}

/**
 * Creates a Hevy routine or logs a workout when the user uses `hevy routine:` / `hevy workout:` or `/hevy routine:`.
 */
export async function tryHevyWriteAgent(
  ctx: AgentContext,
  client: typeof anthropic = anthropic,
): Promise<AgentResult | null> {
  const parsed = parseHevyWriteCommand(ctx.rawMessage, ctx.slashCommandKey);
  if (parsed.kind === "none") {
    return null;
  }

  const apiKey = await hevyApiKeyForUser(ctx.userProfileId);
  if (!apiKey) {
    return {
      text: "To create routines or workouts in Hevy, set HEVY_API_KEY (Hevy Pro → https://hevy.com/settings?developer), then restart Magnus.",
      metadata: {
        specialist: "HevyWrite",
        department: "HEALTH",
        hevy_write: false,
        hevy_error: "no_api_key",
      },
    };
  }

  const catalogRes = await fetchHevyExerciseTemplateCatalog(apiKey);
  if (!catalogRes.ok) {
    return {
      text: `I could not load your Hevy exercise library (${catalogRes.error}). Check the API key and try again.`,
      metadata: {
        specialist: "HevyWrite",
        department: "HEALTH",
        hevy_write: false,
        hevy_error: "catalog_fetch",
      },
    };
  }

  const full = catalogRes.templates;
  const forPrompt =
    full.length <= 350 ? full : narrowHevyTemplateCatalog(parsed.text, full, 320);
  const allowedIds = new Set(forPrompt.map((t) => t.id));
  const catalogJson = JSON.stringify(forPrompt);

  if (parsed.kind === "routine_update") {
    const raw = await llmHevyRoutineJson(
      parsed.text,
      catalogJson,
      client,
      "update",
      parsed.routineId,
    );
    if (!raw || !isValidRoutineBody(raw, allowedIds)) {
      return {
        text:
          "I could not build a valid Hevy routine update. Check the routine UUID (from Hevy or from Magnus after a create), use exercise names that match your library, and try: `hevy routine update: <uuid> — your exercises…`",
        metadata: {
          specialist: "HevyWrite",
          department: "HEALTH",
          hevy_write: false,
          hevy_kind: "routine_update",
          hevy_error: "llm_or_validate",
        },
      };
    }

    const updated = await updateHevyRoutine(apiKey, parsed.routineId, raw);
    if (!updated.ok) {
      logger.warn(
        { err: updated.error, status: updated.status, routineId: parsed.routineId },
        "hevy: update routine failed",
      );
      return {
        text: `Hevy rejected the routine update (${updated.status ?? "?"}): ${updated.error.slice(0, 400)}`,
        metadata: {
          specialist: "HevyWrite",
          department: "HEALTH",
          hevy_write: false,
          hevy_kind: "routine_update",
          hevy_status: updated.status,
        },
      };
    }

    logger.info(
      { hevy_routine_id: updated.routine.id, title: updated.routine.title },
      "hevy: routine updated",
    );
    return {
      text: `Updated Hevy routine “${updated.routine.title ?? raw.routine.title}” (id ${updated.routine.id}).`,
      metadata: {
        specialist: "HevyWrite",
        department: "HEALTH",
        hevy_write: true,
        hevy_kind: "routine_update",
        hevy_id: updated.routine.id,
      },
    };
  }

  if (parsed.kind === "routine") {
    const raw = await llmHevyRoutineJson(parsed.text, catalogJson, client, "create");
    if (!raw || !isValidRoutineBody(raw, allowedIds)) {
      return {
        text:
          "I could not build a valid Hevy routine from that (exercise names may not match your Hevy library). Try `hevy routine:` with exercise names that match Hevy, or add the missing exercises in Hevy first.",
        metadata: {
          specialist: "HevyWrite",
          department: "HEALTH",
          hevy_write: false,
          hevy_kind: "routine",
          hevy_error: "llm_or_validate",
        },
      };
    }

    const posted = await createHevyRoutine(apiKey, raw);
    if (!posted.ok) {
      logger.warn({ err: posted.error, status: posted.status }, "hevy: create routine failed");
      return {
        text: `Hevy rejected the routine (${posted.status ?? "?"}): ${posted.error.slice(0, 400)}`,
        metadata: {
          specialist: "HevyWrite",
          department: "HEALTH",
          hevy_write: false,
          hevy_kind: "routine",
          hevy_status: posted.status,
        },
      };
    }

    logger.info(
      { hevy_routine_id: posted.routine.id, title: posted.routine.title },
      "hevy: routine created",
    );
    return {
      text: `Created Hevy routine “${posted.routine.title ?? raw.routine.title}” (id ${posted.routine.id}). Open Hevy to verify and adjust.`,
      metadata: {
        specialist: "HevyWrite",
        department: "HEALTH",
        hevy_write: true,
        hevy_kind: "routine",
        hevy_id: posted.routine.id,
      },
    };
  }

  const now = new Date();
  const endIso = now.toISOString();
  const startIso = new Date(now.getTime() - 45 * 60 * 1000).toISOString();
  const timeHint = `Default workout times if unspecified: start_time=${startIso}, end_time=${endIso}`;

  const rawW = await llmHevyWorkoutJson(parsed.text, catalogJson, timeHint, client);
  if (!rawW || !isValidWorkoutBody(rawW, allowedIds)) {
    return {
      text:
        "I could not build a valid Hevy workout log from that. Try `hevy workout:` with exercise names that match your Hevy library and include sets/reps (and times if you care about the log).",
      metadata: {
        specialist: "HevyWrite",
        department: "HEALTH",
        hevy_write: false,
        hevy_kind: "workout",
        hevy_error: "llm_or_validate",
      },
    };
  }

  const postedW = await createHevyWorkout(apiKey, rawW);
  if (!postedW.ok) {
    logger.warn({ err: postedW.error, status: postedW.status }, "hevy: create workout failed");
    return {
      text: `Hevy rejected the workout (${postedW.status ?? "?"}): ${postedW.error.slice(0, 400)}`,
      metadata: {
        specialist: "HevyWrite",
        department: "HEALTH",
        hevy_write: false,
        hevy_kind: "workout",
        hevy_status: postedW.status,
      },
    };
  }

  logger.info(
    { hevy_workout_id: postedW.workout.id, title: postedW.workout.title },
    "hevy: workout created",
  );
  return {
    text: `Logged workout in Hevy: “${postedW.workout.title ?? rawW.workout.title}” (id ${postedW.workout.id}).`,
    metadata: {
      specialist: "HevyWrite",
      department: "HEALTH",
      hevy_write: true,
      hevy_kind: "workout",
      hevy_id: postedW.workout.id,
    },
  };
}
