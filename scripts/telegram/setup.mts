/**
 * Telegram bot setup and doctor.
 *
 *   npm run telegram:check          read-only: env capabilities + what Telegram currently has
 *   npm run telegram:setup          apply: drop webhook, register commands, menu button, profile text
 *
 * Flags: --apply, --mode=minimal|core|full, --drop-pending, --probe-conflict, --json
 *
 * Safe to run against a live bot: the read-only path never mutates, and the apply path only
 * touches bot configuration (never messages or chats).
 */
import "dotenv/config";

import {
  capabilityLogFields,
  describeCapabilities,
  type Capability,
  type CapabilitySummary,
} from "../../src/config/magnusCapabilities.js";
import { getTelegramBotCommandsForRegistration } from "../../src/agents/routing/slashCommands.js";

const API_TIMEOUT_MS = 15_000;

const BOT_DESCRIPTION =
  "Magnus — your personal AI chief of staff. One chat for health, wealth, wisdom, and joy: " +
  "log meals and workouts, journal your day, plan the week, research with sources. " +
  "Type anything in plain English, or send /menu to pick a lane.";

const BOT_SHORT_DESCRIPTION =
  "Personal AI chief of staff — health, wealth, wisdom, joy. Type anything, or /menu.";

type Flags = {
  apply: boolean;
  mode?: string;
  dropPending: boolean;
  probeConflict: boolean;
  json: boolean;
};

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = {
    apply: false,
    dropPending: false,
    probeConflict: false,
    json: false,
  };
  for (const arg of argv) {
    if (arg === "--apply") {
      flags.apply = true;
    } else if (arg === "--drop-pending") {
      flags.dropPending = true;
    } else if (arg === "--probe-conflict") {
      flags.probeConflict = true;
    } else if (arg === "--json") {
      flags.json = true;
    } else if (arg.startsWith("--mode=")) {
      flags.mode = arg.slice("--mode=".length).trim().toLowerCase();
    } else {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    }
  }
  return flags;
}

type ApiResult<T> =
  | { ok: true; result: T }
  | { ok: false; errorCode?: number; description: string };

