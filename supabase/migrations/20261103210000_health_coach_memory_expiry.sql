-- Coach memory lines can end on their own: "travelling till Sunday" stops being shown the day after.
-- Null means the line holds until the person or the coach removes it.
ALTER TABLE public.health_coach_memory ADD COLUMN IF NOT EXISTS expires_on DATE;
