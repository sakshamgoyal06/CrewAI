-- Legacy `meal_logs` may already exist (LifeOS: date, meal_time, description NOT NULL, …).
-- Magnus inserts use raw_text, protein_g, carbs_g, fat_g, estimate_source, items, provider_raw, source_channel.
-- Add missing columns and align types without dropping legacy data.

ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS raw_text TEXT;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS protein_g NUMERIC;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS carbs_g NUMERIC;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS fat_g NUMERIC;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS estimate_source TEXT;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS provider_raw JSONB;
ALTER TABLE public.meal_logs ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT 'telegram';

-- Backfill Magnus + legacy columns
UPDATE public.meal_logs
SET raw_text = description
WHERE raw_text IS NULL AND description IS NOT NULL;

UPDATE public.meal_logs
SET estimate_source = 'unavailable'
WHERE estimate_source IS NULL;

-- Do not ALTER calories TYPE: legacy DBs may have views (e.g. today_health) depending on it.
-- Magnus rounds kcal in recordMealLog for integer columns.

-- So PostgREST inserts can omit legacy NOT NULL fields when Magnus only sends new columns
ALTER TABLE public.meal_logs ALTER COLUMN date SET DEFAULT (CURRENT_DATE);
ALTER TABLE public.meal_logs ALTER COLUMN meal_time SET DEFAULT 'unspecified';
ALTER TABLE public.meal_logs ALTER COLUMN description SET DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_meal_logs_estimate_source'
  ) THEN
    ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_estimate_source CHECK (
      estimate_source IS NULL OR estimate_source IN (
        'healthifyme_proxy',
        'calorieninjas',
        'usda_fdc',
        'llm_estimate',
        'unavailable'
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_meal_logs_source_channel'
  ) THEN
    ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_source_channel CHECK (
      source_channel IN ('telegram', 'api', 'system')
    );
  END IF;
END $$;

COMMENT ON COLUMN public.meal_logs.raw_text IS 'Free-text meal from Magnus /meal (parallel to legacy description)';
