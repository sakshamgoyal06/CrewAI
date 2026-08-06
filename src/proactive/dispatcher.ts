import { logger } from "../logger.js";
import { getProactiveKind } from "./kinds/registry.js";
import type { ProactiveKindContext } from "./kinds/types.js";
import { incrementAdaptiveCap, runProactiveGuards } from "./guards.js";
import { sendProactiveTelegram } from "./outbound.js";
import { buildProactiveSignals } from "./signals.js";
import {
  listDueCustomReminders,
  listEnabledSubscriptions,
  markSubscriptionSent,
} from "./subscriptions/store.js";
import type { ProactiveSubscription } from "./subscriptions/types.js";
import { listAllowlistedTelegramTargets } from "./targets.js";
import type { ProactiveMessageKind } from "./types.js";

function dedupeKeyFor(sub: ProactiveSubscription, dateKey: string): string {
  if (sub.kind === "custom_reminder") {
    if (sub.triggerType === "recurring") {
      return `custom_reminder:recurring:${sub.id}:${dateKey}`;
    }
    return `custom_reminder:${sub.id}`;
  }
  return `${sub.kind}:${sub.userProfileId}:${dateKey}`;
}

function allowQuietOverride(sub: ProactiveSubscription): boolean {
  return sub.kind === "custom_reminder" && sub.capBucket === "user_asked";
}

async function processSubscription(
  ctx: ProactiveKindContext,
  handler: NonNullable<ReturnType<typeof getProactiveKind>>,
): Promise<void> {
  const evalResult = await handler.evaluate(ctx);
  if (!evalResult.candidate) {
    return;
  }

  const guard = await runProactiveGuards({
    now: ctx.now,
    timezone: ctx.timezone,
    userProfileId: ctx.userProfileId,
    capBucket: handler.capBucket,
    allowQuietHoursOverride: allowQuietOverride(ctx.subscription),
    dedupeKey: dedupeKeyFor(ctx.subscription, ctx.signals.local.dateKey),
    dedupeTtlSec: handler.dedupeTtlSec,
    cooldownHours: ctx.subscription.cooldownHours,
    lastSentAt: ctx.subscription.lastSentAt,
  });

  if (!guard.ok) {
    return;
  }

  const gateResult = await handler.llmGate(ctx, evalResult);
  if (!gateResult.send) {
    return;
  }

  const plainText = await handler.compose(ctx, gateResult);
  if (!plainText.trim()) {
    return;
  }

  await sendProactiveTelegram({
    chatId: ctx.telegramChatId,
    telegramUserIdForLog: ctx.telegramChatId,
    userProfileId: ctx.userProfileId,
    plainText: plainText.trim(),
    kind: ctx.subscription.kind as ProactiveMessageKind | "custom",
    trigger: "scheduled",
    intent: ctx.subscription.kind,
  });

  await markSubscriptionSent(ctx.subscription.id, ctx.now, {
    disable: ctx.subscription.triggerType === "one_shot",
  });

  if (handler.capBucket === "adaptive") {
    await incrementAdaptiveCap(ctx.userProfileId, ctx.signals.local.dateKey);
  }
}

/**
 * Evaluate subscription-based proactive messages for all allowlisted users.
 */
export async function runProactiveDispatcher(now: Date): Promise<void> {
  const targets = await listAllowlistedTelegramTargets();
  const dueCustom = await listDueCustomReminders(now);
  const dueCustomByUser = new Map<string, ProactiveSubscription[]>();
  for (const sub of dueCustom) {
    const arr = dueCustomByUser.get(sub.userProfileId) ?? [];
    arr.push(sub);
    dueCustomByUser.set(sub.userProfileId, arr);
  }

  for (const target of targets) {
    try {
      const signals = await buildProactiveSignals({
        userProfileId: target.userProfileId,
        telegramChatId: target.telegramChatId,
        timezone: target.timezone,
        now,
      });

      const subs = await listEnabledSubscriptions(target.userProfileId);
      const customDue = dueCustomByUser.get(target.userProfileId) ?? [];
      const allSubs = [...subs];
      for (const c of customDue) {
        if (!allSubs.some((s) => s.id === c.id)) {
          allSubs.push(c);
        }
      }

      for (const sub of allSubs) {
        const handler = getProactiveKind(sub.kind);
        if (!handler) {
          continue;
        }

        const ctx: ProactiveKindContext = {
          now,
          userProfileId: target.userProfileId,
          telegramChatId: target.telegramChatId,
          timezone: target.timezone,
          subscription: sub,
          signals,
        };

        await processSubscription(ctx, handler);
      }
    } catch (err) {
      logger.error(
        { err: String(err), userProfileId: target.userProfileId },
        "proactive dispatcher user failed",
      );
    }
  }
}
