/**
 * Read-only preflight for Cardio + Abs + Conditioning routine.
 */
import "dotenv/config";

import {
  fetchHevyExerciseTemplateCatalog,
  fetchHevyRoutinesPage,
  hevyApiBaseUrl,
} from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const EXPECTED_FOLDER_ID = 3206984;
const EXPECTED_FOLDER_TITLE = "Hevy Coach";
const ROUTINE_TITLE = "Cardio + Abs + Conditioning";

const base = hevyApiBaseUrl().replace(/\/$/, "");

const folderRes = await fetch(`${base}/v1/routine_folders?page=1&pageSize=10`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const folderJson = (await folderRes.json()) as {
  routine_folders?: { id: number; title?: string }[];
};
if (!folderRes.ok) {
  console.error("FOLDER_FETCH_FAILED", folderRes.status, JSON.stringify(folderJson));
  process.exit(1);
}
const folders = folderJson.routine_folders ?? [];
const folder = folders.find((f) => f.id === EXPECTED_FOLDER_ID);
if (!folder) {
  console.error(
    `FOLDER_MISMATCH: id ${EXPECTED_FOLDER_ID} not found. Available: ${folders.map((f) => `${f.id}:"${f.title}"`).join(", ")}`,
  );
  process.exit(1);
}
if ((folder.title ?? "").trim() !== EXPECTED_FOLDER_TITLE) {
  console.error(
    `FOLDER_MISMATCH: id ${EXPECTED_FOLDER_ID} title is "${folder.title}", expected "${EXPECTED_FOLDER_TITLE}"`,
  );
  process.exit(1);
}
console.log("FOLDER_OK", JSON.stringify({ id: folder.id, title: folder.title }));

const allRoutines: { id?: string; title?: string; folder_id?: number | null }[] = [];
let page = 1;
let pageCount = 1;
while (page <= pageCount) {
  const r = await fetchHevyRoutinesPage(apiKey, page, 10);
  if (!r.ok) {
    console.error("ROUTINES_FETCH_FAILED", r.status, r.error);
    process.exit(1);
  }
  pageCount = r.data.page_count ?? page;
  allRoutines.push(...(r.data.routines ?? []));
  page++;
}
const dup = allRoutines.filter(
  (r) => (r.title ?? "").trim() === ROUTINE_TITLE && r.folder_id === EXPECTED_FOLDER_ID,
);
console.log(
  "ROUTINES_CHECK",
  JSON.stringify({
    total: allRoutines.length,
    duplicate_in_folder: dup.length,
    existing: dup.map((r) => ({ id: r.id, title: r.title })),
  }),
);
if (dup.length > 0) {
  console.error("DUPLICATE: routine already exists in Hevy Coach folder");
  process.exit(1);
}

const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 20 });
if (!catalog.ok) {
  console.error("CATALOG_FAILED", catalog.error);
  process.exit(1);
}
const standard = catalog.templates.filter((t) => !t.id.includes("-"));

function findAll(pattern: RegExp) {
  return standard.filter((t) => pattern.test(t.title));
}

type Mapping = {
  requested: string;
  hevyTitle: string;
  id: string;
  matchType: "exact" | "substitution" | "ambiguous";
  reason: string;
  alternatives: string[];
};

const mappings: Mapping[] = [];

function oneOrFail(
  requested: string,
  hits: { id: string; title: string }[],
  exactTitle: RegExp | null,
  reasonExact: string,
  reasonSub: string,
): Mapping {
  if (hits.length === 0) {
    return {
      requested,
      hevyTitle: "NOT FOUND",
      id: "MISSING",
      matchType: "ambiguous",
      reason: "No matching template",
      alternatives: [],
    };
  }
  const exact = exactTitle ? hits.find((t) => exactTitle.test(t.title)) : undefined;
  const chosen = exact ?? hits[0]!;
  return {
    requested,
    hevyTitle: chosen.title,
    id: chosen.id,
    matchType: exact ? "exact" : "substitution",
    reason: exact ? reasonExact : reasonSub,
    alternatives: hits.filter((h) => h.id !== chosen.id).map((h) => `${h.title} (${h.id})`),
  };
}

// 1. Treadmill
mappings.push(
  oneOrFail(
    "Incline Treadmill Walking",
    findAll(/^Treadmill$/i),
    /^Treadmill$/i,
    "Exact match: Treadmill (incline set in session notes).",
    "Closest treadmill template.",
  ),
);

// 2. Jumping Jacks — exclude farmer's walk etc per constraints
const jumpingHits = findAll(/jumping jack/i);
mappings.push(
  oneOrFail(
    "Jumping Jacks",
    jumpingHits,
    /^Jumping Jacks?$/i,
    "Exact match: Jumping Jacks.",
    jumpingHits.length
      ? "Closest jumping jack template."
      : "No jumping jacks — would fall back to Mountain Climbers or High Knees per rules.",
  ),
);
if (mappings[1]!.id === "MISSING") {
  const alt = findAll(/mountain climber/i);
  const alt2 = findAll(/high knee/i);
  const fallback = alt.length ? alt : alt2;
  mappings[1] = oneOrFail(
    "Jumping Jacks",
    fallback,
    null,
    "",
    alt.length
      ? "Jumping Jacks unavailable; Mountain Climbers per mapping rules."
      : "Jumping Jacks unavailable; High Knees per mapping rules.",
  );
}

