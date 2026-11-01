/**
 * Enrich meal planning with the user's food wishlist + sync locked plans back.
 */
import { fetchListBySlug, queryListItems } from "../../lists/listStore.js";
import { addListItem } from "../../lists/listService.js";
import type { MealPlanEntryInput } from "../parseMealPlanJson.js";
import { logger } from "../../logger.js";

const RESTAURANT_HINT_RE =
  /\b(?:restaurant|cafe|café|diner|bistro|takeaway|delivery|swiggy|zomato|ubereats|chipotle|mcdonald|starbucks)\b/i;

export async function loadFoodListContext(userProfileId: string, limit = 12): Promise<string> {
  const list = await fetchListBySlug(userProfileId, "food");
  if (!list.ok || !list.data) {
    return "";
  }

  const items = await queryListItems({
    userProfileId,
    listId: list.data.id,
    openStatuses: list.data.open_statuses,
    limit,
  });

  if (!items.ok || !items.data.length) {
    return "";
  }

  const titles = items.data.map((i) => i.title.trim()).filter(Boolean);
  if (!titles.length) {
    return "";
  }

  return `\nFood wishlist (consider rotating in when relevant):\n${titles.map((t) => `- ${t}`).join("\n")}`;
}

export async function syncLockedPlanToFoodList(input: {
  userProfileId: string;
  entries: MealPlanEntryInput[];
}): Promise<{ added: string[]; skipped: number }> {
  const list = await fetchListBySlug(input.userProfileId, "food");
  if (!list.ok || !list.data) {
    return { added: [], skipped: input.entries.length };
  }

  const existing = await queryListItems({
    userProfileId: input.userProfileId,
    listId: list.data.id,
    limit: 200,
  });

  const existingTitles = new Set(
    (existing.ok ? existing.data : []).map((i) => i.title.trim().toLowerCase()),
  );

  const added: string[] = [];
  const seen = new Set<string>();

  for (const entry of input.entries) {
    const title = entry.title.trim();
    if (title.length < 4) {
      continue;
    }
    const key = title.toLowerCase();
    if (seen.has(key) || existingTitles.has(key)) {
      continue;
    }

    const worthAdding =
      RESTAURANT_HINT_RE.test(title) ||
      RESTAURANT_HINT_RE.test(entry.description ?? "") ||
      title.split(/\s+/).length <= 4;

    if (!worthAdding) {
      continue;
    }

    seen.add(key);
    try {
      const msg = await addListItem({
        userProfileId: input.userProfileId,
        list: "food",
        title,
        notes: `From meal plan ${entry.local_date} (${entry.meal_slot})`,
        pillar: "health",
      });
      if (!msg.startsWith("Could not") && !msg.includes("Unknown list")) {
        added.push(title);
        existingTitles.add(key);
      }
    } catch (err) {
      logger.warn({ err: String(err), title }, "food list sync skipped item");
    }

    if (added.length >= 8) {
      break;
    }
  }

  return { added, skipped: input.entries.length - added.length };
}
