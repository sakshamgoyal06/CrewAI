import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { draftMealFromPhoto, photoReplyText } from "./mealCards.js";
import type { MealDraft } from "./meals.js";
import { foodsToText, photoMealInput, readMealPhoto } from "./photoMeal.js";

const IMG = "A".repeat(200);
const ctx = { userProfileId: "p1", timezone: "Asia/Kolkata" };

function toolReply(input: unknown): Anthropic.Message {
  return { content: [{ type: "tool_use", id: "t1", name: "report_meal", input }] } as unknown as Anthropic.Message;
}

const draft: MealDraft = {
  draftId: "d1",
  text: "2 roti, 1 bowl dal",
  slot: "lunch",
  source: "food_db",
  items: [
    { name: "roti", calories: 240, protein_g: 8, carbs_g: 40, fat_g: 6 },
    { name: "dal", calories: 180, protein_g: 10, carbs_g: 24, fat_g: 5 },
  ],
  totals: { calories: 420, protein_g: 18, carbs_g: 64, fat_g: 11 },
  estimated: true,
  servingAssumption: "Roti 40 g each.",
};

describe("foodsToText", () => {
  it("joins amount and name the way the meal parser reads them", () => {
    expect(
      foodsToText([
        { name: "roti", amount: "2" },
        { name: "dal tadka", amount: "a bowl" },
        { name: "paneer bhurji", amount: "150 g" },
        { name: "3 idli", amount: "3" },
        { name: "black coffee", amount: "" },
      ]),
    ).toBe("2 roti, 1 bowl dal tadka, 150 g paneer bhurji, 3 idli, black coffee");
  });
});

describe("photoMealInput", () => {
  it("rejects non-base64 and oversize images", () => {
    expect(photoMealInput.safeParse({ image: "not base64 !!".repeat(20) }).success).toBe(false);
    expect(photoMealInput.safeParse({ image: "A".repeat(6_000_001) }).success).toBe(false);
    expect(photoMealInput.parse({ image: IMG }).mediaType).toBe("image/jpeg");
  });
});

describe("readMealPhoto", () => {
  it("sends the image and note, forces the report tool, and returns meal text", async () => {
    const create = vi.fn(async () =>
      toolReply({ is_food: true, foods: [{ name: "roti", amount: "2" }, { name: "dal", amount: "1 bowl" }], assumption: "Roti look about 40 g." }),
    );
    const r = await readMealPhoto({ image: IMG, mediaType: "image/jpeg", note: "ate half the dal" }, create);
    expect(r).toEqual({ ok: true, text: "2 roti, 1 bowl dal", foods: expect.any(Array), assumption: "Roti look about 40 g." });
    const params = (create.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(params.tool_choice).toEqual({ type: "auto" });

    const content = params.messages[0].content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: IMG } });
    expect(content[1].text).toContain("ate half the dal");
    expect(content[1].text).toContain("calling the report_meal tool");
  });

  it("says so when the photo isn't food", async () => {
    const r = await readMealPhoto({ image: IMG, mediaType: "image/png" }, async () => toolReply({ is_food: false, foods: [] }));
    expect(r).toMatchObject({ ok: false, error: "not_food" });
  });

  it("treats a missing or malformed tool call as unreadable", async () => {
    const r = await readMealPhoto({ image: IMG, mediaType: "image/png" }, async () => ({ content: [{ type: "text", text: "hi" }] }) as unknown as Anthropic.Message);
    expect(r).toMatchObject({ ok: false, error: "unreadable" });
  });
});

describe("draftMealFromPhoto", () => {
  it("drafts from the photo text, keeps the photo guess first, and posts the card into chat", async () => {
    const record = vi.fn(async () => undefined);
    const startDraft = vi.fn(async () => draft);
    const r = await draftMealFromPhoto(ctx, { image: IMG, mediaType: "image/jpeg", slot: "lunch" }, {
      read: async () => ({ ok: true, text: "2 roti, 1 bowl dal", foods: [], assumption: "Portions from a standard plate." }),
      draft: startDraft,
      record,
    });
    expect(startDraft).toHaveBeenCalledWith(ctx, { text: "2 roti, 1 bowl dal", slot: "lunch" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cards[0]!.type).toBe("meal_draft");
    expect((r.cards[0] as { draft: MealDraft }).draft.servingAssumption).toBe("Portions from a standard plate. Roti 40 g each.");
    expect(r.text).toMatch(/^Looks like 2 roti, 1 bowl dal\. That comes to about 420 kcal/);
    expect(record).toHaveBeenCalledWith("p1", "📷 Meal photo", r.text, r.cards);
  });

  it("doesn't draft or write chat when the photo isn't food", async () => {
    const record = vi.fn(async () => undefined);
    const startDraft = vi.fn(async () => draft);
    const r = await draftMealFromPhoto(ctx, { image: IMG, mediaType: "image/jpeg" }, {
      read: async () => ({ ok: false, error: "not_food", message: "No meal." }),
      draft: startDraft,
      record,
    });
    expect(r).toMatchObject({ ok: false, error: "not_food" });
    expect(startDraft).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("reply text never says the meal is logged", () => {
    expect(photoReplyText("2 roti", draft)).not.toMatch(/\blogged\b(?! )/);
    expect(photoReplyText("2 roti", draft)).toContain("Confirm & log");
  });
});
