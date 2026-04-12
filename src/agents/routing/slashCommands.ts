/**
 * Telegram `/command` → intent + department (skips classifier). See `docs/AGENT_ARCHITECTURE.md`.
 */
import type { Intent } from "../../intent.js";
import { intentToPillarRoute } from "./intentToPillarRoute.js";
import type { DepartmentId } from "./pillarTypes.js";

export type SlashDirectRoute = {
  /** Canonical command (after alias resolution), e.g. `relationships` for `/relationship`. */
  commandKey: string;
  intent: Intent;
  department: DepartmentId;
  payload: string;
  forceResearch: boolean;
};

type CommandDef = {
  intent: Intent;
  department: DepartmentId;
  forceResearch?: boolean;
};

/** Map alternate spellings to a single COMMAND_MAP key (prompts + metadata stay consistent). */
const COMMAND_ALIASES: Record<string, string> = {
  relationship: "relationships",
  investing: "invest",
  travel: "trip",
};

const INVEST: CommandDef = { intent: "WEALTH", department: "investment" };
const TRIP: CommandDef = { intent: "HAPPINESS", department: "adventure_trips" };

const COMMAND_MAP: Record<string, CommandDef> = {
  meal: { intent: "HEALTH", department: "nutrition" },
  health: { intent: "HEALTH", department: "nutrition" },
  nutrition: { intent: "HEALTH", department: "nutrition" },
  workouts: { intent: "HEALTH", department: "workouts" },
  training: { intent: "HEALTH", department: "workouts" },
  longhealth: { intent: "HEALTH", department: "long_term_health_planning" },
  notion: { intent: "NOTION", department: "learning_plan_development" },
  plan: { intent: "PLANNING", department: "tracking_habits" },
  learn: { intent: "LEARNING", department: "learning_plan_development" },
  track: { intent: "LEARNING", department: "tracking_habits" },
  build: { intent: "BUILD", department: "build_ship" },
  research: {
    intent: "GENERAL",
    department: "tracking_habits",
    forceResearch: true,
  },
  wealth: { intent: "WEALTH", department: "trading" },
  trade: { intent: "WEALTH", department: "trading" },
  invest: INVEST,
  fire: { intent: "WEALTH", department: "fire_independence_goals" },
  networth: { intent: "WEALTH", department: "net_worth_balance_sheet" },
  finance: { intent: "WEALTH", department: "long_term_financial_planning" },
  relationships: { intent: "RELATIONSHIPS", department: "relationships" },
  trip: TRIP,
  culture: { intent: "CULTURE", department: "culture_leisure" },
};

/** Defaults when `/command` has no body — keyed by canonical command only. */
export const DEFAULT_SLASH_PROMPTS: Partial<Record<string, string>> = {
  meal: "Log this meal — describe what you ate (foods and rough amounts).",
  health: "What should I focus on for health today — training, food, or recovery?",
  nutrition: "Help me with a nutrition question or meal idea within my constraints.",
  workouts: "Help me with today’s workout — intensity, structure, or recovery.",
  training: "Help me plan or adjust my training given my goals and energy.",
  longhealth: "Help me think about my health or training over the next weeks or months.",
  notion: "I want to work with my Notion LifeOS — log, query, or organize.",
  plan: "Help me prioritize today or this week within LifeOS locked-day rules.",
  learn: "Help me design or adjust a learning plan (milestones, topics, spaced practice).",
  track: "Weekly learning review — what moved, what felt stuck, one next step.",
  build: "Help me scope or ship something — milestones, risks, next action.",
  research: "Pick a topic I care about and summarize credible sources with links.",
  wealth: "Help me think about money, trading process, or discipline—no trade picks.",
  trade: "Trading journal / process review — habits, discipline, not buy/sell advice.",
  invest: "Help me think about allocation, thesis, or long-term investing—no personalized advice.",
  fire: "Help me think about FIRE or independence goals and trade-offs.",
  networth: "Help me think about net worth, categories, or reconciliation—no broker data unless I paste it.",
  finance: "Help me think about cash flow, milestones, or scenarios—no personalized advice.",
  relationships: "Help me prepare for a conversation, boundaries, or social energy.",
  trip: "Help me sketch a trip — pacing, constraints, packing ideas (no booking).",
  culture: "Suggest books, films, or poetry aligned to my mood and taste.",
};

