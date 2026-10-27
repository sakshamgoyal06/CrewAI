export type ProactiveCronContext = {
  now: Date;
};

export type ScheduledProactiveJob = {
  id: string;
  /** When false the tick skips this job (feature flag). */
  enabled: () => boolean;
  run: (ctx: ProactiveCronContext) => Promise<void>;
};
