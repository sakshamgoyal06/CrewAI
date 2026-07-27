/**
 * `/start` and `/help` — answered locally (no classifier, no Claude call) so a fresh chat or a
 * "what can you do?" tap never spends a turn guessing. Group membership is asserted in tests
 * against the registered command list, so a new lane cannot silently drop out of `/help`.
 */
import {
  TELEGRAM_BOT_COMMANDS,
  type TelegramBotCommand,
} from "../agents/routing/slashCommands.js";

export type CommandGroup = {
  title: string;
  commands: readonly string[];
};

export const HELP_GROUPS: readonly CommandGroup[] = [
  {
    title: "Health",
    commands: ["health", "workouts", "hevy", "meal", "journal", "longhealth"],
  },
  {
    title: "Wealth",
    commands: ["wealth", "invest", "fire", "networth", "finance"],
  },
  {
    title: "Wisdom",
    commands: ["plan", "learn", "track", "build", "research", "notion"],
  },
  {
    title: "Joy",
    commands: ["relationships", "trip", "culture"],
  },
  {
    title: "Rituals",
    commands: ["morningbrief"],
  },
];

function descriptionFor(command: string): string {
  const found: TelegramBotCommand | undefined = TELEGRAM_BOT_COMMANDS.find(
    (c) => c.command === command,
  );
  return found?.description ?? command;
}

export function buildStartMessage(): string {
  return [
    "<b>Magnus is online.</b>",
    "",
    "Talk to me in plain English — I route each message to the right specialist (health, wealth, wisdom, joy) and remember the thread.",
    "",
    "Three ways in:",
    "• Just type — “should I train today?”, “log a meal: 2 eggs and toast”, “plan my week”.",
    "• /menu — pick a lane, then send your message.",
    "• A slash command — /health, /meal, /journal, /plan, /research and friends.",
    "",
    "/help lists every lane.",
  ].join("\n");
}

export function buildHelpMessage(): string {
  const lines: string[] = ["<b>Magnus commands</b>", ""];

  for (const group of HELP_GROUPS) {
    lines.push(`<b>${group.title}</b>`);
    for (const command of group.commands) {
      lines.push(`/${command} — ${descriptionFor(command)}`);
    }
    lines.push("");
  }

  lines.push(
    "<b>Getting around</b>",
    "/menu — inline picker for every lane",
    "/help — this list",
    "",
    "A command with no text uses a sensible default prompt, so tapping one from the menu always does something useful. Plain text works too — routing is automatic.",
  );

  return lines.join("\n");
}

function isBareCommand(text: string, name: string): boolean {
  return new RegExp(`^/${name}(?:@\\S+)?\\s*$`, "i").test(text.trim());
}

export function isStartCommand(text: string): boolean {
  return isBareCommand(text, "start");
}

export function isHelpCommand(text: string): boolean {
  return isBareCommand(text, "help");
}

export function isMenuCommand(text: string): boolean {
  return isBareCommand(text, "menu");
}
