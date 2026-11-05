# Diet plan

Plan doc: https://claude.ai/artifact/2hkp25L1E3hpigQjuiSFFk (decided with Saksham, 2026-11-04).

Code lives in `src/healthApp/dietPlan/`:

| File | What it does |
| --- | --- |
| `targets.ts` | Splits the profile's calorie and protein targets into fat (28%, min 0.6 g/kg), carbs (the rest) and fibre (14 g per 1,000 kcal), then into one budget per meal. The plan never sets its own calories. |
| `prefs.ts` | Setup answers: meals and times, share of the day, cooking time per meal, who cooks, kitchen, staples, loves, restrictions, fasting days, eat-out meals. |
| `compose.ts` | 5 to 8 options per meal from usual meals and the food catalog, portioned in household units to within 10% of the budget, protein weighted above calories. Pairing rules (no roti with cheela, no rice with a rice dish, no paneer twice, one curd item per meal, dosa with sambar or chutney, a protein side only with dal or a veg dish) and variety rules (at most two plain dals per meal). When too few meals fit the cooking time, the limit steps up (10, 20, 30 minutes) and the quick ones stay first. No kitchen means mess or canteen food, so no cooking limit. |
| `pick.ts` | The rolling 3-day plan: pinned options every day, no repeat within 3 days, eat-out meals as a budget. |
| `adjust.ts` | Same-day rebalance after an off-plan meal (moves the base: roti, rice), and the day close (a miss outside 85–105% is spread over 2 days, max 200 kcal a day, never under the floor, protein unchanged). |
| `review.ts`, `build.ts` | Optional Haiku review of each new plan (variety, pairings, calories); flagged options are dropped, refilled and the new ones checked once. |
| `store.ts` | Supabase storage and the API service calls. Day picks are rows in `meal_plan_entries` (source `plan`). |
| `edit.ts` | The meal editor: saves a planned meal's items (portions, removed items, foods added from the catalog) and searches foods to add. Search and every added food go through `restrictionCheck` (compose.ts), the same diet, avoid-list and meat-limit check the planner uses. An edited meal keeps its own title (`metadata.edited`). |
| `log.ts` | "Ate this": logs a planned meal (with any portion changes) and links it to its entry; undo; a meal deleted from Today puts its entry back to planned. |
| `rhythm.ts` | Through the day, no model call: today's meals on the morning card; a chat card and push at each meal's time; after a meal logged outside "Ate this", the entry is marked eaten off plan and the rest of today is resized; the day close at 9:45 pm (needs 2+ meals logged) with tomorrow's meals. |
| `carry.ts` | Applies day-close carry-overs (`health_diet_adjustments`) to planned meals once each (`metadata.carry_from`), including meals planned later. |
| `chatTool.ts` | The coach's `meal_plan` tool: view, ate, swap, pin/unpin/like/hide, rebuild. Food that isn't the plan stays `draft_meal`. |
| `adherence.ts` | Planned meals eaten as planned, with changed portions, off plan or not logged, and the meal that slips 4+ of 7 days. Shown in the weekly review and, when a meal slips, the morning card. |

## On-track food rule

From 2026-11-05 (`northStar.ts` `FOOD_RULE_FROM`), a day's food is on track on calories and macros, not meal count: calories 85–105% of target, protein at least 90%, carbs and fat each within 25% of the plan's targets. Earlier days keep the old rule (3 meals, 60–100%, full protein) so past weeks don't change.

Tables: `health_diet_preferences`, `health_diet_plans`, `health_diet_plan_options`, `health_diet_adjustments` (migration `20261104150000_health_diet_plan.sql`).

API (bearer auth, under `/api/health`):

- `GET /diet/plan`: setup answers, the active plan and the 3 days. Builds the plan on first open after setup and rebuilds it when the profile's targets changed.
- `GET /diet/prefs`, `PUT /diet/prefs`: setup answers; saving rebuilds the plan.
- `POST /diet/plan/rebuild`
- `POST /diet/options/:id` with `{ action: pin | unpin | like | unlike | hide | unhide }`
- `POST /diet/days/:date/:slot/swap` with `{ optionId }`
- `PUT /diet/days/:date/:slot/items` with `{ items: [{ keep: index, qty } | { servingId, qty }] }`: saves an edited planned meal (not yet eaten). Refuses a food outside the person's restrictions (`not_allowed`).
- `GET /diet/foods?slot=&q=`: foods to add to a meal, filtered by the person's restrictions; an empty `q` suggests foods usually eaten at that meal.

In the app, every "Change or swap" (the chat meal card, the Today food card, each meal on the Meals tab, the day plan's meal list) opens the same meal editor: live calories and protein/carbs/fat against the meal's target, portions, remove, add a food, swap for another option, Save or Save and mark eaten.

Checking plan quality without API spend: `npx tsx scripts/dietPlanSample.ts` (needs any SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY values; nothing is called) prints plans for 8 sample people in the text the model review reads, plus each one's typical and best day of protein. Review it in a Claude session, fix what code rules can catch, and rerun.

Settings:

- `MAGNUS_PLAN_REVIEW=on` switches on the model review. Off by default: it adds about ₹15 per user a month (estimate) and needs Saksham's OK on cost first.

## Food rules: every source reaches the plan

`src/healthApp/dietPlan/rules.ts` gathers every food rule into one `PlanRules`. The planner (`build.ts`), the 3-day picks (`pick.ts` via `ensureDays`), swaps and the meal editor all read it, so a rebuild or "Make me a fresh plan" can't drop one.

| Source | Where it lives | How the plan keeps it |
| --- | --- | --- |
| Diet, diet note, foods to avoid | `user_health_profile` (Settings, onboarding) | every day |
| "Anything else to keep in mind" lines | `prefs.restrictions` | foods named after "no / avoid / allergic to …" are avoided; a line naming a weekday applies on that day only ("no non veg on Thursdays") |
| Fasting days | `prefs.fastingDays` | fasting-safe options are made for those days (`compose.ts fastingSafe`); a meal with none is a "Fasting meal" allowance |
| Temporary diet or foods ("veg only 20 days") | `prefs.dietOverride` (coach: `meal_plan diet_period`) | narrows the diet until `until`, then ends on its own |
| Lasting food to avoid said in chat | coach: `meal_plan avoid` → food settings | every day |

Rebuilds keep meals the person edited or swapped by hand unless they now break a rule; only "Make me a fresh plan" replaces them. Coach memory is for context only: a food rule must go through `meal_plan` to change the plan.
