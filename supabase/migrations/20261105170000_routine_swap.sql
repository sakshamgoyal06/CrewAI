-- A temporary stand-in for a routine item ("no gym till the 25th: an evening walk instead").
-- {activityKey, label, durationMin, startTime, from, until, reason}; null when none. Ends on its own after `until`.
alter table public.health_routine_items add column if not exists swap jsonb;
