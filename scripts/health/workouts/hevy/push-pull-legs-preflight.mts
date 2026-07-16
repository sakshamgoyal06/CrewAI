/**
 * Read-only preflight: Push B, Pull B, Legs
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";

import {
  fetchHevyExerciseTemplateCatalog,
  fetchHevyRoutinesPage,
  hevyApiBaseUrl,
} from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) process.exit(1);

const FOLDER_ID = 3206984;
const FOLDER_TITLE = "Hevy Coach";

const base = hevyApiBaseUrl().replace(/\/$/, "");
const folderRes = await fetch(`${base}/v1/routine_folders?page=1&pageSize=10`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const folderJson = (await folderRes.json()) as { routine_folders?: { id: number; title?: string }[] };
const folder = folderJson.routine_folders?.find((f) => f.id === FOLDER_ID);
if (!folder || folder.title?.trim() !== FOLDER_TITLE) {
  console.error("FOLDER_MISMATCH", folder);
  process.exit(1);
}

const allRoutines: { title?: string; folder_id?: number | null; id?: string }[] = [];
for (let page = 1, pageCount = 1; page <= pageCount; page++) {
  const r = await fetchHevyRoutinesPage(apiKey, page, 10);
  if (!r.ok) process.exit(1);
  pageCount = r.data.page_count ?? page;
  allRoutines.push(...(r.data.routines ?? []));
}

const titles = ["Push B", "Pull B", "Legs"] as const;
const existingCheck = titles.map((title) => {
  const hits = allRoutines.filter((r) => r.title?.trim() === title && r.folder_id === FOLDER_ID);
  return { title, exists: hits.length > 0, routine_ids: hits.map((h) => h.id) };
});

const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 20 });
if (!catalog.ok) process.exit(1);
const standard = catalog.templates.filter((t) => !t.id.includes("-"));

type Mapping = {
  requested: string;
  hevyTitle: string;
  id: string;
  matchType: "exact" | "substitution";
  reason: string;
  alternatives: string[];
};

function pick(
  requested: string,
  filter: (t: { id: string; title: string }) => boolean,
  prefer: (t: { id: string; title: string }) => number,
  reason: string,
): Mapping {
  const hits = standard.filter(filter);
  if (!hits.length) {
    return { requested, hevyTitle: "NOT FOUND", id: "MISSING", matchType: "substitution", reason, alternatives: [] };
  }
  const sorted = [...hits].sort((a, b) => prefer(b) - prefer(a));
  const chosen = sorted[0]!;
  const exact = requested.toLowerCase().replace(/\W/g, "") === chosen.title.toLowerCase().replace(/\W/g, "");
  return {
    requested,
    hevyTitle: chosen.title,
    id: chosen.id,
    matchType: exact ? "exact" : "substitution",
    reason,
    alternatives: sorted.slice(1, 5).map((h) => `${h.title} (${h.id})`),
  };
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
const treadmill = (notes: string) => ({
  exercise_template_id: "243710DE",
  notes,
  sets: [{ type: "normal" as const, duration_seconds: 1200 }],
});

const pushBMap: Mapping[] = [
  pick("Bench Press", (t) => /bench press \(barbell\)/i.test(t.title), () => 10, "Flat barbell bench — shared anchor; Push B leads with flat then incline barbell."),
  pick(
    "Incline Bench Press Barbell",
    (t) => /incline bench press \(barbell\)/i.test(t.title),
    () => 20,
    "Incline Barbell Bench — upper chest; Push A uses incline dumbbell instead.",
  ),
  pick("Pec Deck", (t) => /butterfly \(pec deck\)/i.test(t.title), () => 10, "Pec Deck — replaces Push A cable fly crossovers."),
  pick("Arnold Press", (t) => /arnold press \(dumbbell\)/i.test(t.title), () => 10, "Arnold Press — replaces Push A seated dumbbell OHP."),
  pick("Front Raise Dumbbell", (t) => /^Front Raise \(Dumbbell\)$/i.test(t.title), () => 10, "Front Raise — Push A uses cable lateral raise."),
  pick("Skullcrusher Barbell", (t) => /skullcrusher \(barbell\)/i.test(t.title), () => 10, "Skullcrusher — replaces Push A assisted dips."),
  pick(
    "Triceps Rope Pushdown",
    (t) => /triceps rope pushdown/i.test(t.title),
    () => 20,
    "Rope pushdown — Push A uses overhead cable extension.",
  ),
  pick("Crunch", (t) => /^Crunch$/i.test(t.title), () => 10, "Crunch — different abs from Push A cable crunch."),
  pick("Reverse Crunch", (t) => /^Reverse Crunch$/i.test(t.title), () => 10, "Reverse Crunch."),
  pick("Treadmill", (t) => /^Treadmill$/i.test(t.title), () => 10, "Treadmill."),
];

const pullBMap: Mapping[] = [
  pick("Seated Cable Row", (t) => /seated cable row/i.test(t.title), (t) => (/bar grip/i.test(t.title) ? 15 : 10), "Seated Cable Row — Bar Grip (standard neutral-grip row handle)."),
  pick(
    "Chest-Supported Row",
    (t) =>
      /chest supported t bar row|chest supported incline row|seal row \(barbell\)/i.test(t.title),
    (t) =>
      (/chest supported t bar row/i.test(t.title) ? 30 : 0) +
      (/chest supported incline row/i.test(t.title) ? 20 : 0) +
      (/seal row \(barbell\)/i.test(t.title) ? 10 : 0),
    "Chest Supported T Bar Row — standard machine chest-supported row.",
  ),
  pick(
    "Lat Pulldown",
    (t) => /lat pulldown/i.test(t.title) && !/close grip|single arm|underhand|reverse|machine|straight arm/i.test(t.title),
    (t) => (/lat pulldown \(cable\)/i.test(t.title) ? 20 : 5),
    "Lat Pulldown (Cable) — standard wide/neutral cable pulldown, not close-grip.",
  ),
  pick("Preacher Curl", (t) => /preacher curl \(machine\)/i.test(t.title), () => 20, "Preacher Curl (Machine) — simple gym-standard preacher station."),
  pick(
    "Cable Curl",
    (t) => /^Bicep Curl \(Cable\)$/i.test(t.title) || /^Rope Cable Curl$/i.test(t.title),
    (t) => (/bicep curl \(cable\)/i.test(t.title) ? 20 : 5),
    "Bicep Curl (Cable) — standard cable curl template.",
  ),
  pick("Reverse Pec Deck", (t) => /rear delt reverse fly \(machine\)/i.test(t.title), () => 10, "Rear Delt Reverse Fly (Machine) — reverse pec deck."),
  pick("Face Pull", (t) => /^Face Pull$/i.test(t.title), () => 10, "Face Pull."),
  pick("Cable Crunch", (t) => /^Cable Crunch$/i.test(t.title), () => 10, "Cable Crunch."),
  pick("Plank", (t) => /^Plank$/i.test(t.title), () => 10, "Plank."),
  pick("Treadmill", (t) => /^Treadmill$/i.test(t.title), () => 10, "Treadmill."),
];

const legsMap: Mapping[] = [
  pick("Leg Press", (t) => /leg press/i.test(t.title) && !/single/i.test(t.title), (t) => (/leg press \(machine\)/i.test(t.title) ? 20 : 5), "Leg Press (Machine)."),
  pick("Squat", (t) => /^Squat \(Barbell\)$/i.test(t.title), () => 10, "Squat (Barbell)."),
  pick("Leg Extension", (t) => /leg extension \(machine\)/i.test(t.title), () => 10, "Leg Extension (Machine)."),
  pick("Romanian Deadlift", (t) => /romanian deadlift/i.test(t.title), (t) => (/barbell/i.test(t.title) ? 20 : 5), "Romanian Deadlift (Barbell) preferred."),
  pick("Seated Leg Curl", (t) => /seated leg curl/i.test(t.title), () => 10, "Seated Leg Curl."),
  pick(
    "Standing Calf Raise",
    (t) => /standing calf raise/i.test(t.title) && !/single leg/i.test(t.title),
    (t) => (/^Standing Calf Raise$/i.test(t.title) ? 30 : 0) + (/machine/i.test(t.title) ? 10 : 5),
    "Standing Calf Raise — bilateral standard template.",
  ),
  pick("Seated Calf Raise", (t) => /seated calf raise/i.test(t.title), () => 10, "Seated Calf Raise."),
  pick("Crunch", (t) => /^Crunch$/i.test(t.title), () => 10, "Crunch."),
  pick("Reverse Crunch", (t) => /^Reverse Crunch$/i.test(t.title), () => 10, "Reverse Crunch."),
  pick("Treadmill", (t) => /^Treadmill$/i.test(t.title), () => 10, "Treadmill."),
];

for (const maps of [pushBMap, pullBMap, legsMap]) {
  for (const m of maps) {
    if (m.id === "MISSING") {
      console.error("MISSING", m);
      process.exit(1);
    }
  }
}

function ex(map: Mapping, rest: number | undefined, notes: string, sets: ReturnType<typeof compound>) {
  const o: Record<string, unknown> = { exercise_template_id: map.id, notes, sets };
  if (rest !== undefined) o.rest_seconds = rest;
  return o;
}

const pushBPayload = {
  routine: {
    title: "Push B",
    folder_id: FOLDER_ID,
    notes: `Primary: Chest\nSecondary: Shoulders and Triceps\n\nSecond push day — different exercises from Push A.\nPush B: flat barbell, incline barbell, pec deck, Arnold press, front raise, skullcrushers, rope pushdown.\n\nProgram rules:\n- Compounds: 3×8–10. Isolations/abs: 3×12–15.\n- Finish with 20 min incline treadmill.\n- Progress compounds after 10/10/10; isolations after 15/15/15.\n- Normal sets only. No warm-ups. Starting weight unset.`,
    exercises: [
      ex(pushBMap[0]!, 180, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nFlat barbell bench anchor.\nKeep shoulder blades retracted.\nControl the eccentric.\nStop before unsafe grinding.`, compound()),
      ex(pushBMap[1]!, 150, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nIncline barbell — upper chest (Push A uses incline DB).\nModerate incline.\nControl the stretch.`, compound()),
      ex(pushBMap[2]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nPec deck fly — not cable crossovers.\nControl the stretch.\nPause briefly at contraction.`, isolation()),
      ex(pushBMap[3]!, 150, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nArnold press — not seated dumbbell OHP.\nRotate smoothly.\nAvoid excessive lower-back arch.`, compound()),
      ex(pushBMap[4]!, 60, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nFront raise — Push A hits side delts via cable lateral.\nLead with elbows.\nAvoid swinging.`, isolation()),
      ex(pushBMap[5]!, 120, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nSkullcrusher — not assisted dips.\nKeep upper arms fixed.\nControl the negative.`, compound()),
      ex(pushBMap[6]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nRope pushdown — Push A uses overhead extension.\nSeparate rope at the bottom.\nAvoid body momentum.`, isolation()),
      ex(pushBMap[7]!, 60, `3 controlled sets of 12–15.\nCurl ribs toward pelvis.\nDo not pull the neck.\nPause briefly at the top.\nProgress with control before adding difficulty.`, isolation()),
      ex(pushBMap[8]!, 60, `3 controlled sets of 12–15.\nTilt pelvis upward.\nDo not swing the legs.\nControl the lowering phase.\nKeep lower back stable.`, isolation()),
      treadmill(`20 minutes incline treadmill walking.\nModerate sustainable effort.\nThis is not a strength-progression exercise.`),
    ],
  },
};

const pullBPayload = {
  routine: {
    title: "Pull B",
    folder_id: FOLDER_ID,
    notes: `Primary: Back Thickness\nSecondary: Biceps and Rear Delts\n\nThis is the second pull day of the week.\nUse renowned, simple pulling movements.\nThis day should be more row-focused than Pull A.\n\nProgram rules:\n- Compounds: 3×8–10. Isolations/abs: 3×12–15.\n- Finish with 20 min incline treadmill.\n- Progress compounds after 10/10/10; isolations after 15/15/15.\n- Normal sets only. No warm-ups. Starting weight unset.`,
    exercises: [
      ex(pullBMap[0]!, 150, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nKeep torso stable.\nPull handle toward lower ribs.\nControl the stretch.\nDo not rock excessively.`, compound()),
      ex(pullBMap[1]!, 150, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nKeep chest supported.\nPull elbows back.\nSqueeze shoulder blades.\nAvoid jerking the weight.`, compound()),
      ex(pullBMap[2]!, 150, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nKeep chest tall.\nPull elbows down.\nControl the stretch at the top.\nDo not use momentum.`, compound()),
      ex(pullBMap[3]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nKeep upper arms fixed.\nFull controlled stretch.\nDo not bounce at the bottom.\nFinal set may approach technical failure.`, isolation()),
      ex(pullBMap[4]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nKeep elbows close.\nControl the negative.\nAvoid swinging.\nMaintain cable tension.`, isolation()),
      ex(pullBMap[5]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nLead with elbows.\nKeep traps relaxed.\nPause briefly at peak contraction.\nDo not use momentum.`, isolation()),
      ex(pullBMap[6]!, 60, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nPull rope toward face.\nKeep elbows high.\nExternally rotate slightly at the end.\nDo not overload at the cost of form.`, isolation()),
      ex(pullBMap[7]!, 60, `3 controlled sets of 12–15.\nFlex the spine rather than pulling with the arms.\nControl the eccentric.\nProgress after clean 15/15/15.\nAvoid shortened-range reps.`, isolation()),
      ex(pullBMap[8]!, 60, `3 controlled holds of 30–45 seconds.\nKeep ribs down.\nSqueeze glutes lightly.\nDo not let lower back sag.\nStop the set when form breaks.`, [
        { type: "normal" as const, duration_seconds: 45 },
        { type: "normal" as const, duration_seconds: 45 },
        { type: "normal" as const, duration_seconds: 45 },
      ]),
      treadmill(`20 minutes incline treadmill walking.\nModerate sustainable effort.\nThis is not a strength-progression exercise.`),
    ],
  },
};

const legsPayload = {
  routine: {
    title: "Legs",
    folder_id: FOLDER_ID,
    notes: `Primary: Legs\nSecondary: Hamstrings/Posterior Chain and Calves\n\nThis is the Saturday leg day.\nUse renowned, standard leg exercises.\nKeep it effective but not overly complicated.\n\nProgram rules:\n- Compounds: 3×8–10. Isolations/abs: 3×12–15.\n- Finish with 20 min incline treadmill.\n- Progress compounds after 10/10/10; isolations after 15/15/15.\n- Normal sets only. No warm-ups. Starting weight unset.`,
    exercises: [
      ex(legsMap[0]!, 180, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nUse controlled depth.\nKeep knees tracking over toes.\nDo not lock knees aggressively.\nKeep lower back stable.`, compound()),
      ex(legsMap[1]!, 180, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nKeep braced.\nUse controlled depth.\nDo not train to failure.\nStop if lower back or knee pain appears.`, compound()),
      ex(legsMap[2]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nControl the squeeze at the top.\nDo not swing the weight.\nUse full range where comfortable.\nAvoid knee pain.`, isolation()),
      ex(legsMap[3]!, 180, `3 working sets of 8–10.\nProgress after clean 10/10/10.\nHinge at hips.\nKeep back neutral.\nFeel hamstring stretch.\nDo not turn it into a squat.\nDo not train to failure.`, compound()),
      ex(legsMap[4]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nControl the squeeze.\nControl the eccentric.\nAvoid bouncing.\nFull range where comfortable.`, isolation()),
      ex(legsMap[5]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nPause at the top.\nControl the stretch.\nAvoid bouncing.\nUse full range.`, isolation()),
      ex(legsMap[6]!, 75, `3 working sets of 12–15.\nProgress after clean 15/15/15.\nPause at the top.\nControl the bottom stretch.\nDo not bounce.\nKeep reps clean.`, isolation()),
      ex(legsMap[7]!, 60, `3 controlled sets of 12–15.\nCurl ribs toward pelvis.\nDo not pull the neck.\nPause briefly at the top.\nProgress with control before adding difficulty.`, isolation()),
      ex(legsMap[8]!, 60, `3 controlled sets of 12–15.\nTilt pelvis upward.\nDo not swing the legs.\nControl the lowering phase.\nKeep lower back stable.`, isolation()),
      treadmill(`20 minutes incline treadmill walking.\nEasy-to-moderate pace after legs.\nThis is recovery cardio, not a performance test.`),
    ],
  },
};

const out = {
  folder: { id: folder.id, title: folder.title },
  existingCheck,
  pushBMap,
  pullBMap,
  legsMap,
  payloads: { pushB: pushBPayload, pullB: pullBPayload, legs: legsPayload },
};

writeFileSync("/tmp/ppl-preflight.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
