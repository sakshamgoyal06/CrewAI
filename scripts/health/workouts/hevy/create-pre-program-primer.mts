/**
 * Create Pre-Program Primer routine in Hevy Coach.
 */
import "dotenv/config";

import {
  createHevyRoutine,
  fetchHevyExerciseTemplateCatalog,
  fetchHevyRoutinesPage,
  hevyApiBaseUrl,
} from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const FOLDER_ID = 3206984;
const ROUTINE_TITLE = "Pre-Program Primer";

const base = hevyApiBaseUrl().replace(/\/$/, "");
const folderRes = await fetch(`${base}/v1/routine_folders?page=1&pageSize=10`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const folder = ((await folderRes.json()) as { routine_folders?: { id: number; title?: string }[] })
  .routine_folders?.find((f) => f.id === FOLDER_ID);
if (!folder || folder.title?.trim() !== "Hevy Coach") {
  console.error("FOLDER_MISMATCH", folder);
  process.exit(1);
}

const allRoutines: { title?: string; folder_id?: number | null }[] = [];
for (let page = 1, pageCount = 1; page <= pageCount; page++) {
  const r = await fetchHevyRoutinesPage(apiKey, page, 10);
  if (!r.ok) process.exit(1);
  pageCount = r.data.page_count ?? page;
  allRoutines.push(...(r.data.routines ?? []));
}
if (allRoutines.some((r) => r.title?.trim() === ROUTINE_TITLE && r.folder_id === FOLDER_ID)) {
  console.error("DUPLICATE", ROUTINE_TITLE);
  process.exit(1);
}

const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 20 });
if (!catalog.ok) process.exit(1);
const standard = catalog.templates.filter((t) => !t.id.includes("-"));

function byTitle(title: string) {
  const t = standard.find((x) => x.title === title);
  if (!t) throw new Error(`Missing template: ${title}`);
  return t;
}

const T = {
  treadmill: byTitle("Treadmill"),
  warmUp: byTitle("Warm Up"),
  squatBw: byTitle("Squat (Bodyweight)"),
  bandPullaparts: byTitle("Band Pullaparts"),
  latPulldown: byTitle("Lat Pulldown (Cable)"),
  seatedRow: byTitle("Seated Cable Row - Bar Grip"),
  legPress: byTitle("Leg Press (Machine)"),
  legCurl: byTitle("Seated Leg Curl (Machine)"),
  dbCurl: byTitle("Bicep Curl (Dumbbell)"),
  crunch: byTitle("Crunch"),
  plank: byTitle("Plank"),
  stretching: byTitle("Stretching"),
};

const mapping = [
  { requested: "Incline treadmill walk", hevyTitle: T.treadmill.title, id: T.treadmill.id, match: "substitution", reason: "Treadmill; incline/speed set in session notes." },
  { requested: "Mobility warm-up circuit", hevyTitle: T.warmUp.title, id: T.warmUp.id, match: "substitution", reason: "No separate cat-cow/circle templates; consolidated into Warm Up block." },
  { requested: "Bodyweight squats (mobility)", hevyTitle: T.squatBw.title, id: T.squatBw.id, match: "exact", reason: "Squat (Bodyweight)." },
  { requested: "Band pull-aparts", hevyTitle: T.bandPullaparts.title, id: T.bandPullaparts.id, match: "exact", reason: "Band Pullaparts." },
  { requested: "Lat Pulldown", hevyTitle: T.latPulldown.title, id: T.latPulldown.id, match: "exact", reason: "Light activation." },
  { requested: "Seated Cable Row", hevyTitle: T.seatedRow.title, id: T.seatedRow.id, match: "substitution", reason: "Bar Grip row handle." },
  { requested: "Leg Press", hevyTitle: T.legPress.title, id: T.legPress.id, match: "exact", reason: "Light activation." },
  { requested: "Seated Leg Curl", hevyTitle: T.legCurl.title, id: T.legCurl.id, match: "exact", reason: "Light activation." },
  { requested: "Dumbbell Curl", hevyTitle: T.dbCurl.title, id: T.dbCurl.id, match: "exact", reason: "Optional easy pump." },
  { requested: "Crunch", hevyTitle: T.crunch.title, id: T.crunch.id, match: "exact", reason: "Easy abs." },
  { requested: "Plank", hevyTitle: T.plank.title, id: T.plank.id, match: "exact", reason: "Easy abs hold." },
  { requested: "Cooldown walk", hevyTitle: T.treadmill.title, id: T.treadmill.id, match: "substitution", reason: "Slow treadmill walk 5 min." },
  { requested: "Cooldown stretching", hevyTitle: T.stretching.title, id: T.stretching.id, match: "substitution", reason: "No per-muscle stretch templates; consolidated Stretching block." },
];

