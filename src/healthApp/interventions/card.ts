/** The intervention card and the lines the coach reads about it. Pure, so the prompt can import it cheaply. */
import { OPEN_STATUSES, type Intervention, type InterventionCard } from "./types.js";


export function cardFromIntervention(i: Intervention): InterventionCard {
  return {
    type: "intervention",
    interventionId: i.id,
    pattern: i.pattern,
    title: i.title,
    evidence: i.evidence,
    askReason: i.status === "offered" && i.pattern === "routine_slipping" && i.cause === "unknown",
    options: i.options.map((o) => ({ id: o.id, label: o.label, kind: o.kind, ...(o.prompt ? { prompt: o.prompt } : {}), impact: o.impact.text })),
    recommendation: i.recommendation,
    status: i.status,
    auto: i.status === "trial" && i.facts?.auto === 1,
    chosen: i.chosenOption ? (i.options.find((o) => o.id === i.chosenOption)?.label ?? i.chosenOption) : null,
    reviewOn: i.reviewOn,
    verdict: i.verdict,
  };
}

const STATE_NOTE: Record<string, string> = {
  offered: "no answer yet",
  kept: "they chose to keep the plan as is",
  trial: "trial running",
  confirm: "trial checked; asking whether to make it the plan",
  confirmed: "made part of the plan",
  applied: "saved to the plan",
  ended: "trial ended, back to the agreed plan",
  cancelled: "trial cancelled by them",
  expired: "never answered",
  info: "shown",
};

/** The history line for a past card, so the model knows the offer's outcome. */
export function interventionNote(c: InterventionCard): string {
  return `[Plan-change card "${c.title}" (id ${c.interventionId}): ${STATE_NOTE[c.status] ?? c.status}${c.chosen ? `, chose "${c.chosen}"` : ""}${c.verdict ? `; ${c.verdict}` : ""}]`;
}

/** One context line about plan changes in motion, for the coach. Null when there are none. */
export function interventionsLine(rows: Intervention[]): string | null {
  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status)).slice(0, 3);
  if (!open.length) return null;
  const parts = open.map((r) => {
    const chosen = r.options.find((o) => o.id === r.chosenOption)?.label;
    if (r.status === "offered") return `open offer "${r.title}" (id ${r.id})`;
    if (r.status === "trial" && r.facts?.auto === 1) return `started for them by default (suggested change, not yet answered) on ${r.startedAt?.slice(0, 10) ?? "?"}: "${chosen ?? r.title}" for ${r.itemLabel ?? r.area}, check on ${r.reviewOn} (id ${r.id})${r.evidence[0] ? `, because: ${r.evidence[0].replace(/\.$/, "")}` : ""}; Undo and the other options sit under that message in chat`;
    if (r.status === "trial") return `trial since ${r.startedAt?.slice(0, 10) ?? "?"}: "${chosen ?? r.title}" for ${r.itemLabel ?? r.area}, check on ${r.reviewOn} (id ${r.id}); their agreed plan is unchanged until they confirm`;
    return `asking whether to keep "${chosen ?? r.title}" (id ${r.id})${r.verdict ? `: ${r.verdict}` : ""}`;
  });
  return `Plan changes: ${parts.join("; ")}.`;
}

