/**
 * LLM parser for project setup turns — no regex lock/cancel/skip routing.
 */
import { anthropic } from "../tools/clients.js";
import { logger } from "../logger.js";
import { loggableError } from "../util/loggableError.js";
import type { ProjectSessionRow } from "./types.js";
import { PROJECT_THEMES } from "./themes/index.js";

const PARSER_MODEL =
  process.env.MAGNUS_PROJECT_SETUP_PARSER_MODEL?.trim() || "claude-haiku-4-5";

export type ProjectSetupIntent =
  | "lock"
  | "cancel_setup"
  | "skip_defaults"
  | "revise_draft"
  | "provide_scope"
  | "show_review";

export type ParsedProjectSetupTurn = {
  intent: ProjectSetupIntent;
  confidence: number;
  theme_id: string;
  title: string | null;
  outcome: string | null;
  target_date: string | null;
  checklist: string[] | null;
  milestones: string[] | null;
  parser: "llm" | "fallback";
};

type RawParserJson = {
  intent?: string;
  confidence?: number;
  theme_id?: string;
  title?: string | null;
  outcome?: string | null;
  target_date?: string | null;
  checklist?: unknown;
  milestones?: unknown;
};

const VALID_INTENTS = new Set<ProjectSetupIntent>([
  "lock",
  "cancel_setup",
  "skip_defaults",
  "revise_draft",
  "provide_scope",
  "show_review",
]);

const VALID_THEMES = new Set(Object.keys(PROJECT_THEMES));

function parseJsonBlock(text: string): RawParserJson | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as RawParserJson;
  } catch {
    return null;
  }
}

function normalizeStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const items = raw
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return items.length > 0 ? items : null;
}

function normalizeThemeId(raw: unknown, fallback: string): string {
  if (typeof raw === "string" && VALID_THEMES.has(raw.trim())) {
    return raw.trim();
  }
  return fallback;
}

function normalizeIntent(raw: unknown): ProjectSetupIntent {
  if (typeof raw === "string" && VALID_INTENTS.has(raw.trim() as ProjectSetupIntent)) {
    return raw.trim() as ProjectSetupIntent;
  }
  return "show_review";
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }
  const iso = raw.trim().match(/^20\d{2}-\d{2}-\d{2}$/);
  return iso ? iso[0]! : null;
}

export function normalizeProjectSetupParse(
  raw: RawParserJson,
  fallbackThemeId: string,
): ParsedProjectSetupTurn {
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.5;

  return {
    intent: normalizeIntent(raw.intent),
    confidence,
    theme_id: normalizeThemeId(raw.theme_id, fallbackThemeId),
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : null,
    outcome: typeof raw.outcome === "string" && raw.outcome.trim() ? raw.outcome.trim() : null,
    target_date: normalizeDate(raw.target_date),
    checklist: normalizeStringArray(raw.checklist),
    milestones: normalizeStringArray(raw.milestones),
    parser: "llm",
  };
}

function fallbackParse(_message: string, session: ProjectSessionRow | null): ParsedProjectSetupTurn {
  return {
    intent: session ? "show_review" : "provide_scope",
    confidence: 0.3,
    theme_id: session?.project_type ?? "custom",
    title: session?.draft_title ?? null,
    outcome: session?.draft_outcome ?? null,
    target_date: session?.draft_target_date ?? null,
    checklist: null,
    milestones: null,
    parser: "fallback",
  };
}

function buildSystemPrompt(): string {
  const themeList = Object.values(PROJECT_THEMES)
    .map((t) => `- ${t.id}: ${t.label}`)
    .join("\n");

  return `You parse one user message during Magnus **project setup** (multi-turn draft before lock).

Output ONLY valid JSON — no markdown.

Intents (pick exactly one):
- **lock** — user confirms and wants the draft saved as an active project now. Examples: "lock it in", "lock this in", "yes let's go", "sounds good ship it", "confirm", "start tracking this".
- **cancel_setup** — user stops or abandons this project plan entirely (even if they also ask something else in the same message). Examples: "cancel", "abandon job search", "never mind", "don't want to job search anymore", "park the job search", "forget the trip", "not doing this project", "decided to stay at my current company instead", "lets focus on tomorrow instead".
- **skip_defaults** — user accepts default checklist/milestones and wants to move to review without edits. Examples: "skip", "defaults are fine", "use your list".
- **revise_draft** — user wants specific changes to title, outcome, deadline, checklist, or milestones.
- **provide_scope** — user is supplying scope for a new or early draft (title, outcome, deadline, why).
- **show_review** — user asks to see the plan again, unclear message, or general question while draft exists.

Rules:
- Interpret meaning, not exact wording. Minor grammar differences must not change intent.
- At **review** step, prefer **lock** when user clearly confirms; prefer **cancel_setup** when they clearly quit the project (including "abandon", "drop", "stop", "don't want X anymore").
- Compound messages: if user abandons/cancels the project AND asks for something else (calendar, gym, meals), intent is still **cancel_setup** — the rest is handled by other capabilities after abandon.
- **theme_id** only when starting fresh (no session) or user explicitly switches project type. Valid: ${[...VALID_THEMES].join(", ")}.
- **target_date** only as YYYY-MM-DD when user gave a clear deadline; else null.
- **checklist** / **milestones**: only when user listed items to add/replace; else null.
- **confidence** 0.0–1.0 for the intent.

Themes:
${themeList}

Shape:
{"intent":"lock","confidence":0.95,"theme_id":"job_search","title":null,"outcome":null,"target_date":null,"checklist":null,"milestones":null}`;
}

export async function parseProjectSetupTurn(input: {
  message: string;
  session: ProjectSessionRow | null;
  fallbackThemeId?: string;
}): Promise<ParsedProjectSetupTurn> {
  const fallbackTheme = input.fallbackThemeId ?? input.session?.project_type ?? "custom";
  const trimmed = input.message.trim();
  if (!trimmed) {
    return fallbackParse(trimmed, input.session);
  }

  const sessionPayload = input.session
    ? {
        id: input.session.id,
        step: input.session.step,
        status: input.session.status,
        project_type: input.session.project_type,
        draft_title: input.session.draft_title,
        draft_outcome: input.session.draft_outcome,
        draft_target_date: input.session.draft_target_date,
        draft_checklist: input.session.draft_checklist,
        draft_milestones: input.session.draft_milestones,
      }
    : null;

  try {
    const msg = await anthropic.messages.create({
      model: PARSER_MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: JSON.stringify(
            {
              message: trimmed,
              has_active_session: Boolean(input.session),
              session: sessionPayload,
            },
            null,
            2,
          ),
        },
      ],
    });

    for (const block of msg.content) {
      if (block.type !== "text") {
        continue;
      }
      const parsed = parseJsonBlock(block.text);
      if (parsed) {
        return normalizeProjectSetupParse(parsed, fallbackTheme);
      }
    }
  } catch (e) {
    logger.warn({ err: loggableError(e) }, "project setup turn parser failed");
  }

  return { ...fallbackParse(trimmed, input.session), theme_id: fallbackTheme };
}

/** Minimum confidence to act on lock or cancel without re-prompting. */
export function projectSetupIntentActionable(
  parsed: ParsedProjectSetupTurn,
): boolean {
  if (parsed.intent === "lock" || parsed.intent === "cancel_setup") {
    return parsed.confidence >= 0.55;
  }
  return true;
}
