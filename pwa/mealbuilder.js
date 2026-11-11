// "Make your meal": search the food database, pick from the drop-down, set amounts, tap a food for
// its full macros. Foods the database doesn't have come from "Can't find it? Search" (a separate
// screen, paid web lookup) and land back here next to the ones picked by hand. Nothing is logged
// until the person reviews and confirms the meal.

export const fmtQty = (q) => {
  const w = Math.floor(q);
  const f = Math.round((q - w) * 100) / 100;
  const fr = f === 0.5 ? "½" : f === 0.25 ? "¼" : f === 0.75 ? "¾" : f ? String(f).slice(1) : "";
  return w ? `${w}${fr}` : fr || "0";
};

const r1 = (n) => Math.round(n * 10) / 10;
const fmt0 = (n) => String(Math.round(n));

/** Weights a person can type for a food: whole grams, 1 g to 2 kg. */
export const MIN_GRAMS = 1;
export const MAX_GRAMS = 2000;
export const clampGrams = (g) => Math.min(MAX_GRAMS, Math.max(MIN_GRAMS, Math.round(+g || 0)));

/**
 * "150g paneer", "paneer 150 g", "200 gm rice" → { grams: 150, q: "paneer" }; null without a weight.
 * Only grams (and ml, read as grams, close enough for milk, curd and drinks) count; "2 roti" doesn't.
 */
export function parseGrams(text) {
  const t = String(text || "").trim();
  const unit = "(?:g|gm|gms|gram|grams|ml)";
  const m = t.match(new RegExp(`^(\\d{1,4}(?:\\.\\d+)?)\\s*${unit}\\b\\s*(?:of\\s+)?(.+)$`, "i"))
    || t.match(new RegExp(`^(.+?)\\s+(\\d{1,4}(?:\\.\\d+)?)\\s*${unit}$`, "i"));
  if (!m) return null;
  const [num, q] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  const grams = Math.round(Number(num));
  if (!(grams >= MIN_GRAMS && grams <= MAX_GRAMS) || !q.trim()) return null;
  return { grams, q: q.trim() };
}

/** "1½ medium roti", "2 × plate", "150 g", "1 serving". */
export function amountOf(it) {
  if (it.byGram) return `${fmt0(it.qty)} g`;
  if (it.kind !== "db") return it.qty === 1 ? "1 serving" : `${fmtQty(it.qty)} servings`;
  return /^1 /.test(it.unit) ? `${fmtQty(it.qty)} ${it.unit.slice(2)}` : `${fmtQty(it.qty)} × ${it.unit}`;
}

/** A database food at one household serving. */
export function dbItem(food, serving, qty = 1) {
  return {
    kind: "db",
    key: food.key,
    name: food.name,
    servings: food.servings,
    servingId: serving.id,
    unit: serving.label,
    per: { kcal: serving.kcal, p: serving.proteinG, c: serving.carbsG, f: serving.fatG, fib: serving.fiberG ?? null },
    qty,
  };
}

/** Whether a database line can be weighed: its serving has a known weight (saved foods don't). */
export const canWeigh = (it) => it.kind === "db" && (it.byGram || it.servings?.some((s) => s.grams > 0));

/**
 * A database food by weight: numbers per gram from its serving (the catalog stores per 100 g, so
 * any serving gives the same answer), qty in grams.
 */
export function gramItem(food, serving, grams) {
  const s = serving.grams > 0 ? serving : food.servings.find((x) => x.grams > 0);
  if (!s) return null;
  const g = s.grams;
  return {
    kind: "db",
    key: food.key,
    name: food.name,
    servings: food.servings,
    servingId: s.id,
    byGram: true,
    unit: "g",
    per: { kcal: s.kcal / g, p: s.proteinG / g, c: s.carbsG / g, f: s.fatG / g, fib: s.fiberG == null ? null : s.fiberG / g },
    qty: clampGrams(grams),
  };
}

