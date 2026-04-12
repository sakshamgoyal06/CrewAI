-- Allow web-first meal estimates (Anthropic web_search + Serp excerpts) in estimate_source.
ALTER TABLE public.meal_logs DROP CONSTRAINT IF EXISTS chk_meal_logs_estimate_source;

ALTER TABLE public.meal_logs ADD CONSTRAINT chk_meal_logs_estimate_source CHECK (
  estimate_source IS NULL OR estimate_source IN (
    'healthifyme_proxy',
    'calorieninjas',
    'usda_fdc',
    'llm_estimate',
    'unavailable',
    'web_research'
  )
);
