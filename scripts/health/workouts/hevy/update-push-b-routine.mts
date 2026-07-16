/**
 * Update Push B: differentiate from Push A.
 * - Keep flat barbell bench
 * - Replace chest press machine with incline dumbbell bench (no incline barbell at gym)
 * - Swap overlapping movements for complementary push variants
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";

import { hevyApiBaseUrl, updateHevyRoutine } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";
import type { HevyPostRoutineBody } from "../../../../src/pillars/health/workouts/hevy/types.js";

const ROUTINE_ID = "b55c11d6-23d9-439f-ae9d-5f9e9e4e203a";

/** Push A template IDs — avoid duplicating except flat bench + incline DB (gym has no incline barbell). */
const PUSH_A_IDS = new Set([
  "651F844C", // Cable Fly Crossovers
  "9930DF71", // Seated Overhead Press (Dumbbell)
  "DE68C825", // Single Arm Lateral Raise (Cable)
  "4B4BF8C2", // Triceps Dip (Assisted)
  "B5EFBF9C", // Overhead Triceps Extension (Cable)
]);

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const compound = () => [
  { type: "normal" as const, rep_range: { start: 8, end: 10 } },
  { type: "normal" as const, rep_range: { start: 8, end: 10 } },
  { type: "normal" as const, rep_range: { start: 8, end: 10 } },
];
const isolation = () => [
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
  { type: "normal" as const, rep_range: { start: 12, end: 15 } },
];

const treadmillNotes = `20 minutes incline treadmill walking.
Speed: 3.7–4.0 where sustainable.
Incline: 14–16 (machine max 20).
Moderate effort — queue video/podcast before gym if training late.`;

const pushBExercises = [
  {
    exercise_template_id: "79D0BB3A",
    rest_seconds: 180,
    notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Flat barbell bench — anchor lift for Push B.
Keep shoulder blades retracted.
Control the eccentric.
Stop before unsafe grinding.`,
    sets: compound(),
  },
  {
    exercise_template_id: "07B38369",
    rest_seconds: 150,
    notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Incline dumbbell press — gym has no incline barbell setup.
Stable shoulder blades; control the stretch.
Push B uses flat bench first, then incline DB (Push A is the reverse order).`,
    sets: compound(),
  },
  {
    exercise_template_id: "9DCE2D64",
    rest_seconds: 75,
    notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Pec deck fly — different from Push A cable crossovers.
Control the stretch.
Pause briefly at contraction.`,
    sets: isolation(),
  },
  {
    exercise_template_id: "A69FF221",
    rest_seconds: 150,
    notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Arnold press — replaces Push A seated dumbbell OHP.
Rotate smoothly; avoid excessive lower-back arch.`,
    sets: compound(),
  },
  {
    exercise_template_id: "8293E554",
    rest_seconds: 60,
    notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Front raise — Push A already hits side delts via cable lateral.
Lead with elbows; avoid swinging.`,
    sets: isolation(),
  },
  {
    exercise_template_id: "875F585F",
    rest_seconds: 120,
    notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Skullcrusher — replaces Push A assisted dips.
Keep upper arms fixed; control the negative.`,
    sets: compound(),
  },
  {
    exercise_template_id: "94B7239B",
    rest_seconds: 75,
    notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Rope pushdown — pairs with skullcrushers (Push A uses overhead extension).
Separate rope at the bottom.`,
    sets: isolation(),
  },
  {
    exercise_template_id: "DCF3B31B",
    rest_seconds: 60,
    notes: `3 controlled sets of 12–15.
Curl ribs toward pelvis.
Do not pull the neck.
Progress with control before adding difficulty.`,
    sets: isolation(),
  },
  {
    exercise_template_id: "7952B5CD",
    rest_seconds: 60,
    notes: `3 controlled sets of 12–15.
Tilt pelvis upward.
Do not swing the legs.
If fatigued, shorten holds — knee plank regression OK.`,
    sets: isolation(),
  },
  {
    exercise_template_id: "243710DE",
    notes: treadmillNotes,
    sets: [{ type: "normal" as const, duration_seconds: 1200 }],
  },
];

const overlap = pushBExercises.filter(
  (e) => PUSH_A_IDS.has(e.exercise_template_id),
);
if (overlap.length) {
  console.error("Unexpected overlap with Push A (besides flat bench):", overlap.map((e) => e.exercise_template_id));
  process.exit(1);
}

const mappingTable = [
  ["Bench Press (Barbell)", "79D0BB3A", "keep", "Flat barbell anchor"],
  ["Chest Press (Machine)", "07B38369", "swap", "→ Incline Bench Press (Dumbbell)"],
  ["Cable Fly Crossovers", "9DCE2D64", "swap", "→ Butterfly (Pec Deck)"],
  ["Seated OHP (Dumbbell)", "A69FF221", "swap", "→ Arnold Press (Dumbbell)"],
  ["Lateral Raise (Dumbbell)", "8293E554", "swap", "→ Front Raise (Dumbbell)"],
  ["Triceps Dip (Assisted)", "875F585F", "swap", "→ Skullcrusher (Barbell)"],
  ["Triceps Rope Pushdown", "94B7239B", "keep", "Different from Push A overhead ext"],
  ["Crunch / Reverse Crunch / Treadmill", "—", "keep", "Abs + finisher unchanged"],
];
console.log("PUSH B PREFLIGHT — exercise mapping\n");
for (const row of mappingTable) {
  console.log(`  ${row[0].padEnd(28)} ${row[2].padEnd(6)} ${row[3]}`);
}

const body: HevyPostRoutineBody = {
  routine: {
    title: "Push B",
    notes: `Primary: Chest
Secondary: Shoulders and Triceps

Second push day — complementary to Push A.
Push A: incline DB → flat barbell, cable fly, seated OHP, cable lateral, dips, overhead ext.
Push B: flat barbell → incline DB, pec deck, Arnold press, front raise, skullcrushers, rope pushdown.
(Incline DB shared — no incline barbell at gym.)

Program rules:
- Compounds: 3×8–10. Isolations/abs: 3×12–15.
- Finish with 20 min incline treadmill.
- Progress compounds after 10/10/10; isolations after 15/15/15.
- Normal sets only. No warm-ups.`,
    exercises: pushBExercises,
  },
};

writeFileSync("/tmp/push-b-routine-after.json", JSON.stringify(body, null, 2));
console.log("\nPAYLOAD_PREVIEW", JSON.stringify(body.routine.exercises.map((e) => e.exercise_template_id)));

const updated = await updateHevyRoutine(apiKey, ROUTINE_ID, body);
if (!updated.ok) {
  console.error("UPDATE_FAILED", updated.status, updated.error);
  process.exit(1);
}

const base = hevyApiBaseUrl().replace(/\/$/, "");
const verify = await fetch(`${base}/v1/routines/${ROUTINE_ID}`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const vr = (await verify.json()) as { routine?: { exercises?: { title?: string; exercise_template_id?: string }[] } };
console.log(
  "OK",
  JSON.stringify(
    {
      id: updated.routine.id,
      title: updated.routine.title,
      exercises: (vr.routine?.exercises ?? []).map((e) => ({ id: e.exercise_template_id, title: e.title })),
    },
    null,
    2,
  ),
);
