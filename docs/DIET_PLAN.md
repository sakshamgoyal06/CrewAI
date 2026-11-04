# Diet plan

Plan doc: https://claude.ai/artifact/2hkp25L1E3hpigQjuiSFFk (decided with Saksham, 2026-11-04).

Code lives in `src/healthApp/dietPlan/`:

| File | What it does |
| --- | --- |
| `targets.ts` | Splits the profile's calorie and protein targets into fat (28%, min 0.6 g/kg), carbs (the rest) and fibre (14 g per 1,000 kcal), then into one budget per meal. The plan never sets its own calories. |
| `prefs.ts` | Setup answers: meals and times, share of the day, cooking time per meal, who cooks, kitchen, staples, loves, restrictions, fasting days, eat-out meals. |
| `compose.ts` | 5 to 8 options per meal from usual meals and the food catalog, portioned in household units to within 10% of the budget. Pairing rules (no roti with cheela, no rice with a rice dish, no paneer twice) and variety rules. |
| `pick.ts` | The rolling 3-day plan: pinned options every day, no repeat within 3 days, eat-out meals as a budget. |
| `adjust.ts` | Same-day rebalance after an off-plan meal (moves the base: roti, rice), and the day close (a miss outside 85–105% is spread over 2 days, max 200 kcal a day, never under the floor, protein unchanged). |
| `review.ts`, `build.ts` | Optional Haiku review of each new plan (variety, pairings, calories); flagged options are dropped, refilled and the new ones checked once. |
| `store.ts` | Supabase storage and the API service calls. Day picks are rows in `meal_plan_entries` (source `plan`). |

Tables: `health_diet_preferences`, `health_diet_plans`, `health_diet_plan_options`, `health_diet_adjustments` (migration `20261104150000_health_diet_plan.sql`).

API (bearer auth, under `/api/health`):

- `GET /diet/plan`: setup answers, the active plan and the 3 days. Builds the plan on first open after setup and rebuilds it when the profile's targets changed.
- `GET /diet/prefs`, `PUT /diet/prefs`: setup answers; saving rebuilds the plan.
- `POST /diet/plan/rebuild`
- `POST /diet/options/:id` with `{ action: pin | unpin | like | unlike | hide | unhide }`
- `POST /diet/days/:date/:slot/swap` with `{ optionId }`

Settings:

- `MAGNUS_PLAN_REVIEW=on` switches on the model review. Off by default: it adds about ₹15 per user a month (estimate) and needs Saksham's OK on cost first.
