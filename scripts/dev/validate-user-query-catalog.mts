/**
 * Dev helper: compute routing signals for catalog entries and flag mismatches.
 * Usage: npx tsx scripts/dev/validate-user-query-catalog.mts
 */
import { USER_QUERY_CATALOG } from "../../src/capabilities/userQueryCatalog.ts";
import { buildIntentRoutingHints } from "../../src/agents/routing/intentRoutingHints.ts";
import { looksLikeMagnusToolAction } from "../../src/agents/tools/magnusActionDetect.ts";
import { looksLikeYoutubeAction } from "../../src/agents/tools/youtubeActionDetect.ts";
import { parseMealLogCommand } from "../../src/meals/parseMealLogCommand.ts";

let mismatches = 0;
for (const entry of USER_QUERY_CATALOG) {
  const hints = buildIntentRoutingHints(entry.query);
  const magnus = looksLikeMagnusToolAction(entry.query);
  const youtube = looksLikeYoutubeAction(entry.query);
  const meal = parseMealLogCommand(entry.query).kind === "meal";

  for (const [key, expected] of Object.entries(entry.hints)) {
    const actual = hints[key as keyof typeof hints];
    if (actual !== expected) {
      console.log(`HINT MISMATCH [${key}] ${entry.query}`);
      console.log(`  expected ${expected}, got ${actual}`);
      mismatches++;
    }
  }
  if (entry.magnusTools !== undefined && magnus !== entry.magnusTools) {
    console.log(`MAGNUS MISMATCH ${entry.query}`);
    console.log(`  expected ${entry.magnusTools}, got ${magnus}`);
    mismatches++;
  }
  if (entry.youtubeAction !== undefined && youtube !== entry.youtubeAction) {
    console.log(`YOUTUBE MISMATCH ${entry.query}`);
    console.log(`  expected ${entry.youtubeAction}, got ${youtube}`);
    mismatches++;
  }
  if (entry.hints.explicit_meal_log && !meal) {
    console.log(`MEAL PARSE MISMATCH ${entry.query}`);
    mismatches++;
  }
}

console.log(`Catalog size: ${USER_QUERY_CATALOG.length}`);
console.log(`Mismatches: ${mismatches}`);
process.exit(mismatches > 0 ? 1 : 0);
