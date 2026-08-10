/**
 * Context-aware vision: infer what a Telegram photo means for Magnus and the user.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { parseIntent, type Intent } from "../intent.js";
import { anthropic } from "../tools/clients.js";
import type { TelegramPhotoPayload } from "../meals/telegramPhotoDownload.js";
import type { PhotoPurpose, PhotoVisionAnalysis } from "./types.js";

const VISION_MODEL = process.env.MAGNUS_VISION_MODEL?.trim() || "claude-sonnet-4-6";

export type PhotoTurnPreview = { role: "user" | "assistant"; preview: string };

const VISION_SYSTEM = `You analyze photos for Magnus — a personal Telegram assistant with five areas:

- **HEALTH** — meals, food, workouts, body, sleep, recovery
- **WEALTH** — money, receipts, spending, investments
- **HAPPINESS** — books, film, music, games, hobbies, leisure, relationships
- **WISDOM** — learning, skills, career, projects
- **GENERAL** — calendar, lists (readlist, watchlist, tasks), journaling, YouTube, day overview, cross-cutting actions

Given the image, optional user caption, and recent chat previews, decide what the user is trying to do **this turn**.

Output ONLY valid JSON:
{
  "purpose": "meal_log|list_items|receipt|workout|document|schedule|general",
  "intent": "HEALTH|WEALTH|HAPPINESS|WISDOM|GENERAL",
  "description": "concise description of what you see (under 200 words)",
  "extracted_text": "verbatim text visible in the image, or null",
  "extracted_items": ["item1", "item2"],
  "confidence": 0.0-1.0
}

Rules:
- **meal_log** only when the photo is clearly food/a drink to log — plate, meal, snack, menu dish.
- **list_items** when the user is sharing items to save (book covers/spines, product shelf, screenshot of titles) — especially when recent chat mentions readlist, watchlist, or "add these".
- **receipt** for bills, invoices, payment screenshots → intent WEALTH.
- **workout** for gym equipment, exercise form, Hevy-style screens → intent HEALTH.
- **schedule** for calendar/agenda screenshots → intent GENERAL.
- **document** for notes, screenshots of text, articles → pick best intent from chat context.
- **general** when ambiguous.
- Prefer **recent chat context** over guessing: if they were adding books to a readlist, purpose=list_items and intent=GENERAL even if caption is vague.
- extracted_items: list every distinct book title, food name, or actionable item you can read or infer.
- intent GENERAL when the action is lists, calendar, or multi-pillar — not HAPPINESS for "add to readlist" (Magnus tools live under GENERAL).`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

function parsePurpose(raw: unknown): PhotoPurpose {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const allowed: PhotoPurpose[] = [
    "meal_log",
    "list_items",
    "receipt",
    "workout",
    "document",
    "schedule",
    "general",
  ];
  return allowed.includes(s as PhotoPurpose) ? (s as PhotoPurpose) : "general";
}

function parseAnalysisJson(text: string): PhotoVisionAnalysis | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const row = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const description = typeof row.description === "string" ? row.description.trim() : "";
    if (!description) {
      return null;
    }
    const confidence =
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0.5;
    const extracted_items = Array.isArray(row.extracted_items)
      ? row.extracted_items
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
      : undefined;
    const extracted_text =
      typeof row.extracted_text === "string" && row.extracted_text.trim()
        ? row.extracted_text.trim()
        : null;

    return {
      purpose: parsePurpose(row.purpose),
      intent_hint: parseIntent(typeof row.intent === "string" ? row.intent : "GENERAL"),
      description,
      extracted_text,
      extracted_items: extracted_items?.length ? extracted_items : undefined,
      confidence,
    };
  } catch {
    return null;
  }
}

function formatRecentTurns(turns: PhotoTurnPreview[]): string {
  if (!turns.length) {
    return "(no recent turns)";
  }
  return turns
    .map((t) => `${t.role === "assistant" ? "Magnus" : "User"}: ${t.preview}`)
    .join("\n");
}

export async function analyzePhotoInContext(input: {
  photo: TelegramPhotoPayload;
  caption?: string | null;
  recentTurns?: PhotoTurnPreview[];
}): Promise<PhotoVisionAnalysis> {
  const caption = input.caption?.trim();
  const userText = [
    caption ? `User caption: ${caption}` : "No caption.",
    "",
    "Recent conversation (newest last):",
    formatRecentTurns(input.recentTurns ?? []),
  ].join("\n");

  const msg = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 700,
    system: VISION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.photo.mediaType,
              data: input.photo.base64,
            },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  });

  const parsed = parseAnalysisJson(textFromMessage(msg));
  if (parsed) {
    return parsed;
  }

  return {
    purpose: caption && /\b(meal|food|ate|lunch|dinner|breakfast|snack)\b/i.test(caption)
      ? "meal_log"
      : "general",
    intent_hint: "GENERAL" as Intent,
    description: caption
      ? `User shared a photo with caption: ${caption}`
      : "User shared a photo without a clear caption.",
    confidence: 0.3,
  };
}
