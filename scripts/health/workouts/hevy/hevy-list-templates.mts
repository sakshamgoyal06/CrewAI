/**
 * Read-only: dump Hevy exercise template catalog as JSON.
 */
import "dotenv/config";
import { fetchHevyExerciseTemplateCatalog } from "../../../../src/pillars/health/workouts/hevy/hevyClient.js";
import { hevyApiKeyFromEnv } from "../../../../src/pillars/health/workouts/hevy/hevyEnv.js";

const apiKey = hevyApiKeyFromEnv();
if (!apiKey) {
  console.error("Missing HEVY_API_KEY");
  process.exit(1);
}

const catalog = await fetchHevyExerciseTemplateCatalog(apiKey, { maxPages: 20 });
if (!catalog.ok) {
  console.error(catalog.error);
  process.exit(1);
}

console.log(JSON.stringify(catalog.templates, null, 2));
