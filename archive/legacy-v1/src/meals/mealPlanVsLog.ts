/**
 * Shared rules: meal **planning** (future menu) vs meal **logging** (what was eaten).
 * Include in nutrition, planning, parser, compose, and classifier prompts.
 */
export const MEAL_PLAN_VS_LOG_RULES = `**Meal plan vs meal log (critical):**
- **Meal plan** = future or draft menu (breakfast/lunch/dinner titles). Stored in \`meal_plan_entries\`. **Never** counts toward daily calorie or macro totals unless the user explicitly asks for plan estimates.
- **Meal log** = food the user actually ate, saved via \`meal_log\` with calories/macros in \`meal_logs\`. **Only** logged meals count toward "today's total", targets, and history.
- Describing what you will eat, a locked plan, or a draft menu is **not** logging. Logging requires a successful meal_log save (\`meal_session_id\`).
- When showing both: label **Planned** and **Logged** separately. Do not sum planned meals into logged totals. Do not invent calories for planned dishes.`;

export const MEAL_LOG_ONLY_TOTALS_RULE =
  "Daily calorie and macro totals come **only** from meal_logs (successfully saved this turn or earlier today). Planned meals never add to those totals.";

/** Short architecture blurb for classifiers and specialists that touch food. */
export const MEAL_DATA_ARCHITECTURE = `**Meal data architecture:**
- \`meal_plan_entries\` — planned menu (titles per slot). Read via meal_plan_* capabilities. No daily kcal totals.
- \`meal_logs\` — what was eaten (macros per save). Written only by meal_log / meal_log_photo / meal_log_correct. Source of daily totals.
- Never treat a plan title as a log. Never mark a plan slot "logged" unless a matching meal_log was saved.`;
