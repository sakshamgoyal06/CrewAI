# Magnus food database

Magnus answers meal logs from its own food catalog first, so most meals need no paid web or
model lookup. The catalog ships with the code in `src/meals/catalog/`, is reviewed in pull
requests, and is checked by tests. Plan and sizing:
[Magnus food database plan](https://claude.ai/artifact/Vh9vaCxdDFADiwpctq49zB).

## How a meal is resolved

`estimateWithFoodDb` (src/meals/foodDbEstimate.ts), item by item:

1. **Catalog** (`resolveCatalogItem`): name or alias → food; the amount → grams through the
   food's household measures ("2 medium roti" = 2 × 40 g, "half katori dal" = 75 g,
   "200 g paneer"). Size words (small, medium, large, big) pick the matching measure, or scale
   the usual one. "X with Y" is split when X and Y are both in the catalog.
2. **Supabase tables** (`food_nutrition`, `food_recipes`): the old seed and foods learned from
   earlier web lookups. Only items the catalog missed are looked up.
3. **Web breakdown** (paid): only for what's still missing. Each catalog miss is logged as a
   `food_gap` event in `health_app_events`, so the next batch builds what people actually eat.

## Data format

- `data/foods.ts`: whole foods and components. Numbers per 100 g (or 100 ml with
  `basis: "100ml"`): kcal, protein, carbs, fat, fibre. `source` says where they came from.
- `data/dishes.ts`: dishes as recipes. Raw ingredients in grams for one batch (catalog names,
  including the oil or ghee), plus `cookedGrams`, the weight of the finished batch. Numbers are
  computed; never type them in. A dish may use an earlier dish ("rajma chawal" = rajma + rice).
- Every entry has 1–5 `servings` in the way it's measured at home (katori, piece, plate, glass,
  cup, tbsp, tsp, ladle, handful, scoop, slice), each with its weight, and exactly one
  `default` (used when no amount is given).
- `aliases`: Hindi and regional names, common spellings, and generic words that should mean
  this food ("dal" → dal tadka, "rice" → cooked white rice). An alias may point at only one food.

## Sources and licences

| Source | Use |
| --- | --- |
| USDA FoodData Central (public domain) | Per-100 g values for whole foods. Put the exact USDA description in `source`. |
| IFCT 2017 (ICMR-NIN, copyrighted) | Cross-check only. Don't copy values. |
| Indian Nutrient Databank (no data licence) | Cross-check only. Don't copy values. |
| Open Food Facts (ODbL) | Not used. Copying it in would oblige us to publish the table. |
| HealthifyMe | Serving conventions only (what a katori or a medium roti weighs). No numbers. |

The cloud sessions block fdc.nal.usda.gov. Get the USDA data from the `pyfooda` wheel on PyPI
instead: its `pyfooda/data/fooddata.csv` holds USDA FoodData Central rows with descriptions
and per-100 g values. Download it into a scratch folder (never the repo) and read it with
`python3 -I`. Prefer `sr_legacy_food` and `foundation_food` rows, then `survey_fndds_food` rows
for cooked forms ("Rice, white, cooked, no added fat").

## The food DB agent: building a batch

Any Claude Code session can run this on the Claude subscription. Never call the Anthropic API
or the Batch API for it, and add nothing that costs money.

1. **Pick about 50 foods.** Start with the most-missed gaps:
   ```sql
   select name, count(*) as misses, max(props->>'phrase') as example
   from health_app_events
   where kind = 'food_gap' and occurred_at > now() - interval '30 days'
   group by name order by misses desc limit 60;
   ```
   Then take the next group from the plan's scope table (regional dishes, snacks, sweets,
   restaurant staples).
2. **Whole foods:** look up USDA, choose the form people actually eat (cooked, not raw, for rice),
   and add 2–5 servings with honest weights.
3. **Dishes:** write the standard home recipe for one batch in grams (oil and ghee included),
   weigh out the cooked batch, and add servings. Add any missing ingredient to `foods.ts` first.
4. **Aliases:** Hindi names, regional names and spellings people type.
5. **Check:** `npx vitest run src/meals`. `catalog.test.ts` checks for duplicates, impossible
   values, calories that don't match the macros, serving weights, sizes and recipe sanity.
   Add 5–10 new golden meals to `golden.test.ts` for the batch, with ranges from typical values.
6. **Spot-check** 5 items against IFCT 2017 or INDB by hand. If one is more than 15% off,
   investigate and note why in the PR.
7. **Open one PR per batch** with a table of the new foods and their default-serving calories.

## Measuring success

Each meal estimate logs `catalog_items` and `food_db_items` in `providerRaw`. Look at the share
of items answered without the web over time; the target after the first build is 90%.
