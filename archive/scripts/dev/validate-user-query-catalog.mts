/**
 * Dev helper: validate catalog metadata and explicit meal: protocol.
 * Routing hints are LLM-parsed — run integration tests for signal accuracy.
 * Usage: npx tsx scripts/dev/validate-user-query-catalog.mts
 */
import { USER_QUERY_CATALOG } from "../../src/capabilities/userQueryCatalog.ts";
import { parseMealLogCommand } from "../../src/meals/parseMealLogCommand.ts";

let mismatches = 0;
for (const entry of USER_QUERY_CATALOG) {
  const meal = parseMealLogCommand(entry.query).kind === "meal";

  if (entry.hints.explicit_meal_log && !meal) {
    console.log(`MEAL PARSE MISMATCH ${entry.query}`);
    mismatches++;
  }
  if (!entry.idealIntent || !entry.idealCapability) {
    console.log(`MISSING IDEAL METADATA ${entry.query}`);
    mismatches++;
  }
}

console.log(`Catalog size: ${USER_QUERY_CATALOG.length}`);
console.log(`Mismatches: ${mismatches}`);
process.exit(mismatches > 0 ? 1 : 0);
