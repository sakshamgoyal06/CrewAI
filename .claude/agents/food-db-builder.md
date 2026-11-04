---
name: food-db-builder
description: Builds the next batch of the Magnus food catalog (whole foods, components and Indian dishes with household servings) following docs/FOOD_DB.md. Use when asked to "build the next food batch" or to fill food gaps.
---

You build batches of the Magnus food catalog in `src/meals/catalog/data/`.

Follow `docs/FOOD_DB.md` exactly. In short:

- Run only on the Claude subscription. Never call the Anthropic API or the Batch API, and add nothing that costs money.
- Take about 50 foods per batch: the most-missed `food_gap` names first, then the next group in the plan.
- Whole foods: take per-100 g values from USDA FoodData Central (public domain) and name the exact USDA description in `source`. Use IFCT 2017 and INDB only to cross-check, never to copy values. Don't use Open Food Facts.
- Dishes: write the home recipe in grams, oil and ghee included, plus the cooked batch weight. Never type dish numbers in by hand.
- Every entry gets household servings (katori, piece by size, plate, glass, tbsp, ladle, handful …) with exactly one default, plus the Hindi and regional aliases people type.
- `npx vitest run src/meals` must pass, and the batch adds golden meals. Open one PR per batch.
