-- Food database stores ingredients, not meals (like HealthifyMe):
--   food_nutrition  one row per ingredient + preparation variant, in its natural measure:
--                   per 100 g / 100 ml for rice, dal, curd, oil …; per piece for eggs, rotis,
--                   parathas; per slice for bread … ("white rice cooked" per_100g,
--                   "egg boiled" per piece, "brown bread" per slice)
--   food_recipes    what a named dish or portion is made of: ingredient amounts per one unit of
--                   it ("burrito bowl" serving = 150 g white rice cooked + 80 g paneer tikka
--                   air fried + …; "dal" bowl = 150 g dal tadka)
-- A meal's calories are always built up from food_nutrition rows.

ALTER TABLE public.food_nutrition DROP CONSTRAINT IF EXISTS chk_food_nutrition_unit;
ALTER TABLE public.food_nutrition ADD CONSTRAINT chk_food_nutrition_unit CHECK (
  unit IN ('per_100g', 'per_100ml', 'piece', 'slice', 'cup', 'glass', 'tbsp', 'tsp', 'scoop', 'bowl', 'plate', 'serving')
);
COMMENT ON TABLE public.food_nutrition IS 'Own food database: nutrition per ingredient/variant in its natural measure (per 100 g/ml, per piece, per slice …).';
COMMENT ON COLUMN public.food_nutrition.grams_per_unit IS 'Weight of one unit in grams (for piece/slice/cup … rows), when known.';

CREATE TABLE IF NOT EXISTS public.food_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_key TEXT NOT NULL,
  -- The unit of the dish the components are for: piece | bowl | cup | plate | serving | per_100g …
  unit TEXT NOT NULL,
  display_name TEXT NOT NULL,
  -- [{ "food_key": "white rice cooked", "unit": "per_100g", "quantity": 150 },
  --  { "food_key": "egg boiled", "unit": "piece", "quantity": 2 }]  (quantity in grams/ml for per_100 units)
  components JSONB NOT NULL,
  source TEXT NOT NULL,
  source_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  hits INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_food_recipes_key_unit UNIQUE (dish_key, unit)
);
COMMENT ON TABLE public.food_recipes IS 'What a dish is made of (ingredient amounts per one unit of the dish); calories come from food_nutrition.';

ALTER TABLE public.food_recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.food_recipes;
CREATE POLICY service_role_only ON public.food_recipes FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.food_recipes FROM anon, authenticated;
