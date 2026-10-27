import { isInLocalHourWindow } from "../scheduleWindow.js";
import { gateAndCompose } from "../llm/gateAndCompose.js";
import { evaluateProjectConflicts } from "../../projects/projectConflictService.js";
import { buildActiveProjectSummaries } from "../../projects/projectExecutor.js";
import { formatActiveProjectsForMemory } from "../../projects/projectStore.js";
import type { ProactiveKindHandler, ProactiveEvaluateResult } from "./types.js";

const DEFAULT_LOCAL_HOUR = 10;
const DEFAULT_WINDOW_MINUTES = 30;

function configNumber(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export const projectConflictReviewHandler: ProactiveKindHandler = {
  kind: "project_conflict_review",
  capBucket: "adaptive",
  dedupeTtlSec: 604800,

  async evaluate(ctx): Promise<ProactiveEvaluateResult> {
    const localHour = configNumber(ctx.subscription.config, "localHour", DEFAULT_LOCAL_HOUR);
    const windowMinutes = configNumber(
      ctx.subscription.config,
      "windowMinutes",
      DEFAULT_WINDOW_MINUTES,
    );

    if (!isInLocalHourWindow(ctx.signals.local, localHour, windowMinutes)) {
      return { candidate: false, reason: "outside_window" };
    }

    const conflict = await evaluateProjectConflicts(ctx.userProfileId);
    if (!conflict) {
      return { candidate: false, reason: "no_conflict" };
    }

    return {
      candidate: true,
      reason: conflict.kind,
      signals: { message: conflict.message, projectIds: conflict.projects.map((p) => p.id) },
    };
  },

  async llmGate(ctx, evalResult) {
    if (!evalResult.candidate) {
      return { send: false, skipReason: evalResult.reason };
    }

    const summaries = await buildActiveProjectSummaries(ctx.userProfileId);
    const block = formatActiveProjectsForMemory(summaries);
    const hint =
      typeof evalResult.signals?.message === "string" ? evalResult.signals.message : "";

    const result = await gateAndCompose({
      kind: "project_conflict_review",
      systemPreamble:
        "You are Magnus reviewing competing active projects. Name the tension briefly; ask which should be primary for the next 2-4 weeks. One short paragraph.",
      contextBlock: [block, hint].filter(Boolean).join("\n"),
    });

    return result.send
      ? { send: true, composeHint: result.message }
      : { send: false, skipReason: result.skipReason ?? "gate_declined" };
  },

  async compose(_ctx, gate) {
    return gate.composeHint ?? "";
  },
};
