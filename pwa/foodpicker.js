// Pick food from the database before asking the chat: search, choose a household serving and an
// amount, build the meal, then review it in the usual draft card. Only what the database lacks
// goes on to the described-in-words estimate.

const fmtQty = (q) => {
  const w = Math.floor(q);
  const f = q - w;
  const fr = f === 0.5 ? "½" : f === 0.25 ? "¼" : f === 0.75 ? "¾" : "";
  return w ? `${w}${fr}` : fr || "0";
};

/**
 * deps: { api, el, fmt }. Calls onReview(items) with draft items ({ name, calories, protein_g, carbs_g, fat_g })
 * when they tap Review, and onDescribe(text) when the food isn't in the database.
 */
export function foodPicker({ api, el, fmt }, { onReview, onDescribe }) {
  const basket = [];
  let timer = null;
  let seq = 0;

  const input = el("input", { class: "field", type: "search", placeholder: "Search a food, e.g. roti, dal, paneer", "aria-label": "Search foods", autocomplete: "off" });
  const results = el("ul", { class: "pick-results" });
  const chosen = el("ul", { class: "pick-basket" });
  const totalLine = el("p", { class: "pick-total" });
  const review = el("button", { class: "btn primary block", type: "button", disabled: true, onclick: () => onReview(basket.map(toItem)) }, "Review and log");
  const missing = el("button", { class: "link", type: "button", onclick: () => onDescribe(input.value.trim()) }, "Can't find it? Describe it instead");
  const basketBox = el("div", { class: "stack", hidden: true }, el("p", { class: "section-label" }, "Your meal"), chosen, totalLine, review);

  const toItem = (b) => {
    const s = b.serving;
    const q = b.qty;
    return {
      name: `${fmtQty(q)} × ${s.label} ${b.food.name}`.replace(/\s+/g, " ").trim(),
      calories: Math.round(s.kcal * q),
      protein_g: Math.round(s.proteinG * q * 10) / 10,
      carbs_g: Math.round(s.carbsG * q * 10) / 10,
      fat_g: Math.round(s.fatG * q * 10) / 10,
    };
  };

  function paintBasket() {
    basketBox.hidden = basket.length === 0;
    const items = basket.map(toItem);
    chosen.replaceChildren(...basket.map((b, k) => el("li", {},
      el("span", { class: "iname" }, items[k].name, el("small", {}, `${fmt(items[k].calories)} kcal`)),
      el("span", { class: "stepper small" },
        el("button", { type: "button", "aria-label": `Less ${b.food.name}`, onclick: () => { b.qty = Math.max(0, Math.round((b.qty - 0.5) * 100) / 100); if (b.qty === 0) basket.splice(k, 1); paintBasket(); } }, "−"),
        el("button", { type: "button", "aria-label": `More ${b.food.name}`, onclick: () => { b.qty = Math.round((b.qty + 0.5) * 100) / 100; paintBasket(); } }, "+")))));
    const kcal = items.reduce((a, i) => a + i.calories, 0);
    const protein = items.reduce((a, i) => a + i.protein_g, 0);
    totalLine.textContent = `${fmt(kcal)} kcal · ${fmt(protein, 1)} g protein`;
    review.disabled = !basket.length;
  }

  function addFood(food, serving) {
    const same = basket.find((b) => b.food.key === food.key && b.serving.id === serving.id);
    if (same) same.qty += 1; else basket.push({ food, serving, qty: 1 });
    paintBasket();
  }

  function row(food) {
    const def = food.servings.find((s) => s.default) || food.servings[0];
    const picker = el("select", { class: "slot-pick", "aria-label": `Serving of ${food.name}` },
      ...food.servings.map((s) => el("option", { value: s.id, selected: s === def }, `${s.label} · ${fmt(s.kcal)} kcal`)));
    return el("li", { class: "pick-row" },
      el("span", { class: "iname" }, food.name),
      picker,
      el("button", { class: "btn small", type: "button", onclick: () => addFood(food, food.servings.find((s) => s.id === picker.value) || def) }, "Add"));
  }

  async function search() {
    const mine = ++seq;
    try {
      const r = await api(`/foods/search?q=${encodeURIComponent(input.value.trim())}`);
      if (mine !== seq) return;
      results.replaceChildren(...(r.foods.length ? r.foods.map(row) : [el("li", { class: "none" }, "Nothing in the database matches.")]));
    } catch (err) {
      if (mine === seq) results.replaceChildren(el("li", { class: "none" }, err.message));
    }
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  search();

  return el("div", { class: "stack food-picker" }, input, basketBox, results, missing);
}
