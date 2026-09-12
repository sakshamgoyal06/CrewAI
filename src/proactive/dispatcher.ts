import { isMinimalProactiveKindEnabled } from "../config/minimalMode.js";
import { logger } from "../logger.js";
import { armEveningJournalPendingAfterNudge } from "../logging/handleEveningJournalPending.js";
import { getProactiveKind } from "./kinds/registry.js";
import type { ProactiveKindContext } from "./kinds/types.js";
import { incrementAdaptiveCap, runProactiveGuards } from "./guards.js";
import { sendProactiveTelegram } from "./outbound.js";
import { buildProactiveSignals } from "./signals.js";
import { ensureDefaultRhythmSubscriptionsOncePerDay } from "./subscriptions/ensureDefaults.js";
import {
  expireStaleOneShotReminders,
  listDueCustomReminders,
  listEnabledSubscriptions,
  markSubscriptionSent,
} from "./subscriptions/store.js";
import type { ProactiveSubscription } from "./subscriptions/types.js";
import {
  DEFAULT_CATALOG_CAP,
  DEFAULT_CATALOG_COOLDOWN_HOURS,
  DEFAULT_CATALOG_SCHEDULE,
  DEFAULT_CATALOG_TRIGGER,
} from "./subscriptions/types.js";
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
  options?: { skipMarkSent?: boolean },
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

  if (!options?.skipMarkSent) {
    await markSubscriptionSent(ctx.subscription.id, ctx.now, {
      disable: ctx.subscription.triggerType === "one_shot",
    });
  }

  if (ctx.subscription.kind === "evening_journal") {
    await armEveningJournalPendingAfterNudge(ctx.userProfileId, ctx.signals.local.dateKey);
  }

  if (handler.capBucket === "adaptive") {
    await incrementAdaptiveCap(ctx.userProfileId, ctx.signals.local.dateKey);
  }
}

/** Companion kinds run automatically when their parent catalog kind is enabled. */
const COMPANION_PARENT_KIND: Record<string, string> = {
  evening_log_followup: "evening_journal",
};

function syntheticCompanionSubscription(
  userProfileId: string,
  kind: string,
): ProactiveSubscription {
  const cap = DEFAULT_CATALOG_CAP[kind as keyof typeof DEFAULT_CATALOG_CAP] ?? "adaptive";
  return {
    id: `companion:${kind}:${userProfileId}`,
    userProfileId,
    kind,
    enabled: true,
    triggerType: DEFAULT_CATALOG_TRIGGER[kind as keyof typeof DEFAULT_CATALOG_TRIGGER] ?? "conditional",
    schedule: DEFAULT_CATALOG_SCHEDULE[kind as keyof typeof DEFAULT_CATALOG_SCHEDULE] ?? {
      type: "conditional",
    },
    config: {},
    userInstruction: null,
    source: "system_default",
    capBucket: cap,
    cooldownHours: DEFAULT_CATALOG_COOLDOWN_HOURS[kind as keyof typeof DEFAULT_CATALOG_COOLDOWN_HOURS] ?? null,
    lastSentAt: null,
    nextFireAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

/**
 * Evaluate subscription-based proactive messages for all allowlisted users.
 */
export async function runProactiveDispatcher(now: Date): Promise<void> {
  await expireStaleOneShotReminders(now);

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

      await ensureDefaultRhythmSubscriptionsOncePerDay(
        target.userProfileId,
        signals.local.dateKey,
      );

      const subs = await listEnabledSubscriptions(target.userProfileId);
      const customDue = dueCustomByUser.get(target.userProfileId) ?? [];
      const allSubs = [...subs];
      for (const c of customDue) {
        if (!allSubs.some((s) => s.id === c.id)) {
          allSubs.push(c);
        }
      }

      for (const sub of allSubs) {
        if (!isMinimalProactiveKindEnabled(sub.kind)) {
          continue;
        }
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

      for (const [companionKind, parentKind] of Object.entries(COMPANION_PARENT_KIND)) {
        if (!isMinimalProactiveKindEnabled(companionKind)) {
          continue;
        }
        if (!allSubs.some((s) => s.kind === parentKind && s.enabled)) {
          continue;
        }
        const handler = getProactiveKind(companionKind);
        if (!handler) {
          continue;
        }
        const ctx: ProactiveKindContext = {
          now,
          userProfileId: target.userProfileId,
          telegramChatId: target.telegramChatId,
          timezone: target.timezone,
          subscription: syntheticCompanionSubscription(target.userProfileId, companionKind),
          signals,
        };
        await processSubscription(ctx, handler, { skipMarkSent: true });
      }
    } catch (err) {
      logger.error(
        { err: String(err), userProfileId: target.userProfileId },
        "proactive dispatcher user failed",
      );
    }
  }
}
