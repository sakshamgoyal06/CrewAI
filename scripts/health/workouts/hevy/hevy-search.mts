import "dotenv/config";
import { fetchHevyExerciseTemplateCatalog } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const key = hevyApiKeyFromEnv();
if (!key) process.exit(1);
const c = await fetchHevyExerciseTemplateCatalog(key, { maxPages: 20 });
const s = c.templates!.filter((t) => !t.id.includes("-"));
const terms = [
  "row", "chest supported", "seal", "t-bar", "machine row",
  "triceps pushdown", "pushdown", "preacher",
  "leg press", "squat (barbell)", "romanian", "calf raise", "cable curl",
];
for (const term of terms) {
  const hits = s.filter((t) => t.title.toLowerCase().includes(term.toLowerCase()));
  if (hits.length) {
    console.log(`--- ${term} ---`);
    hits.forEach((h) => console.log(h.id, h.title));
  }
}
