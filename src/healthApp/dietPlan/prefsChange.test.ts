import { describe, expect, it, vi } from "vitest";

vi.mock("../../tools/clients.js", () => ({ supabase: {}, anthropic: {} }));

import { defaultPrefs } from "./prefs.js";
import { prefsChangeReason } from "./store.js";

describe("prefsChangeReason", () => {
  const base = defaultPrefs();
  it("re-picks today when restrictions, fasting days or eat-out meals change", () => {
    expect(prefsChangeReason(base, { ...base, restrictions: ["no onion on Tuesdays"] })).toBe("food_prefs_changed");
    expect(prefsChangeReason(base, { ...base, fastingDays: [2] })).toBe("food_prefs_changed");
    expect(prefsChangeReason(base, { ...base, eatOut: [{ day: 5, slot: "dinner" }] })).toBe("food_prefs_changed");
  });
  it("leaves today alone for other setup changes, and for the same days in another order", () => {
    expect(prefsChangeReason(base, { ...base, kitchen: base.kitchen })).toBe("prefs_changed");
    const two = { ...base, fastingDays: [1, 4] };
    expect(prefsChangeReason(two, { ...two, fastingDays: [4, 1] })).toBe("prefs_changed");
  });
});
