/**
 * Read-only preflight for Pull A routine creation.
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
const ROUTINE_TITLE = "Pull A";

const base = hevyApiBaseUrl().replace(/\/$/, "");

// 1. Verify folder
const folderRes = await fetch(`${base}/v1/routine_folders?page=1&pageSize=10`, {
  headers: { "api-key": apiKey, Accept: "application/json" },
});
const folderJson = (await folderRes.json()) as {
  routine_folders?: { id: number; title?: string }[];
  error?: string;
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

// 2. Read existing routines (paginate)
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
const pullAInFolder = allRoutines.filter(
  (r) => (r.title ?? "").trim() === ROUTINE_TITLE && r.folder_id === EXPECTED_FOLDER_ID,
);
console.log(
  "ROUTINES_CHECK",
  JSON.stringify({
    total: allRoutines.length,
    pull_a_in_hevy_coach: pullAInFolder.length,
    existing: pullAInFolder.map((r) => ({ id: r.id, title: r.title })),
  }),
);
if (pullAInFolder.length > 0) {
  console.error("DUPLICATE: Pull A already exists in Hevy Coach folder");
  process.exit(1);
}

// 3. Exercise template catalog
const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 20 });
if (!catalog.ok) {
  console.error("CATALOG_FAILED", catalog.error);
  process.exit(1);
}
const standard = catalog.templates.filter((t) => !t.id.includes("-"));
const byTitle = new Map(catalog.templates.map((t) => [t.id, t.title]));

function findAll(pattern: RegExp, preferStandard = true) {
  const pool = preferStandard ? standard : catalog.templates;
  return pool.filter((t) => pattern.test(t.title));
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

function pick(
  requested: string,
  pattern: RegExp,
  reasonExact: string,
  reasonSub: string,
  altPatterns: RegExp[] = [],
): Mapping {
  const hits = findAll(pattern);
  const alts = altPatterns.flatMap((p) => findAll(p).map((t) => `${t.title} (${t.id})`));
  // exact title match (case insensitive)
  const exact = hits.find((t) => t.title.toLowerCase() === requested.toLowerCase());
  if (exact) {
    return {
      requested,
      hevyTitle: exact.title,
      id: exact.id,
      matchType: "exact",
      reason: reasonExact,
      alternatives: alts.filter((a) => !a.startsWith(exact.title)),
    };
  }
  if (hits.length === 1) {
    return {
      requested,
      hevyTitle: hits[0]!.title,
      id: hits[0]!.id,
      matchType: "substitution",
      reason: reasonSub,
      alternatives: alts.filter((a) => !a.startsWith(hits[0]!.title)),
    };
  }
  if (hits.length > 1) {
    // prefer shortest / most standard name
    const sorted = [...hits].sort((a, b) => a.title.length - b.title.length);
    const primary = sorted[0]!;
    const material = hits.filter(
      (h) =>
        /close grip|machine|band|underhand|reverse grip|wide/i.test(h.title) &&
        h.id !== primary.id,
    );
    if (material.length > 0 && !/close grip|machine/i.test(primary.title)) {
      return {
        requested,
        hevyTitle: primary.title,
        id: primary.id,
        matchType: "substitution",
        reason: `${reasonSub} (chosen among ${hits.length} matches)`,
        alternatives: hits.filter((h) => h.id !== primary.id).map((h) => `${h.title} (${h.id})`),
      };
    }
    return {
      requested,
      hevyTitle: primary.title,
      id: primary.id,
      matchType: hits.length > 1 ? "substitution" : "exact",
      reason: reasonSub,
      alternatives: hits.filter((h) => h.id !== primary.id).map((h) => `${h.title} (${h.id})`),
    };
  }
  return {
    requested,
    hevyTitle: "NOT FOUND",
    id: "MISSING",
    matchType: "ambiguous",
    reason: "No template matched",
    alternatives: alts,
  };
}

// 1. Neutral-Grip Lat Pulldown — no exact neutral template; cable is standard
const neutralHits = findAll(/lat pulldown/i);
const neutralCable = neutralHits.find((t) => /^Lat Pulldown \(Cable\)$/i.test(t.title));
const neutralClose = neutralHits.find((t) => /close grip/i.test(t.title));
const neutralMachine = neutralHits.find((t) => /machine/i.test(t.title) && /lat pulldown/i.test(t.title));
if (neutralCable) {
  mappings.push({
    requested: "Neutral-Grip Lat Pulldown",
    hevyTitle: neutralCable.title,
    id: neutralCable.id,
    matchType: "substitution",
    reason:
      "No Hevy template names neutral grip. Lat Pulldown (Cable) is the standard template for neutral/V-bar cable pulldowns (back width).",
    alternatives: [neutralClose, neutralMachine]
      .filter(Boolean)
      .map((t) => `${t!.title} (${t!.id})`),
  });
} else {
  mappings.push({
    requested: "Neutral-Grip Lat Pulldown",
    hevyTitle: "NOT FOUND",
    id: "MISSING",
    matchType: "ambiguous",
    reason: "No cable lat pulldown template",
    alternatives: neutralHits.map((t) => `${t.title} (${t.id})`),
  });
}

// 2. Assisted Pull-Up
mappings.push(
  pick(
    "Assisted Pull-Up",
    /pull up \(assisted\)|assisted pull/i,
    "Exact match: Pull Up (Assisted).",
    "Closest assisted pull-up template.",
    [/pull up \(band\)/i],
  ),
);

// 3. One-Arm Cable Lat Pulldown
const oneArm = findAll(/single arm lat pulldown|one arm lat pulldown/i);
if (oneArm.length === 1) {
  mappings.push({
    requested: "One-Arm Cable Lat Pulldown",
    hevyTitle: oneArm[0]!.title,
    id: oneArm[0]!.id,
    matchType: "substitution",
    reason:
      "Single Arm Lat Pulldown is the standard Hevy unilateral lat pulldown template (cable implied).",
    alternatives: findAll(/one.?arm.*pulldown/i).map((t) => `${t.title} (${t.id})`),
  });
} else if (oneArm.length > 1) {
  mappings.push({
    requested: "One-Arm Cable Lat Pulldown",
    hevyTitle: oneArm[0]!.title,
    id: oneArm[0]!.id,
    matchType: "ambiguous",
    reason: "Multiple one-arm pulldown templates",
    alternatives: oneArm.map((t) => `${t.title} (${t.id})`),
  });
} else {
  mappings.push({
    requested: "One-Arm Cable Lat Pulldown",
    hevyTitle: "NOT FOUND",
    id: "MISSING",
    matchType: "ambiguous",
    reason: "No one-arm lat pulldown template",
    alternatives: [],
  });
}

// 4-10
mappings.push(
  pick(
    "Incline Dumbbell Curl",
    /incline curl.*dumbbell|seated incline curl.*dumbbell/i,
    "Exact/semi-exact incline dumbbell curl.",
    "Seated Incline Curl (Dumbbell) — minor naming difference (seated).",
    [/incline.*hammer/i],
  ),
);
mappings.push(
  pick(
    "Dumbbell Hammer Curl",
    /^Hammer Curl \(Dumbbell\)$/i,
    "Exact match: Hammer Curl (Dumbbell).",
    "Closest dumbbell hammer curl.",
    [/hammer curl/i],
  ),
);
mappings.push(
  pick(
    "Reverse Pec Deck",
    /rear delt reverse fly \(machine\)|reverse pec deck/i,
    "Rear Delt Reverse Fly (Machine) is the pec-deck rear-delt machine.",
    "Substitution: Hevy names the reverse pec deck machine Rear Delt Reverse Fly (Machine).",
    [/rear delt reverse fly/i],
  ),
);
mappings.push(
  pick(
    "Face Pull",
    /^Face Pull$/i,
    "Exact match: Face Pull.",
    "Closest face pull template.",
    [/face pull/i],
  ),
);
mappings.push(
  pick(
    "Ab Wheel Rollout",
    /^Ab Wheel$/i,
    "Ab Wheel is Hevy's standard ab wheel rollout template.",
    "Substitution: Hevy shortens name to Ab Wheel.",
    [/ab wheel/i],
  ),
);
mappings.push(
  pick(
    "Lying Leg Raise",
    /^Lying Leg Raise$/i,
    "Exact match: Lying Leg Raise.",
    "Closest lying leg raise template.",
    [/lying leg raise/i],
  ),
);
mappings.push(
  pick(
    "Treadmill",
    /^Treadmill$/i,
    "Exact match: Treadmill.",
    "Closest treadmill template.",
    [/treadmill/i],
  ),
);

const missing = mappings.filter((m) => m.id === "MISSING");
const ambiguous = mappings.filter((m) => m.matchType === "ambiguous");

console.log("\nMAPPING_TABLE_JSON");
console.log(JSON.stringify(mappings, null, 2));

if (missing.length > 0 || ambiguous.length > 0) {
  console.error("BLOCKED", { missing: missing.length, ambiguous: ambiguous.length });
  process.exit(1);
}

// Build payload
const payload = {
  routine: {
    title: ROUTINE_TITLE,
    folder_id: EXPECTED_FOLDER_ID,
    notes: `Primary: Back Width
Secondary: Biceps and Rear Delts

This is a main strength day.

Program rules:
- Compound exercises: 3 working sets of 8–10 reps.
- Isolation exercises: 3 working sets of 12–15 reps.
- Abs: 3 controlled sets of 12–15 reps.
- Finish with 20 minutes incline treadmill walking.
- Progress compounds only after clean 10/10/10.
- Progress isolations only after clean 15/15/15.
- Otherwise retain weight and improve total reps or execution.
- Starting weight should be unset for all exercises.
- Do not add warm-up sets for now.
- Do not prescribe failure sets in the routine. Use normal sets only.`,
    exercises: [
      {
        exercise_template_id: mappings[0]!.id,
        rest_seconds: 150,
        notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Pull elbows down toward ribs.
Keep chest tall.
Do not turn it into a row.
Control the stretch at the top.`,
        sets: [
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
        ],
      },
      {
        exercise_template_id: mappings[1]!.id,
        rest_seconds: 150,
        notes: `3 working sets of 8–10.
Progress after clean 10/10/10.
Use controlled full-range reps.
Avoid kicking or swinging.
Reduce assistance over time after hitting the top of the rep range.`,
        sets: [
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
        ],
      },
      {
        exercise_template_id: mappings[2]!.id,
        rest_seconds: 120,
        notes: `3 working sets of 8–10 each side.
Progress after clean 10/10/10.
Pull elbow down and slightly back.
Keep torso stable.
Do not twist to move the weight.
Match reps on both sides.`,
        sets: [
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
          { type: "normal", rep_range: { start: 8, end: 10 } },
        ],
      },
      {
        exercise_template_id: mappings[3]!.id,
        rest_seconds: 75,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Keep upper arms back.
Full stretch at the bottom.
Avoid swinging.
Final set may approach technical failure.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[4]!.id,
        rest_seconds: 75,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Keep wrists neutral.
Do not swing the dumbbells.
Control the lowering phase.
Final set may approach technical failure.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[5]!.id,
        rest_seconds: 75,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Lead with elbows.
Keep traps relaxed.
Pause briefly at peak contraction.
Do not use momentum.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[6]!.id,
        rest_seconds: 60,
        notes: `3 working sets of 12–15.
Progress after clean 15/15/15.
Pull rope toward face.
Elbows high.
Externally rotate slightly at the end.
Do not overload at the cost of form.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[7]!.id,
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Keep ribs down.
Do not let lower back sag.
Use shorter range if needed.
Increase range before adding difficulty.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[8]!.id,
        rest_seconds: 60,
        notes: `3 controlled sets of 12–15.
Avoid swinging.
Control the lowering phase.
Keep lower back stable.
Progress after clean 15/15/15.`,
        sets: [
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
          { type: "normal", rep_range: { start: 12, end: 15 } },
        ],
      },
      {
        exercise_template_id: mappings[9]!.id,
        notes: `20 minutes incline treadmill walking.
Moderate sustainable effort.
This is not a strength-progression exercise.`,
        sets: [{ type: "normal", duration_seconds: 1200 }],
      },
    ],
  },
};

console.log("\nPAYLOAD_JSON");
console.log(JSON.stringify(payload, null, 2));
