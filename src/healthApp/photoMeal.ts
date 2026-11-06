/**
 * Photo meal logging: a picture of the plate becomes the same editable draft a typed meal does.
 *
 * Claude looks at the photo and writes what's on the plate as a plain meal description with
 * portions ("2 roti, 1 bowl dal, 150 g paneer bhurji"). That text then goes through the normal
 * estimator, so nutrition still comes from our ingredient database (and the web only for unseen
 * foods), and the person checks and confirms the card as usual. Nothing is logged from a photo
 * without that confirm. The photo itself is not stored.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { anthropic } from "../tools/clients.js";
import { MEAL_SLOTS } from "./meals.js";
import { photoMealModel } from "../models.js";

export const PHOTO_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
/**
 * Base64 length cap (~11 MB file). The app shrinks photos to a ~1280 px JPEG first; only a photo
 * its browser can't open (HEIC, a huge camera JPEG) comes as the original, and photoImage.ts
 * converts it before the model sees it.
 */
export const MAX_PHOTO_BASE64 = 15_000_000;

export const photoMealInput = z.object({
  image: z
    .string()
    .min(100)
    .max(MAX_PHOTO_BASE64)
    .regex(/^[A-Za-z0-9+/=]+$/, "expected base64"),
  /** What the browser said the file was. Only a hint: the server reads the real type from the bytes. */
  mediaType: z.string().max(100).optional(),
  /** Anything the person typed with the photo ("half of this", "no rice"). */
  note: z.string().trim().max(300).optional(),
  slot: z.enum(MEAL_SLOTS).optional(),
});
/** After photoImage.ts has checked and converted the bytes: what the vision model gets. */
export type PhotoMealInput = Omit<z.infer<typeof photoMealInput>, "mediaType"> & { mediaType: (typeof PHOTO_MEDIA_TYPES)[number] };

export { photoMealModel };

export type PhotoFood = { name: string; amount: string };

export type PhotoReading =
  | { ok: true; text: string; foods: PhotoFood[]; assumption: string | null }
  | { ok: false; error: "not_food" | "unreadable"; message: string };

const REPORT_TOOL: Anthropic.Tool = {
  name: "report_meal",
  description: "Report the foods visible in the photo with portion estimates.",
  input_schema: {
    type: "object",
    properties: {
      is_food: { type: "boolean", description: "False if the photo isn't a meal, drink or food label." },
      foods: {
        type: "array",
        description: "One entry per distinct food or drink, as it would be logged.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Common name, e.g. 'roti', 'dal tadka', 'paneer bhurji', 'black coffee'." },
            amount: {
              type: "string",
              description:
                "Portion in a natural measure: a count ('2'), grams or ml ('150 g', '250 ml'), or a household unit ('1 bowl', '1 cup', '2 slice', '1 tbsp').",
            },
          },
          required: ["name", "amount"],
        },
      },
      assumption: {
        type: "string",
        description: "One short sentence on the biggest guess (portion size, oil, hidden ingredients).",
      },
    },
    required: ["is_food", "foods"],
  },
};

const PROMPT = `This is a photo of something the person is about to eat or just ate. List each food and drink you can see with a realistic portion for what's on the plate.
- Use the names people actually log (Indian dishes by their usual names: roti, paratha, dal, sabzi, rajma, poha…).
- Prefer counts for countable items (2 roti, 3 idli, 2 egg) and grams or a household unit (bowl, cup, tbsp) for the rest.
- If a label or packet is shown, use its product name and the serving shown.
- Don't list garnish or condiments unless they're a real portion (a spoon of ghee counts).
- If the person added a note, it overrides what you see (e.g. "ate half", "no rice").
Answer only by calling the report_meal tool, even when it isn't food (is_food false).`;

/** "2 roti, 1 bowl dal" from the model's list; amounts that already start the name aren't repeated. */
export function foodsToText(foods: PhotoFood[]): string {
  return foods
    .map((f) => {
      const name = f.name.trim().replace(/\s+/g, " ");
      const amount = f.amount.trim().replace(/\s+/g, " ");
      if (!name) return "";
      if (!amount || /^\d/.test(name)) return name;
      // "2" + "roti" → "2 roti"; "1 bowl" + "dal" → "1 bowl dal"; "a bowl" → "1 bowl".
      return `${amount.replace(/^an?\s+/i, "1 ")} ${name}`;
    })
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
}

type CreateFn = (params: Record<string, unknown>) => Promise<Anthropic.Message>;

/** Reads the plate. Returns the meal as text for the normal estimator. */
export async function readMealPhoto(
  input: PhotoMealInput,
  create: CreateFn = (p) => anthropic.messages.create(p as never) as Promise<Anthropic.Message>,
): Promise<PhotoReading> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: input.mediaType, data: input.image } },
    { type: "text", text: input.note ? `${PROMPT}\n\nThe person's note: ${input.note}` : PROMPT },
  ];
  const msg = await create({
    model: photoMealModel(),
    max_tokens: 1024,
    tools: [REPORT_TOOL],
    // Current models reject a forced tool_choice ("tool"/"any"), so ask for the call in the prompt.
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content }],
  });
  const use = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  const parsed = z
    .object({
      is_food: z.boolean(),
      foods: z.array(z.object({ name: z.string(), amount: z.string().default("") })).default([]),
      assumption: z.string().optional(),
    })
    .safeParse(use?.input);
  if (!parsed.success) {
    return { ok: false, error: "unreadable", message: "I couldn't read that photo. Try again, or type what you ate." };
  }
  const foods = parsed.data.foods.filter((f) => f.name.trim()).slice(0, 15);
  if (!parsed.data.is_food || foods.length === 0) {
    return { ok: false, error: "not_food", message: "I don't see a meal in that photo. Try a clearer shot of the plate, or type what you ate." };
  }
  return { ok: true, text: foodsToText(foods), foods, assumption: parsed.data.assumption?.trim() || null };
}