/** The same food switched to grams, starting at what the current amount weighs. */
export function toGrams(it) {
  if (it.byGram) return it;
  const s = it.servings?.find((x) => x.id === it.servingId);
  const start = s?.grams > 0 ? s.grams * it.qty : 100;
  return gramItem({ key: it.key, name: it.name, servings: it.servings }, s || it.servings[0], start) || it;
}

/** A line with its own numbers (a web lookup, a usual meal, an earlier estimate, or typed in). */
export function fixedItem(i, origin = "own") {
  return {
    kind: "fixed",
    origin,
    name: i.name,
    unit: null,
    per: { kcal: +i.calories || 0, p: +i.protein_g || 0, c: +i.carbs_g || 0, f: +i.fat_g || 0, fib: i.fiber_g ?? null },
    qty: 1,
  };
}

/** The line as the meal log stores it. */
export function logItem(it) {
  const q = it.qty;
  let name;
  if (it.byGram) {
    name = `${fmt0(q)} g ${it.name}`;
  } else if (it.kind === "db") {
    name = /^1 /.test(it.unit) ? `${fmtQty(q)} ${it.unit.slice(2)} ${it.name}` : `${fmtQty(q)} × ${it.unit} ${it.name}`;
  } else {
    name = q === 1 ? it.name : `${fmtQty(q)} × ${it.name}`;
  }
  return {
    name: name.replace(/\s+/g, " ").trim(),
    calories: Math.round(it.per.kcal * q),
    protein_g: r1(it.per.p * q),
    carbs_g: r1(it.per.c * q),
    fat_g: r1(it.per.f * q),
  };
}

export function totalsOf(items) {
  return items.reduce((a, it) => {
    const l = logItem(it);
    return { kcal: a.kcal + l.calories, p: r1(a.p + l.protein_g), c: r1(a.c + l.carbs_g), f: r1(a.f + l.fat_g) };
  }, { kcal: 0, p: 0, c: 0, f: 0 });
}

/**
 * deps: { api, el, fmt, openMini }. build: { items } (kept by the caller so it survives the search
 * screen). opts: { applyLabel, onApply(items), onSearchMore(text) }.
 */