const rep12 = () => [
  { type: "normal" as const, reps: 12 },
  { type: "normal" as const, reps: 12 },
];
const rep12to15 = () => [
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
];

const payload: HevyPostRoutineBody = {
  routine: {
    title: ROUTINE_TITLE,
    folder_id: FOLDER_ID,
    notes: `Pre-program primer — easy conditioning, mobility, light activation, abs, and cooldown.

Not a main strength day. Keep everything easy (RPE 5–6 for activation). Stop before strain.`,
    exercises: [
      {
        exercise_template_id: T.treadmill.id,
        notes: `20–30 min incline treadmill walk.
Speed: comfortable brisk walk.
Incline: moderate.
Effort: 6/10.
Breathe steadily, not gasping.`,
        sets: [{ type: "normal", duration_seconds: 1500 }],
      },
      {
        exercise_template_id: T.warmUp.id,
        notes: `Mobility warm-up 8–10 min. Do 1–2 rounds:
• Cat-cow: 10 reps
• Shoulder circles: 10 forward + 10 backward
• Hip circles: 10 each side
• Arm swings: 15 reps`,
        sets: [{ type: "normal", duration_seconds: 540 }],
      },
      {
        exercise_template_id: T.squatBw.id,
        rest_seconds: 30,
        notes: "Mobility round. Bodyweight squats: 10 reps. Easy depth.",
        sets: [{ type: "normal", reps: 10 }],
      },
      {
        exercise_template_id: T.bandPullaparts.id,
        rest_seconds: 45,
        notes: "Mobility finish. Light band pull-aparts: 15 reps. Or easy cable face pulls if no band.",
        sets: [{ type: "normal", reps: 15 }],
      },
      {
        exercise_template_id: T.latPulldown.id,
        rest_seconds: 60,
        notes: "Light pull activation. 2×12. Light weight. Focus on form. RPE 5–6.",
        sets: rep12(),
      },
      {
        exercise_template_id: T.seatedRow.id,
        rest_seconds: 60,
        notes: "2×12. Smooth reps. No heavy pulling. RPE 5–6.",
        sets: rep12(),
      },
      {
        exercise_template_id: T.legPress.id,
        rest_seconds: 60,
        notes: "2×12. Light-moderate. Do not go close to failure. RPE 5–6.",
        sets: rep12(),
      },
      {
        exercise_template_id: T.legCurl.id,
        rest_seconds: 60,
        notes: "2×12–15. Controlled reps. RPE 5–6.",
        sets: rep12to15(),
      },
      {
        exercise_template_id: T.dbCurl.id,
        rest_seconds: 45,
        notes: "Optional. 2×12. Easy pump only. RPE 5–6.",
        sets: rep12(),
      },
      {
        exercise_template_id: T.crunch.id,
        rest_seconds: 45,
        notes: "Easy abs. 2×12–15. Clean reps only. Stop before strain.",
        sets: rep12to15(),
      },
      {
        exercise_template_id: T.plank.id,
        rest_seconds: 45,
        notes: "2×20–30 seconds. Stop before strain.",
        sets: [
          { type: "normal", duration_seconds: 25 },
          { type: "normal", duration_seconds: 25 },
        ],
      },
      {
        exercise_template_id: T.treadmill.id,
        notes: "Cooldown: slow treadmill walk 5 min. Easy pace.",
        sets: [{ type: "normal", duration_seconds: 300 }],
      },
      {
        exercise_template_id: T.stretching.id,
        notes: `Cooldown stretching 5 min.
Stretch lats, hamstrings, quads, and chest lightly.
Hold each 20–30 seconds. No pain.`,
        sets: [{ type: "normal", duration_seconds: 300 }],
      },
    ],
  },
};

const created = await createHevyRoutine(apiKey, payload);
if (!created.ok) {
  console.log(JSON.stringify({ success: false, status: created.status, error: created.error }));
  process.exit(1);
}

console.log(
  JSON.stringify({
    success: true,
    routine_id: created.routine.id,
    title: created.routine.title ?? ROUTINE_TITLE,
    folder_id: FOLDER_ID,
    mapping,
  }, null, 2),
);
