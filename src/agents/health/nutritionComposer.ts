import { anthropic } from "../../tools/clients.js";
import { augmentUserWithMemory } from "../memory/memoryAgent.js";
import { NUTRITION_MEAL_TELEGRAM_COMPOSER_SYSTEM } from "./mealParserPrompt.js";
import { HEALTH_SPECIALIST_MODEL } from "./model.js";

function textFromContent(content: unknown[]): string {
  for (const block of content) {
    if (typeof block === "object" && block !== null && "type" in block) {
      const b = block as { type?: string; text?: string };
      if (b.type === "text" && typeof b.text === "string") {
        return b.text;
      }
    }
  }
  return "";
}

export async function draftMealLogTelegramIntro(input: {
  rawMealText: string;
  componentLabels: string[];
  totalCalories: number | null;
  parserNotes?: string;
  reconcileNotes?: string;
  memoryBlock?: string;
}): Promise<string> {
  const payload = JSON.stringify(
    {
      user_original_meal_text: input.rawMealText,
      components_logged: input.componentLabels,
      approximate_total_kcal: input.totalCalories,
      parser_notes: input.parserNotes ?? null,
      validation_notes: input.reconcileNotes ?? null,
    },
    null,
    2,
  );
  const user = augmentUserWithMemory(
    `Write the Telegram intro for this saved meal log.\n\n${payload}`,
    input.memoryBlock,
  );
  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 512,
    system: NUTRITION_MEAL_TELEGRAM_COMPOSER_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  return textFromContent(msg.content as unknown[]).trim();
}
