-- Food preferences beyond the five diets: a custom diet in their own words, and foods to avoid
-- (allergies, intolerances, dislikes). The coach never suggests anything on the avoid list.

ALTER TABLE public.user_health_profile
  ADD COLUMN IF NOT EXISTS diet_note TEXT,
  ADD COLUMN IF NOT EXISTS food_avoid TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_health_profile DROP CONSTRAINT IF EXISTS user_health_profile_diet_check;
ALTER TABLE public.user_health_profile
  ADD CONSTRAINT user_health_profile_diet_check
  CHECK (diet IN ('vegetarian', 'eggetarian', 'non_vegetarian', 'vegan', 'jain', 'custom'));
