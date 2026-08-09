import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../../tools/clients.js";
import { buildAgentMessages } from "../memory/memoryAgent.js";
import { buildSpecialistIdentity } from "../promptIdentity.js";
import type { AgentContext, AgentResult } from "../types.js";
import { buildNutritionJournalContext } from "../../nutrition/analytics/nutritionJournalContext.js";
import { appendHealthReferenceBlock } from "../../pillars/health/references/appendHealthReferenceBlock.js";
import { saveHealthJournalEntry } from "../../pillars/health/journal/healthJournalStore.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

const JOURNAL_SYSTEM = `You are the Health EOD journal specialist for Magnus (Telegram).

The user is doing an end-of-day health review. Use their message plus any program memory in the prompt.

Output **only** a markdown journal entry with these sections (omit empty sections):
# EOD journal — YYYY-MM-DD

## Day summary
- **Training:**
- **Nutrition:**
- **Sleep / energy:**

## How I feel

## What worked

## What didn't / friction

## Hevy (if applicable)

## Tomorrow
- **Focus:**

Rules:
- Supportive LifeOS tone; no shame.
- Use today's UTC date in the title unless the user names a different date.
- If they rested, say so clearly.
- End with one concrete "Focus" line for tomorrow.
- Under 400 words.`;

const JOURNAL_PATTERN =
  /\b(journal|eod|end of day|end-of-day|daily review|wrap up my day|rest day log)\b/i;

export function matchesHealthJournalMessage(
  rawMessage: string,
  slashCommandKey?: string,
): boolean {
  if (slashCommandKey === "journal") {
    return true;
  }
  const t = rawMessage.trim();
  if (!t) {
    return false;
  }
  if (JOURNAL_PATTERN.test(t)) {
    return true;
  }
  return false;
}

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export async function runHealthJournalAgent(ctx: AgentContext): Promise<AgentResult> {
  const payload =
    ctx.slashCommandKey === "journal"
      ? ctx.rawMessage.trim() || "today — summarize my day from what I shared."
      : ctx.rawMessage;

  const nutritionContext = await buildNutritionJournalContext({
    userProfileId: ctx.userProfileId,
    timezone: ctx.timezone,
  });

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 900,
    system: `${buildSpecialistIdentity(ctx)}\n\n${JOURNAL_SYSTEM}`,
    messages: buildAgentMessages(
      ctx,
      appendHealthReferenceBlock(
        `${payload}${nutritionContext}${ctx.healthPreferences ?? ""}`,
        ctx.healthReferenceBlock,
      ),
    ),
  });

  const entry = textFromMessage(msg).trim();
  if (!entry) {
    return {
      text: "I couldn't draft a journal entry — try again with how you feel, training, sleep, and food today.",
      metadata: { specialist: "HealthJournal", department: "HEALTH", journal_saved: false },
    };
  }

  const saved = await saveHealthJournalEntry(ctx.userProfileId, entry);
  if (!saved.ok) {
    return {
      text: `${entry}\n\n_(Note: journal draft only — save to database failed: ${saved.error})_`,
      metadata: {
        specialist: "HealthJournal",
        department: "HEALTH",
        journal_saved: false,
        journal_error: saved.error,
      },
    };
  }

  return {
    text: `Saved your journal for **${saved.logDate}**.\n\n${entry}`,
    metadata: {
      specialist: "HealthJournal",
      department: "HEALTH",
      journal_saved: true,
      journal_date: saved.logDate,
      health_order: "journal",
    },
  };
}

export async function tryHealthJournalAgent(
  ctx: AgentContext,
): Promise<AgentResult | null> {
  if (!matchesHealthJournalMessage(ctx.rawMessage, ctx.slashCommandKey)) {
    return null;
  }

  return runHealthJournalAgent(ctx);
}
