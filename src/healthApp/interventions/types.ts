/**
 * Shared shapes for coach interventions: what a detector found, what the coach offers, and what a
 * chosen option changes. See the PRD "Proactive coach interventions" (2026-11-03).
 */
import type { RoutineItem } from "../routine.js";

/** P1 routine_slipping · P2 routine_mismatch · P3 calories_over/under, protein_short · P4 rebound ·
 * P5 stalled · P6 logging_fading · P7 over_ambitious · P8 deadline_drift · safety. */
export type PatternId =
  | "routine_slipping"
  | "routine_mismatch"
  | "calories_over"
  | "calories_under"
  | "protein_short"
  | "rebound"
  | "stalled"
  | "logging_fading"
  | "over_ambitious"
  | "deadline_drift"
  | "safety";

export type CauseId =
  // routine
  | "time"
  | "length"
  | "too_many_days"
  | "bad_weekday"
  | "energy"
  | "enjoyment"
  | "forgot"
  | "unknown"
  | "plan_mismatch"
  // food
  | "target_strict"
  | "heavy_meal"
  | "undereating"
  | "target_low"
  | "protein_meal"
  | "early_restriction"
  | "weekend"
  | "under_logging"
  // progress
  | "above_maintenance"
  | "steps_dropped"
  | "recomp"
  | "logging_effort"
  | "pace"
  | "too_fast";

/** The reasons a person can tap on "What got in the way?". */
export const REASON_CHOICES = ["time", "energy", "enjoyment", "forgot", "away"] as const;
export type ReasonChoice = (typeof REASON_CHOICES)[number];

export type Finding = {
  pattern: PatternId;
  cause: CauseId;
  /** One open offer or trial per area. */
  area: string;
  itemId: string | null;
  itemLabel: string | null;
  /** Ranks findings: safety first, then the one behind the most off days. */
  weight: number;
  /** Plain sentences with the numbers, shown on the card. */
  evidence: string[];
  /** Numbers the options are built from (observed time, worst weekday, average gap...). */
  facts: Record<string, number | string | null>;
};

export type RoutinePatch = Partial<Pick<RoutineItem, "startTime" | "durationMin" | "days" | "remindBeforeMin">>;

export type Change = {
  routineItem?: { itemId: string; patch: RoutinePatch };
  targets?: { calorieTarget?: number; proteinTarget?: number; stepTarget?: number };
  /** A new goal deadline. Never changes during a trial; applied on the person's yes. */
  deadline?: string;
  /** Something to try daily that changes nothing in the plan. */
  experiment?: string;
};

export type GoalImpact = {
  /** keeps: deadline still met · moves: goal lands on `date` · none: no goal or no effect on it. */
  kind: "keeps" | "moves" | "none";
  date: string | null;
  text: string;
};

export type OptionKind = "change" | "experiment" | "talk";

export type Option = {
  id: string;
  label: string;
  kind: OptionKind;
  change: Change;
  impact: GoalImpact;
  /** For "talk": what the chat opens with. */
  prompt?: string;
};

export type InterventionStatus =
  | "offered"
  | "kept"
  | "trial"
  | "confirm"
  | "confirmed"
  | "applied"
  | "ended"
  | "cancelled"
  | "expired"
  | "info";

export const OPEN_STATUSES: InterventionStatus[] = ["offered", "trial", "confirm"];

export type Intervention = {
  id: string;
  pattern: PatternId;
  cause: CauseId;
  area: string;
  itemId: string | null;
  itemLabel: string | null;
  localDate: string;
  title: string;
  evidence: string[];
  facts: Record<string, number | string | null>;
  options: Option[];
  /** "stick" when no easier option keeps the deadline. */
  recommendation: string | null;
  status: InterventionStatus;
  chosenOption: string | null;
  before: Change | null;
  applied: Change | null;
  deferred: Change | null;
  baseline: { rate: number | null } | null;
  reviewOn: string | null;
  verdict: string | null;
  createdAt: string;
  answeredAt: string | null;
  startedAt: string | null;
  closedAt: string | null;
};

export type InterventionCard = {
  type: "intervention";
  interventionId: string;
  pattern: PatternId;
  title: string;
  evidence: string[];
  /** True when the card should first ask "What got in the way?". */
  askReason: boolean;
  options: Array<Pick<Option, "id" | "label" | "kind" | "prompt"> & { impact: string }>;
  recommendation: string | null;
  status: InterventionStatus;
  /** Magnus started the suggested change by default; the card offers Undo and the other ways. */
  auto?: boolean;
  chosen: string | null;
  reviewOn: string | null;
  verdict: string | null;
};
