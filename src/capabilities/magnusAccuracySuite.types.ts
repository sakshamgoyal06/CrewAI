/**
 * Magnus accuracy suite — metric types aligned with BFCL / τ-bench / ReliabilityBench
 * conventions, adapted for a personal chief-of-staff bot.
 */
import type { Intent } from "../intent.js";

/** Evaluation dimension — maps to scorecard columns. */
export type AccuracyDimension =
  | "routing"
  | "tool_selection"
  | "action_integrity"
  | "voice"
  | "minimal_gate"
  | "metamorphic_design"
  | "fault_tolerance"
  | "read_before_write"
  | "catalog";

/** Gate thresholds for CI (minimal mode baseline). */
export type AccuracyGateThresholds = {
  routingAt1: number;
  toolSelectAt1: number;
  actionIntegrity: number;
  voiceCoherence: number;
  minimalGate: number;
  faultHonesty: number;
  metamorphicDesign: number;
  catalogCoherence: number;
};

export const DEFAULT_ACCURACY_GATES: AccuracyGateThresholds = {
  routingAt1: 0.98,
  toolSelectAt1: 0.95,
  actionIntegrity: 1,
  voiceCoherence: 1,
  minimalGate: 1,
  faultHonesty: 1,
  metamorphicDesign: 1,
  catalogCoherence: 1,
};

export type ActionIntegrityExpectation = {
  text: string;
  metadata?: Record<string, unknown>;
  /** When true, enforceActionIntegrity must set corrected=true */
  shouldCorrect: boolean;
  reason?: string;
};

/** Fixture orchestrator case — extends golden-path shape with dimension tags. */
export type MagnusAccuracyOrchestratorCase = {
  id: string;
  dimension: AccuracyDimension;
  message: string;
  category: string;
  idealIntent: Intent;
  idealCapability: string;
  expectedDelegatedAgent?: string;
  expectedPrimaryTool?: string;
  /** When set, reply must contain substring (parked message, etc.) */
  replyContains?: string;
  /** When set, reply must not contain substring */
  replyExcludes?: string;
  minimalModeOnly?: boolean;
};

export type MagnusMetamorphicGroup = {
  id: string;
  category: string;
  paraphrases: string[];
  idealIntent: Intent;
  idealCapability: string;
  expectedPrimaryTool?: string;
};

export type MagnusAccuracyCaseResult = {
  id: string;
  dimension: AccuracyDimension;
  passed: boolean;
  failures: string[];
};

export type MagnusAccuracyReport = {
  generatedAt: string;
  gates: AccuracyGateThresholds;
  dimensions: Record<
    AccuracyDimension,
    { passed: number; total: number; rate: number; gate: number; gatePassed: boolean }
  >;
  metrics: {
    routingAt1: number;
    toolSelectAt1: number;
    actionIntegrity: number;
    voiceCoherence: number;
    minimalGate: number;
    faultHonesty: number;
    metamorphicDesign: number;
  };
  allGatesPassed: boolean;
  failures: MagnusAccuracyCaseResult[];
};
