/**
 * Vision-based meal description from a Telegram photo → text for the meal log pipeline.
 */
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

import { anthropic } from "../tools/clients.js";
import { HEALTH_SPECIALIST_MODEL } from "../agents/health/model.js";
import type { TelegramPhotoPayload } from "./telegramPhotoDownload.js";

const PHOTO_MEAL_SYSTEM = `You identify food in meal photos for logging.
If the image is NOT food (books, screenshots, documents, receipts for non-food items, pets, etc.), output exactly: NOT_FOOD: <brief reason>
Otherwise output ONLY a concise meal log line the user could have typed — foods, rough portions, cooking method if visible. No markdown, no preamble. Under 120 words. If unclear, describe what you see and note uncertainty.`;

function textFromMessage(msg: Message): string {
  for (const block of msg.content) {
    if (block.type === "text") {
      return block.text;
    }
  }
  return "";
}

export async function describeMealFromPhoto(input: {
  photo: TelegramPhotoPayload;
  caption?: string | null;
  healthPreferences?: string | null;
}): Promise<string> {
  const caption = input.caption?.trim();
  const userText = [
    caption ? `User caption: ${caption}` : "No caption — infer the meal.",
    input.healthPreferences?.trim()
      ? `Diet context: ${input.healthPreferences.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: HEALTH_SPECIALIST_MODEL,
    max_tokens: 300,
    system: PHOTO_MEAL_SYSTEM,
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

  const description = textFromMessage(msg).trim();
  if (!description) {
    throw new Error("empty vision description");
  }
  return description;
}
