// Diet and foods to avoid: one editor for the onboarding screen and Settings.

export const DIET_OPTIONS = [
  ["vegetarian", "Vegetarian"],
  ["eggetarian", "Vegetarian + eggs"],
  ["non_vegetarian", "Non-vegetarian"],
  ["vegan", "Vegan"],
  ["jain", "Jain"],
  ["custom", "Something else", "Describe it in your own words"],
];

export const COMMON_AVOID = [
  "Peanuts", "Tree nuts", "Dairy / lactose", "Gluten", "Eggs", "Soy",
  "Fish", "Shellfish", "Sesame", "Mushrooms", "Onion & garlic", "Beef", "Pork",
];

/**
 * `value` = { diet, dietNote, foodAvoid } and is updated in place; `onChange` fires on every edit.
 * Returns the editor node.
 */
export function foodPrefsEditor(el, value, onChange = () => {}) {
  value.foodAvoid = value.foodAvoid || [];
  const node = el("div", { class: "stack food-prefs" });
  const has = (item) => value.foodAvoid.some((x) => x.toLowerCase() === item.toLowerCase());
  const toggle = (item) => {
    value.foodAvoid = has(item) ? value.foodAvoid.filter((x) => x.toLowerCase() !== item.toLowerCase()) : [...value.foodAvoid, item];
    onChange();
    paint();
  };

  function paint() {
    const diets = el("div", { class: "choices", role: "radiogroup" },
      ...DIET_OPTIONS.map(([v, label, hint]) => {
        const on = value.diet === v;
        return el("button", { type: "button", class: `choice${on ? " on" : ""}`, role: "radio", "aria-checked": String(on),
          onclick: () => { value.diet = v; onChange(); paint(); if (v === "custom") node.querySelector(".diet-note")?.focus(); } },
          el("span", {}, label), hint && !on ? el("small", {}, hint) : null);
      }));
    const note = value.diet === "custom"
      ? el("input", { class: "field diet-note", type: "text", maxlength: "200", value: value.dietNote || "",
          placeholder: "e.g. pescatarian, no red meat, keto", oninput: (e) => { value.dietNote = e.target.value; onChange(); } })
      : null;

    const custom = value.foodAvoid.filter((x) => !COMMON_AVOID.some((c) => c.toLowerCase() === x.toLowerCase()));
    const chips = el("div", { class: "avoid-chips" },
      ...[...COMMON_AVOID, ...custom].map((item) => {
        const on = has(item);
        return el("button", { type: "button", class: `avoid${on ? " on" : ""}`, "aria-pressed": String(on), onclick: () => toggle(item) },
          on ? `✕ ${item}` : item);
      }));
    const input = el("input", { class: "field", type: "text", maxlength: "40", placeholder: "Something else, e.g. brinjal" });
    const add = () => {
      const item = input.value.trim().replace(/\s+/g, " ");
      if (!item) return;
      if (!has(item)) { value.foodAvoid = [...value.foodAvoid, item]; onChange(); }
      paint();
      node.querySelector(".avoid-add input")?.focus();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });

    // replaceChildren() would print a null as the text "null".
    node.replaceChildren(...[
      diets,
      note,
      el("p", { class: "section-label" }, "Anything you avoid?"),
      el("p", { class: "hint" }, "Allergies, intolerances or just won't eat. I'll never suggest these. Tap again to remove."),
      chips,
      el("div", { class: "avoid-add" }, input, el("button", { class: "btn", type: "button", onclick: add }, "Add")),
    ].filter(Boolean));
  }

  paint();
  return node;
}