// 3. Step-Up
const stepHits = findAll(/^Step[- ]?Up|^Step Ups?/i);
let stepMapping = oneOrFail(
  "Step-Up",
  stepHits.length ? stepHits : findAll(/^Bodyweight Squat|^Squat \(Bodyweight\)/i),
  /^Step[- ]?Up/i,
  "Exact step-up template.",
  stepHits.length
    ? "Closest step-up template."
    : "Step-Up unavailable; Bodyweight Squat per mapping rules.",
);
mappings.push(stepMapping);

// 4. Crunch — not Hanging Knee Raise
const crunchHits = findAll(/^Crunch(es)?$/i).filter((t) => !/reverse|bicycle|cable/i.test(t.title));
mappings.push(
  oneOrFail(
    "Crunch",
    crunchHits.length ? crunchHits : findAll(/^Crunch/i),
    /^Crunch(es)?$/i,
    "Exact match: Crunch.",
    "Closest crunch template (excluding reverse/bicycle variants).",
  ),
);

// 5. Reverse Crunch
mappings.push(
  oneOrFail(
    "Reverse Crunch",
    findAll(/reverse crunch/i),
    /^Reverse Crunch(es)?$/i,
    "Exact match: Reverse Crunch.",
    "Closest reverse crunch template.",
  ),
);

// 6. Plank
const plankHits = findAll(/^Plank$/i);
const plankAlt = findAll(/elbow plank|front plank/i);
mappings.push(
  oneOrFail(
    "Plank",
    plankHits.length ? plankHits : plankAlt,
    /^Plank$/i,
    "Exact match: Plank.",
    plankHits.length
      ? "Closest plank template."
      : "Plank unavailable; Elbow/Front Plank equivalent per mapping rules.",
  ),
);

// Exclusion checks
const excluded = [
  { name: "Farmer's Walk", re: /farmer.?s walk/i },
  { name: "Interval bike", re: /interval.*bike|bike.*interval|assault bike|air bike/i },
  { name: "Hanging Knee Raise", re: /hanging knee raise/i },
];
for (const m of mappings) {
  for (const ex of excluded) {
    if (ex.re.test(m.hevyTitle)) {
      console.error(`EXCLUDED_EXERCISE_USED: ${ex.name} matched ${m.hevyTitle}`);
      process.exit(1);
    }
  }
}

const missing = mappings.filter((m) => m.id === "MISSING");
if (missing.length > 0) {
  console.error("BLOCKED_MISSING", missing.map((m) => m.requested));
  process.exit(1);
}

console.log("\nMAPPING_TABLE_JSON");
console.log(JSON.stringify(mappings, null, 2));

const payload = {
  routine: {
    title: ROUTINE_TITLE,
    folder_id: EXPECTED_FOLDER_ID,
    notes: `Wednesday conditioning and core day.

Purpose:
- Easy cardio
- Extra calorie burn
- Core training
- Light conditioning
- Recovery-friendly movement

This is not a main strength-progression day.

Important constraints:
- No heavy loading.
- No failure sets.
- Normal sets only.`,
    exercises: [
      {
        exercise_template_id: mappings[0]!.id,
        notes: `25 minutes incline treadmill walking.
Moderate sustainable pace.
Keep breathing controlled.
This should feel like productive cardio, not punishment.
Do not treat this as a strength-progression exercise.`,
        sets: [{ type: "normal", duration_seconds: 1500 }],
      },
      {
        exercise_template_id: mappings[1]!.id,
        rest_seconds: 45,
        notes: `5 sets of 45 seconds.
Keep rhythm smooth.
Stay light on the feet.
If knees or ankles feel uncomfortable, replace with brisk walking or step-ups.
This is conditioning, not failure training.`,
        sets: Array.from({ length: 5 }, () => ({
          type: "normal" as const,
          duration_seconds: 45,
        })),
      },
      {
        exercise_template_id: mappings[2]!.id,
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15 each leg.
Use bodyweight only initially.
Step through the full foot.
Control the descent.
Keep it easy and smooth.
If no step or box is available, replace with bodyweight squats.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[3]!.id,
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Curl ribs toward pelvis.
Do not pull the neck.
Pause briefly at the top.
Progress by improving control before adding difficulty.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[4]!.id,
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Tilt pelvis upward.
Do not swing the legs.
Control the lowering phase.
Keep lower back stable.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[5]!.id,
        rest_seconds: 60,
        notes: `3 controlled holds of 30–45 seconds.
Keep ribs down.
Squeeze glutes lightly.
Do not let lower back sag.
Stop the set when form breaks.`,
        sets: [
          { type: "normal", duration_seconds: 45 },
          { type: "normal", duration_seconds: 45 },
          { type: "normal", duration_seconds: 45 },
        ],
      },
    ],
  },
};

console.log("\nPAYLOAD_JSON");
console.log(JSON.stringify(payload, null, 2));