async function api<T>(
  token: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const payload = (await res.json()) as {
      ok: boolean;
      result?: T;
      error_code?: number;
      description?: string;
    };
    if (payload.ok && payload.result !== undefined) {
      return { ok: true, result: payload.result };
    }
    return {
      ok: false,
      errorCode: payload.error_code,
      description: payload.description ?? `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      description: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

const MARK: Record<Capability["status"], string> = {
  ready: "ok  ",
  partial: "warn",
  off: "off ",
};

function printCapabilities(summary: CapabilitySummary): void {
  console.log("\nRequired to boot");
  for (const req of summary.core) {
    const mark = req.ok ? "ok  " : "MISS";
    console.log(`  [${mark}] ${req.label}${req.ok ? "" : ` — ${req.detail}`}`);
    if (!req.ok) {
      console.log(`         set one of: ${req.vars.join(", ")}`);
    }
  }

  console.log(
    summary.coreOk
      ? "\nWhat this environment can do"
      : "\nWhat this environment would do once the required variables above are set",
  );
  for (const cap of summary.capabilities) {
    console.log(`  [${MARK[cap.status]}] ${cap.title} (${cap.telegram})`);
    console.log(`         ${cap.detail}`);
    if (cap.missing.length > 0) {
      console.log(`         set: ${cap.missing.join(", ")}`);
    }
  }
}

async function reportWebhook(
  token: string,
  flags: Flags,
): Promise<{ hadWebhook: boolean; pending: number }> {
  const info = await api<{
    url?: string;
    pending_update_count?: number;
    last_error_message?: string;
  }>(token, "getWebhookInfo");

  if (!info.ok) {
    console.log(`  webhook: could not read (${info.description})`);
    return { hadWebhook: false, pending: 0 };
  }

  const url = info.result.url?.trim() ?? "";
  const pending = info.result.pending_update_count ?? 0;

  if (!url) {
    console.log(`  webhook: none (long polling) — ${pending} pending update(s)`);
    return { hadWebhook: false, pending };
  }

  console.log(`  webhook: ${url} — conflicts with long polling`);
  if (!flags.apply) {
    console.log("           run `npm run telegram:setup` to remove it");
    return { hadWebhook: true, pending };
  }

  const del = await api<boolean>(token, "deleteWebhook", {
    drop_pending_updates: flags.dropPending,
  });
  console.log(
    del.ok
      ? `           removed${flags.dropPending ? " (pending updates dropped)" : ""}`
      : `           delete failed: ${del.description}`,
  );
  return { hadWebhook: true, pending };
}

async function probeConflict(token: string): Promise<void> {
  const res = await api<unknown[]>(token, "getUpdates", { offset: -1, timeout: 0, limit: 1 });
  if (res.ok) {
    console.log("  pollers: no other process answered — this token looks free");
    return;
  }
  if (res.errorCode === 409) {
    console.log(
      "  pollers: 409 Conflict — another process is polling this token (local dev or a second deploy). Stop one.",
    );
    return;
  }
  console.log(`  pollers: probe inconclusive (${res.description})`);
}

async function applyBotConfig(token: string, flags: Flags): Promise<boolean> {
  if (flags.mode) {
    process.env.MAGNUS_TELEGRAM_COMMANDS_MODE = flags.mode;
  }
  const commands = [...getTelegramBotCommandsForRegistration()];

  const set = await api<boolean>(token, "setMyCommands", { commands });
  if (!set.ok) {
    console.log(`  commands: failed — ${set.description}`);
    return false;
  }
  console.log(
    `  commands: registered ${commands.length} (${process.env.MAGNUS_TELEGRAM_COMMANDS_MODE ?? "core"}) — ${commands
      .map((c) => `/${c.command}`)
      .join(" ")}`,
  );

  const button = await api<boolean>(token, "setChatMenuButton", {
    menu_button: { type: "commands" },
  });
  console.log(
    button.ok
      ? "  menu button: shows the command list"
      : `  menu button: failed — ${button.description}`,
  );

  const desc = await api<boolean>(token, "setMyDescription", {
    description: BOT_DESCRIPTION,
  });
  const shortDesc = await api<boolean>(token, "setMyShortDescription", {
    short_description: BOT_SHORT_DESCRIPTION,
  });
  console.log(
    desc.ok && shortDesc.ok
      ? "  profile text: description and short description updated"
      : `  profile text: partial — ${[desc, shortDesc]
          .filter((r) => !r.ok)
          .map((r) => (r.ok ? "" : r.description))
          .join("; ")}`,
  );

  return true;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.mode) {
    process.env.MAGNUS_TELEGRAM_COMMANDS_MODE = flags.mode;
  }

  const summary = describeCapabilities(process.env);

  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(
      `Magnus Telegram ${flags.apply ? "setup" : "check"} — NODE_ENV=${process.env.NODE_ENV ?? "development"}`,
    );
    printCapabilities(summary);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.log(
      "\nNo TELEGRAM_BOT_TOKEN. Create a bot with @BotFather (/newbot), then put the token in .env.",
    );
    process.exit(1);
  }

  console.log("\nTelegram");
  const me = await api<{ username?: string; first_name?: string; id?: number }>(
    token,
    "getMe",
  );
  if (!me.ok) {
    console.log(`  getMe failed: ${me.description}`);
    console.log("  The token is wrong or revoked — get a fresh one from @BotFather.");
    process.exit(1);
  }
  console.log(`  bot: @${me.result.username ?? "unknown"} (${me.result.first_name ?? ""})`);

  await reportWebhook(token, flags);

  if (flags.probeConflict) {
    await probeConflict(token);
  }

  if (flags.apply) {
    const applied = await applyBotConfig(token, flags);
    if (!applied) {
      process.exit(1);
    }
  } else {
    const current = await api<{ command: string }[]>(token, "getMyCommands");
    console.log(
      current.ok
        ? `  commands now: ${
            current.result.length > 0
              ? current.result.map((c) => `/${c.command}`).join(" ")
              : "none registered"
          }`
        : `  commands now: unreadable (${current.description})`,
    );
    console.log("\nRead-only. Run `npm run telegram:setup` to apply the configuration above.");
  }

  console.log(
    `\nSummary: ${JSON.stringify(capabilityLogFields(summary))}`,
  );

  if (!summary.coreOk) {
    console.log("Core requirements are incomplete — the bot will not boot until they are set.");
    process.exit(1);
  }
}

await main();