export function mealBuilder({ api, el, fmt, openMini }, build, { applyLabel, onApply, onSearchMore }) {
  let timer = null;
  let seq = 0;

  const input = el("input", {
    class: "field mb-input", type: "search", placeholder: "Search a food, e.g. roti, dal, 150 g paneer",
    "aria-label": "Search foods", autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-controls": "mb-drop",
  });
  const drop = el("ul", { class: "mb-drop", id: "mb-drop", role: "listbox", hidden: true });
  const list = el("ul", { class: "mb-items" });
  const totalBox = el("div", { class: "mb-totals" });
  const apply = el("button", { class: "btn primary block", type: "button", onclick: () => onApply(build.items.map(logItem)) }, applyLabel);
  const findMore = () => onSearchMore(input.value.trim());

  function paint() {
    const t = totalsOf(build.items);
    totalBox.replaceChildren(
      el("div", { class: "mb-kcal" }, el("b", {}, fmt(t.kcal)), el("small", {}, " kcal")),
      el("div", { class: "mb-macros" },
        el("span", {}, el("i", { class: "dot p" }), `${fmt(t.p, 1)} g protein`),
        el("span", {}, el("i", { class: "dot c" }), `${fmt(t.c, 1)} g carbs`),
        el("span", {}, el("i", { class: "dot f" }), `${fmt(t.f, 1)} g fat`)),
    );
    if (!build.items.length) {
      list.replaceChildren(el("li", { class: "mb-empty" }, "Nothing added yet. Search above and pick a food from the list."));
    } else {
      list.replaceChildren(...build.items.map((it, k) => row(it, k)));
    }
    apply.disabled = !build.items.length || t.kcal <= 0 || build.items.some((it) => it.per.kcal <= 0);
  }

  function row(it, k) {
    const l = logItem(it);
    // Weighed lines move 10 g a tap; a serving moves by half.
    const by = it.byGram ? 10 : 0.5;
    const step = (d) => {
      it.qty = Math.round((it.qty + d * by) * 100) / 100;
      if (it.qty <= 0) build.items.splice(k, 1);
      paint();
    };
    const amount = amountOf(it);
    const missing = it.per.kcal <= 0;
    return el("li", { class: `mb-item${missing ? " missing" : ""}` },
      el("button", { class: "mb-name", type: "button", "aria-label": `${it.name}: see macros`, onclick: () => macroSheet(it) },
        el("span", { class: "n" }, it.name, it.kind === "fixed" && it.origin === "web" ? el("small", { class: "tag" }, "web") : null),
        el("small", {}, missing ? "Tap to add its numbers" : `${amount} · ${fmt(l.calories)} kcal · ${fmt(l.protein_g, 1)} g P`)),
      el("span", { class: "stepper small" },
        el("button", { type: "button", "aria-label": `Less ${it.name}`, onclick: () => step(-1) }, "−"),
        el("span", { class: "q" }, it.byGram ? `${fmt0(it.qty)}g` : fmtQty(it.qty)),
        el("button", { type: "button", "aria-label": `More ${it.name}`, onclick: () => step(1) }, "+"),
        el("button", { class: "remove", type: "button", "aria-label": `Remove ${it.name}`, onclick: () => { build.items.splice(k, 1); paint(); } }, "×")));
  }

  // Full macros for one line: kcal, protein, carbs, fat, fibre. A database food can change its
  // serving here; a line with its own numbers can have them corrected.
  function macroSheet(it) {
    const body = el("div", { class: "mini-body" });
    const draw = () => {
      const tile = (label, v, unit, cls) => el("div", { class: `mm-tile ${cls}` }, el("small", {}, label), el("b", {}, v == null ? "—" : fmt(v, unit === "kcal" ? 0 : 1)), el("small", {}, v == null ? "not known" : unit));
      const editable = it.kind === "fixed";
      const num = (label, key) => el("label", { class: "mm-field" }, label,
        el("input", { class: "field", inputmode: "decimal", value: String(it.per[key] || ""), placeholder: "0", oninput: (e) => { it.per[key] = Math.max(0, parseFloat(e.target.value) || 0); paint(); drawTiles(); } }));
      const tiles = el("div", { class: "mm-grid" });
      const drawTiles = () => {
        const x = logItem(it);
        const fb = it.per.fib == null ? null : r1(it.per.fib * it.qty);
        tiles.replaceChildren(tile("Calories", x.calories, "kcal", "k"), tile("Protein", x.protein_g, "g", "p"), tile("Carbs", x.carbs_g, "g", "c"), tile("Fat", x.fat_g, "g", "f"), tile("Fibre", fb, "g", "fib"));
      };
      drawTiles();
      body.replaceChildren(...[
        el("div", { class: "mm-head" }, el("h3", {}, it.name), el("p", { class: "muted" }, amountOf(it))),
        it.kind === "db" && (it.servings?.length > 1 || canWeigh(it))
          ? el("div", { class: "chips wrap" },
              ...it.servings.slice(0, 5).map((s) => el("button", {
                class: `chip${!it.byGram && s.id === it.servingId ? " on" : ""}`, type: "button",
                // Back from grams: start at one serving, not "150 servings".
                onclick: () => { const q = it.byGram ? 1 : it.qty; delete it.byGram; Object.assign(it, dbItem({ key: it.key, name: it.name, servings: it.servings }, s, q)); paint(); draw(); },
              }, s.label)),
              canWeigh(it) ? el("button", { class: `chip${it.byGram ? " on" : ""}`, type: "button", onclick: () => { Object.assign(it, toGrams(it)); paint(); draw(); } }, "Grams") : null)
          : null,
        it.byGram ? el("label", { class: "mm-field" }, "Grams eaten",
          el("input", { class: "field", type: "number", inputmode: "numeric", min: String(MIN_GRAMS), max: String(MAX_GRAMS), step: "1", value: String(Math.round(it.qty)),
            oninput: (e) => { const v = parseFloat(e.target.value); if (v > 0) { it.qty = clampGrams(v); paint(); drawTiles(); } } })) : null,
        tiles,
        // Correcting the numbers stays one tap away, so the sheet stays small (open at once when there are none).
        editable ? el("details", { class: "mm-edit", open: it.per.kcal <= 0 },
          el("summary", { class: "link" }, "Change the numbers"),
          el("p", { class: "section-label" }, "Numbers for 1 serving"),
          el("div", { class: "grid2" }, num("kcal", "kcal"), num("Protein g", "p"), num("Carbs g", "c"), num("Fat g", "f"))) : null,
      ].filter(Boolean));
    };
    draw();
    openMini(body);
  }

  function add(food, serving, grams) {
    const weighed = grams ? gramItem(food, serving, grams) : null;
    if (weighed) {
      const same = build.items.find((b) => b.byGram && b.key === food.key);
      if (same) same.qty = clampGrams(same.qty + weighed.qty); else build.items.push(weighed);
    } else {
      const same = build.items.find((b) => b.kind === "db" && !b.byGram && b.servingId === serving.id);
      if (same) same.qty += 1; else build.items.push(dbItem(food, serving));
    }
    input.value = "";
    closeDrop();
    paint();
    // Show the row that just changed.
    list.lastElementChild?.scrollIntoView?.({ block: "nearest" });
  }

  function closeDrop() { drop.hidden = true; input.setAttribute("aria-expanded", "false"); }

  function paintDrop(foods, q, grams) {
    const rows = foods.slice(0, 8).map((food) => {
      const s = food.servings.find((x) => x.default) || food.servings[0];
      // "150 g paneer" typed: the pick goes in at 150 g (foods without a weight keep their serving).
      const ws = s.grams > 0 ? s : food.servings.find((x) => x.grams > 0);
      const w = grams && ws ? grams : null;
      const sub = w ? `${w} g · ${fmt(Math.round((ws.kcal / ws.grams) * w))} kcal` : `${s.label} · ${fmt(s.kcal)} kcal`;
      return el("li", { role: "option", class: "mb-opt", onpointerdown: (e) => e.preventDefault(), onclick: () => add(food, w ? ws : s, w) },
        el("span", { class: "n" }, food.name, food.mine ? el("small", { class: "tag" }, "yours") : null), el("small", {}, sub));
    });
    const tail = q
      ? el("li", { class: "mb-opt more", title: `Search the web for “${q}”`, onpointerdown: (e) => e.preventDefault(), onclick: findMore },
          el("span", { class: "n" }, rows.length ? `Not here? Search for “${q}”` : `No “${q}” in the food list. Search for it`), el("small", {}, "Looks it up on the web"))
      : null;
    drop.replaceChildren(...rows, ...(tail ? [tail] : []));
    drop.hidden = !drop.children.length;
    input.setAttribute("aria-expanded", String(!drop.hidden));
  }

  async function search() {
    const mine = ++seq;
    const q = input.value.trim();
    const weighed = parseGrams(q);
    try {
      const r = await api(`/foods/search?q=${encodeURIComponent(weighed ? weighed.q : q)}`);
      if (mine !== seq || document.activeElement !== input) return;
      paintDrop(r.foods, q, weighed?.grams ?? null);
    } catch (err) {
      if (mine === seq) drop.replaceChildren(el("li", { class: "mb-opt none" }, err.message));
    }
  }
  input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 160); });
  input.addEventListener("focus", () => search());
  input.addEventListener("blur", () => setTimeout(closeDrop, 120));
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrop(); });

  paint();
  return el("div", { class: "stack meal-builder" },
    el("div", { class: "mb-search" }, input, drop),
    el("div", { class: "mb-list" }, el("p", { class: "section-label" }, "Your meal"), list),
    totalBox,
    apply,
    el("button", { class: "btn block mb-find", type: "button", onclick: findMore }, "Can't find it? Search"),
  );
}
