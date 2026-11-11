/**
 * The coach's pause tool (breaks.ts). The flow Saksham set: ask why, offer an alternative first,
 * then the length (capped), then the minimums; it starts only once they confirm.
 */
import { z } from "zod";

import type { ActionContext } from "./actions.js";
import { activeBreaks, BREAK_REASONS, endBreakEarly, previewBreak, startBreak } from "./breaks.js";
import { localDateKey } from "../nutrition/localDate.js";
import { addDays } from "../util/time.js";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pauseInput = z.object({
  action: z.enum(["preview", "start", "end", "list"]),
  scope: z.enum(["item", "plan"]).optional(),
  itemId: z.string().uuid().optional(),
  reason: z.enum(BREAK_REASONS).optional(),
  note: z.string().trim().max(200).optional(),
  days: z.coerce.number().int().min(1).max(30).optional(),
  until: DATE.optional(),
  breakId: z.string().uuid().optional(),
});

export const PAUSE_TOOL = {
  name: "pause",
  description:
    "Pause one routine item (scope item, itemId from the routine) or the whole plan (scope plan) for a while: injured or sick, travelling, too busy, need rest. Follow this order, one step per message: 1) no reason yet → ask why (sick, injured, travel, busy, rest, other); 2) preview with scope + reason → offer its alternative first if it has one (taking it is swap_routine_item, not a pause); 3) they still want the pause → ask how long, at most max days; 4) start with days or until → tell them the reply and the minimums. A pause never starts without a reason. end: they're back early (breakId from list); for a whole-plan pause tell them the resume screen opens to choose about their goal date. list: pauses running or coming up. A pause isn't skipping one day (that's the routine Skip) and isn't a food rule (that's meal_plan).",
  input_schema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["preview", "start", "end", "list"] },
      scope: { type: "string", enum: ["item", "plan"] },
      itemId: { type: "string", description: "scope item: the routine item's id." },
      reason: { type: "string", enum: [...BREAK_REASONS] },
      note: { type: "string", description: "Their words, when reason is other." },
      days: { type: "integer", description: "start: how many days from today, today included." },
      until: { type: "string", description: "start: last paused day YYYY-MM-DD, instead of days." },
      breakId: { type: "string", description: "end: which pause." },
    },
    required: ["action"],
  },
};

export async function runPauseTool(ctx: ActionContext, input: z.infer<typeof pauseInput>): Promise<{ result: unknown; changed?: boolean }> {
  const now = ctx.now ?? new Date();
  const today = localDateKey(now, ctx.timezone);
  switch (input.action) {
    case "list":
      return { result: { ok: true, pauses: await activeBreaks(ctx) } };
    case "preview": {
      if (!input.scope || !input.reason) return { result: { ok: false, error: "ask_reason_first" } };
      return { result: { ok: true, ...(await previewBreak(ctx, { scope: input.scope, reason: input.reason, itemId: input.itemId })) } };
    }
    case "start": {
      if (!input.scope || !input.reason) return { result: { ok: false, error: "ask_reason_first" } };
      const until = input.until ?? (input.days ? addDays(today, input.days - 1) : null);
      if (!until) return { result: { ok: false, error: "ask_length" } };
      const r = await startBreak(ctx, { scope: input.scope, itemId: input.itemId, reason: input.reason, note: input.note, until });
      return { result: r, changed: r.ok };
    }
    case "end": {
      if (!input.breakId) return { result: { ok: false, error: "breakId_required" } };
      const r = await endBreakEarly(ctx.userProfileId, input.breakId, today);
      return { result: r.ok && r.scope === "plan" ? { ...r, note: "The resume screen (Today) asks how to restart: move the goal date or keep it." } : r, changed: r.ok };
    }
  }
}