export function parseSlashCommand(text: string): SlashDirectRoute | null {
  const t = text.trim();
  const m = t.match(/^\/([a-zA-Z][a-zA-Z0-9_]*)(@\S+)?(?:\s+(.*))?$/s);
  if (!m) {
    return null;
  }
  const raw = m[1].toLowerCase();
  const canonical = COMMAND_ALIASES[raw] ?? raw;
  const rest = m[3]?.trim() ?? "";
  const mapped = COMMAND_MAP[canonical];
  if (!mapped) {
    return null;
  }

  const forceResearch = mapped.forceResearch === true;
  const intent: Intent = forceResearch ? "GENERAL" : mapped.intent;
  const department: DepartmentId = forceResearch
    ? (intentToPillarRoute("GENERAL").department as DepartmentId)
    : mapped.department;

  return {
    commandKey: canonical,
    intent,
    department,
    payload: rest,
    forceResearch,
  };
}

export function effectiveSlashUserMessage(route: SlashDirectRoute): string {
  if (route.payload.trim().length > 0) {
    return route.payload.trim();
  }
  const d = DEFAULT_SLASH_PROMPTS[route.commandKey];
  if (d) {
    return d;
  }
  return `/${route.commandKey}`;
}

export type TelegramBotCommand = { command: string; description: string };

/** Shown on inline keyboard buttons (Telegram `setMyCommands` list is separate). */
export const INLINE_MENU_LABEL: Record<string, string> = {
  meal: "Meal",
  health: "Health",
  workouts: "Workouts",
  longhealth: "Long health",
  notion: "Notion",
  plan: "Plan",
  learn: "Learn",
  track: "Track",
  build: "Build",
  research: "Research",
  wealth: "Wealth",
  invest: "Invest",
  fire: "FIRE",
  networth: "Net worth",
  finance: "Finance",
  relationships: "Relationships",
  trip: "Trip",
  culture: "Culture",
  morningbrief: "Morning brief",
};

/** `/menu` + inline keyboard — avoids Telegram auto-sending every `/command` from the native menu. */
export const TELEGRAM_MENU_COMMAND: TelegramBotCommand = {
  command: "menu",
  description: "Department picker — choose lane, then type your message",
};

export const TELEGRAM_MINIMAL_BOT_COMMANDS: readonly TelegramBotCommand[] = [
  TELEGRAM_MENU_COMMAND,
  { command: "meal", description: "Log a meal (nutrition pipeline)" },
];

/**
 * `full` — register every slash command in the Telegram menu (native menu may auto-send on tap).
 * `minimal` (default) — register `/menu` + `/meal` only; use `/menu` for the full inline picker.
 */
export function getTelegramBotCommandsForRegistration(): readonly TelegramBotCommand[] {
  const mode = process.env.MAGNUS_TELEGRAM_COMMANDS_MODE?.trim().toLowerCase();
  if (mode === "full") {
    return TELEGRAM_BOT_COMMANDS;
  }
  return TELEGRAM_MINIMAL_BOT_COMMANDS;
}

export function isSlashCommandKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(COMMAND_MAP, key);
}

/** One button per registered slash command (for `/menu` inline keyboard). */
export function inlineKeyboardCommands(): readonly { command: string; label: string }[] {
  return TELEGRAM_BOT_COMMANDS.map(({ command }) => ({
    command,
    label: INLINE_MENU_LABEL[command] ?? command,
  }));
}

export const TELEGRAM_BOT_COMMANDS: readonly TelegramBotCommand[] = [
  { command: "meal", description: "Log a meal (nutrition pipeline)" },
  { command: "health", description: "Health pillar — coaching" },
  { command: "workouts", description: "Training / workouts" },
  { command: "longhealth", description: "Seasons, long-term health planning" },
  { command: "notion", description: "Notion LifeOS — logs, goals, check-ins" },
  { command: "plan", description: "Planner — day/week priorities" },
  { command: "learn", description: "Learning plan — curriculum" },
  { command: "track", description: "Learning tracker — weekly review" },
  { command: "build", description: "Build & ship — projects" },
  { command: "research", description: "Research with sources" },
  { command: "wealth", description: "Wealth — default trading copilot" },
  { command: "invest", description: "Investment lens" },
  { command: "fire", description: "FIRE / independence goals" },
  { command: "networth", description: "Net worth / balance sheet" },
  { command: "finance", description: "Long-term financial planning" },
  { command: "relationships", description: "Joy — relationships" },
  { command: "trip", description: "Joy — trips / adventure" },
  { command: "culture", description: "Joy — books, film, poetry" },
  { command: "morningbrief", description: "Morning Brief (read-only)" },
];
