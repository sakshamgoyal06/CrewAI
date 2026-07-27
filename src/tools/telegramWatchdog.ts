/**
 * Keeps an unattended deploy honest.
 *
 * A hosted bot fails quietly in two ways: the Telegram connection dies while the process stays
 * healthy enough to pass `/health`, or the webhook registration drifts (someone ran
 * `telegram:setup` elsewhere, or Telegram dropped it after repeated errors). Neither shows up until
 * you message the bot and get silence.
 *
 * So: probe `getMe` on an interval, re-register a drifted webhook in place, and if the API stays
 * unreachable for `failureThreshold` consecutive probes, exit non-zero so the platform's restart
 * policy gives us a fresh process.
 */
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";

export type WatchdogDeps = {
  getMe: () => Promise<unknown>;
  /** Webhook mode only: current registration and how to restore it. */
  getWebhookUrl?: () => Promise<string>;
  expectedWebhookUrl?: string;
  repairWebhook?: () => Promise<void>;
  /** Called instead of `process.exit` in tests. */
  onFatal: (reason: string) => void;
  intervalMs: number;
  failureThreshold: number;
};

export type WatchdogState = {
  consecutiveFailures: number;
  lastOkAt: number | null;
};

/** Default 60s; `MAGNUS_TELEGRAM_WATCHDOG_INTERVAL_MS=0` disables the watchdog entirely. */
export function watchdogIntervalMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAGNUS_TELEGRAM_WATCHDOG_INTERVAL_MS?.trim();
  if (raw === undefined || raw === "") {
    return 60_000;
  }
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n) || n < 0) {
    return 60_000;
  }
  return n;
}

/** Consecutive failed probes before the process gives up and restarts. Default 5. */
export function watchdogFailureThreshold(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.MAGNUS_TELEGRAM_WATCHDOG_FAILURES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isNaN(n) || n < 1) {
    return 5;
  }
  return n;
}

export function shouldRestart(state: WatchdogState, failureThreshold: number): boolean {
  return state.consecutiveFailures >= failureThreshold;
}

/** Telegram normalises the URL it echoes back, so compare after trimming trailing slashes. */
export function webhookDrifted(current: string, expected: string): boolean {
  const norm = (u: string): string => u.trim().replace(/\/+$/, "");
  return norm(current) !== norm(expected);
}

export async function runWatchdogProbe(
  deps: WatchdogDeps,
  state: WatchdogState,
): Promise<WatchdogState> {
  try {
    await deps.getMe();
  } catch (e) {
    const next: WatchdogState = {
      consecutiveFailures: state.consecutiveFailures + 1,
      lastOkAt: state.lastOkAt,
    };
    logger.warn(
      { err: loggableError(e), consecutiveFailures: next.consecutiveFailures },
      "telegram watchdog probe failed",
    );
    if (shouldRestart(next, deps.failureThreshold)) {
      deps.onFatal(
        `Telegram API unreachable for ${next.consecutiveFailures} consecutive probes`,
      );
    }
    return next;
  }

  if (deps.getWebhookUrl && deps.expectedWebhookUrl && deps.repairWebhook) {
    try {
      const current = await deps.getWebhookUrl();
      if (webhookDrifted(current, deps.expectedWebhookUrl)) {
        logger.warn(
          { hadRegistration: current.length > 0 },
          "telegram webhook drifted; re-registering",
        );
        await deps.repairWebhook();
      }
    } catch (e) {
      logger.warn({ err: loggableError(e) }, "telegram webhook check failed");
    }
  }

  return { consecutiveFailures: 0, lastOkAt: Date.now() };
}

/** Returns a stop function; a zero interval means "disabled" and stops nothing. */
export function startTelegramWatchdog(deps: WatchdogDeps): () => void {
  if (deps.intervalMs <= 0) {
    logger.info("telegram watchdog disabled");
    return () => {};
  }

  let state: WatchdogState = { consecutiveFailures: 0, lastOkAt: null };
  const timer = setInterval(() => {
    void runWatchdogProbe(deps, state).then((next) => {
      state = next;
    });
  }, deps.intervalMs);
  timer.unref?.();

  logger.info(
    { intervalMs: deps.intervalMs, failureThreshold: deps.failureThreshold },
    "telegram watchdog started",
  );
  return () => clearInterval(timer);
}
