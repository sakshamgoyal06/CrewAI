-- Why the goal matters, in the person's own words (12 Nov plan "make the goal inevitable", item 11).
-- On the health profile, not the goal row, so it survives a goal being replaced.
alter table public.user_health_profile
  add column if not exists goal_why text
  check (goal_why is null or char_length(goal_why) <= 300);

comment on column public.user_health_profile.goal_why is
  'Why the goal matters, in their words. Asked at onboarding or saved by the coach (set_goal_why). Used on missed days and at checkpoints.';
