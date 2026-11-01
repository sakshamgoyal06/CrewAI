-- Our own food database. Every food the meal estimator looks up on the web is saved here per
-- unit (per piece / bowl / cup … and per 100 g or 100 ml), so the next meal with that food is
-- answered from this table instantly and only new foods go to the web.
-- Written and read by the server (src/meals/foodStore.ts).

CREATE TABLE IF NOT EXISTS public.food_nutrition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized food name: lowercase, singular, no punctuation ("aloo paratha", "egg").
  food_key TEXT NOT NULL,
  -- What one row's numbers are for: 'per_100g', 'per_100ml', or one 'piece' | 'bowl' | 'cup' |
  -- 'glass' | 'slice' | 'tbsp' | 'tsp' | 'plate' | 'scoop' | 'serving'.
  unit TEXT NOT NULL,
  display_name TEXT NOT NULL,
  -- Weight of one unit in grams, when known (lets a piece be converted to per-100 g and back).
  grams_per_unit NUMERIC,
  calories NUMERIC NOT NULL CHECK (calories >= 0),
  protein_g NUMERIC NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g NUMERIC NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g NUMERIC NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  -- Where the numbers came from: web_research | usda_fdc | calorieninjas | user.
  source TEXT NOT NULL,
  -- Citations, the estimator's serving note, the meal text it came from.
  source_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- How often a meal estimate used this row.
  hits INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_food_nutrition_key_unit UNIQUE (food_key, unit)
);

COMMENT ON TABLE public.food_nutrition IS 'Own food database for meal estimates: nutrition per food per unit, filled from web/API lookups.';

ALTER TABLE public.food_nutrition ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.food_nutrition;
CREATE POLICY service_role_only ON public.food_nutrition FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
REVOKE ALL ON public.food_nutrition FROM anon, authenticated;

-- Meals answered from the table are logged with estimate_source 'food_db'.
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS chk_meal_logs_estimate_source;
ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_estimate_source CHECK (
  estimate_source IS NULL OR estimate_source IN (
    'healthifyme_proxy', 'calorieninjas', 'usda_fdc', 'llm_estimate', 'unavailable', 'web_research', 'food_db'
  )
);

-- Bumps hits/last_used_at for the rows a meal estimate used (pairs of key and unit).
CREATE OR REPLACE FUNCTION public.food_nutrition_mark_used(p_keys TEXT[], p_units TEXT[])
RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  UPDATE public.food_nutrition f
  SET hits = f.hits + 1, last_used_at = now()
  FROM unnest(p_keys, p_units) AS u(k, un)
  WHERE f.food_key = u.k AND f.unit = u.un;
$$;
REVOKE ALL ON FUNCTION public.food_nutrition_mark_used(TEXT[], TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.food_nutrition_mark_used(TEXT[], TEXT[]) TO service_role;
