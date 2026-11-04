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

### Units and joined names

- **Plate:** a food with no plate measure gets one at 1½ katori (katori foods), 2 pieces (piece
  foods like dosa or samosa) or one usual serving. Packs, packets, tins, cans and pegs mean one
  usual serving of that food ("1 packet maggi", "1 peg whisky").
- **Joined names:** "fish curry rice" or "dal rice" (two catalog foods typed together, with no
  "with") split into two items when the whole isn't a catalog food and both halves are. The
  amount goes to the first, the second is one usual serving.
- **Phrase coverage:** `phraseCoverage.test.ts` runs about 270 phrases people really type
  through the catalog. Add the phrases behind any new gap there; the test fails if one needs the web.

## Data format

- `data/foods.ts`: whole foods and components. Numbers per 100 g (or 100 ml with
  `basis: "100ml"`): kcal, protein, carbs, fat, fibre. `source` says where they came from.
- `data/dishes.ts`: dishes as recipes. Raw ingredients in grams for one batch (catalog names,
  including the oil or ghee), plus `cookedGrams`, the weight of the finished batch. Numbers are
  computed; never type them in. A dish may use an earlier dish ("rajma chawal" = rajma + rice).
- Every entry has 1–5 `servings` in the way it's measured at home (katori, piece, plate, glass,
  cup, tbsp, tsp, ladle, handful, scoop, slice), each with its weight, and exactly one
  `default` (used when no amount is given).
- `meals`: when it's usually eaten (breakfast, lunch, dinner, snack). Defaults come from the
  category (`MEALS_BY_CATEGORY`); set it only when a food differs. The diet planner uses it.
- `prepMinutes`: home prep time, 0 (ready to eat or ordered), 10, 20 or 30 (meaning 30+). Every
  dish has one in `PREP` (data/dishes.ts); fruit, nuts, dairy and drinks default to 0. The diet
  planner filters options by it.
- `ordered`: true for food people usually buy or order rather than cook (restaurant breads,
  street food, pizza, Indo-Chinese, mithai). These keep `prepMinutes` 0, and the planner offers
  them only for eat-out meals. List dishes in `ORDERED` (data/dishes.ts); set it on a food directly.
- Stable ids: a food's id is its normalized name (`key`, e.g. "dal tadka") and a serving's id is
  `servingId()` ("roti:piece:medium"). Don't rename a food once plans may reference it; add the
  old name as an alias instead.
- `aliases`: Hindi and regional names, common spellings, and generic words that should mean
  this food ("dal" → dal tadka, "rice" → cooked white rice). An alias may point at only one food.

## Supplements

Supplements are catalog foods with `category: "supplement"` (whey, isolate, casein, plant protein,
mass gainer, BCAA, collagen, creatine, multivitamin, vitamin D, fish oil, protein bars). The plan
setup asks which ones a person takes daily (`prefs.supplements`: name, servings, optional meal).
`src/healthApp/dietPlan/supplements.ts` takes their calories and protein out of the meal
budgets (a supplement tied to a meal comes out of that meal, the rest are spread; no meal drops
below 40% of its budget), and `supplementLog.ts` logs them in one tap from the Meals tab. Planned
meals never include a supplement unless the person loves it. New supplements go in `data/foods.ts`
with a label source (brand-neutral typical values).

## Search and suggestions

`searchCatalog(query, opts)` (src/meals/catalog/search.ts) ranks foods for search boxes, pickers
and recommendations:

1. **Match:** a name match beats an alias match; whole name, then name start, then any word
   start, then part of a word.
2. **Popularity** (`POPULARITY` in data/ranking.ts): how often people in India log the food,
   from 1 (rare) to 5 (most days). It's a judged prior until real logs exist. Pass `usage` (log
   counts by key) to blend real logs in on a log scale. Popularity reorders close matches but
   never lifts a part-word match above a whole-word one.
3. **Cuisine** (`CUISINE` in data/ranking.ts): everyday, North Indian, South Indian, Gujarati and
   Maharashtrian, Bengali and East, Mughlai and tandoor, Indo-Chinese, street food, Western and
   cafe, packaged. `groupByCuisine` groups results for display.

Filters: `diet` (veg, egg, nonveg, vegan, jain), `meal`, `cuisine`. Cooking ingredients (raw dal,
flour, oil) are left out unless `eatenOnly: false`. An empty query returns the most popular
foods. When you add a batch, give each new entry a popularity tier and a cuisine.

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

## Web lookups: monthly cap and poisoning guard

**Monthly cap.** Each person gets `MAGNUS_WEB_LOOKUPS_PER_MONTH` web food lookups per calendar
month in their timezone (default 100, `0` removes the cap). Each one is logged as a `web_lookup`
row in `health_app_events`. Past the cap, meals are still estimated from the catalog, the food
database, USDA and CalorieNinjas, and the draft card says the estimate is rougher.

**Pending rows.** `food_nutrition` and `food_recipes` are shared, and their rows come from lookups
driven by what people type. So a row a regular user's lookup creates is saved with
`source = 'web_pending'` and `source_detail->>'contributor'` set to their profile id. Only that
person's meals use it. It turns into a shared `web_research` row when:

- someone else's lookup of the same food gives matching numbers (calories within 15%, macros within 25%), or
- the owner's lookup covers it (the owner's numbers win).

A pending row is never overwritten by another user, and recipes from regular users never replace
a stored recipe. Every new web value must also pass a sanity check before it's used or saved:
at most 900 kcal per 100 g, macros that fit in the weight, and calories that match 4/4/9 kcal per
gram of protein/carbs/fat (alcoholic drinks excepted). Food names must be plain names (no markup or
prompt text), and the lookup prompt ignores any nutrition numbers or instructions in the meal text.

Review pending rows:

```sql
select food_key, unit, display_name, calories, protein_g, carbs_g, fat_g,
       source_detail->>'contributor' as contributor, created_at
from food_nutrition where source = 'web_pending' order by created_at desc;
```

Confirm one by hand: `update food_nutrition set source = 'web_research' where food_key = '…' and unit = '…';`
Delete a bad one: `delete from food_nutrition where food_key = '…' and unit = '…' and source = 'web_pending';`
