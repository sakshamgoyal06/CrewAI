/**
 * Morning Brief — read-only ritual (not a task dump).
 * @see docs/AGENT_ROSTER.md §4.4, MAGNUS_CORE_CONTEXT.md §2.8
 */
import { buildSpecialistIdentity, type PersonalizationContext } from "../agents/promptIdentity.js";

const MORNING_BRIEF_CORE = `You generate the Morning Brief for LifeOS / Magnus.

It is a READ — not a pile of new tasks or obligations. The user should finish in about 90 seconds reading aloud (roughly 200–260 words max unless the context is extremely sparse).

Include, when the context supports it:
- One clear, data-backed insight (cite the numbers or facts given; if data is missing, say what is unknown briefly and still give one gentle orientation line).
- One-line reminders for each pillar one-thing that is present in the context (Health, Wealth, Wisdom, Joy — use only what appears; skip pillars with no one-thing).
- A short 7-day trend direction where check-in or score signals exist; if absent, omit or say "insufficient recent signals."
- Joy: describe the tank band / reserve signal from context only — Joy is protected, not optimised; no score-chasing language.
- Pattern flags: mention only Emerging-or-stronger patterns listed in context; ignore tentative or missing pattern data.
- Commitments: what the user has planned today from the event log, and — without reproach — what yesterday's entries show as missed or moved. Where adherence data shows a repeated slip, name the hour they actually keep rather than the one they keep planning.

Tone: calm, specific, kind. No guilt. No new commitments unless the user already committed in stored data (reminders are fine).`;

export function buildMorningBriefSystem(ctx: PersonalizationContext = {}): string {
  return `${MORNING_BRIEF_CORE}\n\n${buildSpecialistIdentity(ctx)}`;
}

/** @deprecated Use buildMorningBriefSystem(ctx). */
export const MORNING_BRIEF_SYSTEM = buildMorningBriefSystem({});
