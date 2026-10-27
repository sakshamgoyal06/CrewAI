import type { Intent } from "../intent.js";

/** How the test case was sourced */
export type ChatTestSource =
  | "real_chat"
  | "catalog"
  | "synthetic"
  | "variation"
  | "adversarial";

/** Issue tags from production chat analysis */
export type ChatIssueTag =
  | "ambiguous_routing"
  | "needs_prior_turn"
  | "meal_log_tense"
  | "duplicate_action"
  | "partial_tool_failure"
  | "wrong_pillar"
  | "missing_capability"
  | "undo_disambiguation"
  | "playlist_name_confusion"
  | "meal_slot_confusion"
  | "calendar_not_read"
  | "timestamp_unavailable"
  | "multi_intent"
  | "confirmation_loop";

export type ChatMessageTestCase = {
  id: string;
  message: string;
  source: ChatTestSource;
  category: string;
  /** Ideal routing when known (catalog + inferred) */
  idealIntent?: Intent;
  idealCapability?: string;
  /** Production assistant intent from paired chat (when source=real_chat) */
  observedIntent?: string | null;
  /** Requires prior turn context (yes/no/undo) */
  requiresPriorTurn?: boolean;
  /** Known production issue this message exposed */
  issueTags?: ChatIssueTag[];
  /** Short note for reviewers */
  notes?: string;
  /** Structural routing expectations (deterministic checks) */
  structural?: {
    explicitMealLog?: boolean;
    magnusTools?: boolean;
    youtubeAction?: boolean;
    consultPillars?: Array<"HEALTH" | "WEALTH" | "HAPPINESS" | "WISDOM">;
  };
  /** Flow expectations for golden-path / live eval */
  flow?: {
    expectedPrimaryTool?: string;
    needsDisambiguation?: boolean;
    shouldNotAutoLogMeal?: boolean;
  };
};

export type ChatTestSuiteMeta = {
  generatedAt: string;
  totalCases: number;
  bySource: Record<ChatTestSource, number>;
  byCategory: Record<string, number>;
  realChatCount: number;
};
