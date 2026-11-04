// Meals tab: the diet plan. Setup answers, the next three days, and one screen per meal with
// portions, "Ate this", swaps and pins. Everything big opens as its own screen (UI rule).

const SLOT_NAME = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"];
const DEFAULT_SHARES = { breakfast: 25, lunch: 35, snack: 10, dinner: 30 };
const DEFAULT_TIMES = { breakfast: "08:30", lunch: "13:30", snack: "17:00", dinner: "20:30" };
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let d = null; // { api, el, toast, openSheet, closeSheet, backSheet, setView, fmt, todayKey, refresh }
const ms = { view: null, loading: null, date: null, sel: null, edit: null, error: null };

export function initMeals(deps) { d = deps; }

// ---------- data ----------

/** The plan view from the server; one request at a time, kept in memory. */
export function loadPlan(force = false) {
  if (ms.loading) return ms.loading;
  if (ms.view && !force) return Promise.resolve(ms.view);
  ms.loading = d.api("/diet/plan")
    .then((v) => { ms.view = v; ms.error = null; return v; })
    .catch((err) => { ms.error = err; throw err; })
    .finally(() => { ms.loading = null; });
  return ms.loading;
}

const days = () => [...new Set((ms.view?.days || []).map((x) => x.date))].sort();
const pickOf = (date, slot) => ms.view?.days.find((x) => x.date === date && x.slot === slot) || null;
const budgetOf = (slot) => ms.view?.plan?.budgets.find((b) => b.slot === slot) || null;
const optionsOf = (slot) => ms.view?.plan?.options?.[slot] || [];
const timeOf = (slot) => ms.view?.prefs?.meals.find((m) => m.slot === slot)?.time || null;
const isEaten = (p) => p && (p.status === "logged" || p.status === "partial");

function dayLabel(date) {
  const t = d.todayKey();
  if (date === t) return "Today";
  const n = Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${t}T12:00:00Z`)) / 86400000);
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
}

function clock(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const dt = new Date(2000, 0, 1, h, m);
  return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

const itemsOf = (p) => p.eatenItems || p.items || [];
const sum = (items, k) => items.reduce((a, i) => a + (i[k] || 0), 0);

/** Calories and protein eaten from the plan, and planned, for one day. */
function dayTotals(date) {
  const picks = (ms.view?.days || []).filter((x) => x.date === date);
  const eaten = picks.filter(isEaten);
  return {
    plannedKcal: picks.reduce((a, p) => a + (p.totals?.kcal || 0), 0),
    eatenKcal: Math.round(eaten.reduce((a, p) => a + sum(itemsOf(p), "kcal"), 0)),
    eatenProtein: Math.round(eaten.reduce((a, p) => a + sum(itemsOf(p), "proteinG"), 0)),
    eatenCount: eaten.length,
    count: picks.length,
  };
}

// ---------- the tab ----------

export async function renderMeals() {
  const host = document.getElementById("meals-body");
  const { el } = d;
  if (!ms.view) host.replaceChildren(el("div", { class: "skel", "aria-label": "Loading" }, el("i", { class: "big" }), el("i"), el("i", { class: "short" }), el("i"), el("i", { class: "short" })));
  try {
    await loadPlan(!!ms.view);
  } catch (err) {
    if (ms.view) return paint();
    host.replaceChildren(el("p", { class: "none" }, err.message), el("button", { class: "link", type: "button", onclick: renderMeals }, "Try again"));
    return;
  }
  paint();
}

/** Goal & targets, scrolled to the daily targets. */
function openTargets() {
  d.openSheet("settings");
  setTimeout(() => document.querySelector('#sheet [name="kcal"]')?.scrollIntoView({ block: "center" }), 250);
}

function paint() {
  const host = document.getElementById("meals-body");
  const { el, fmt } = d;
  const v = ms.view;
  document.getElementById("meals-edit").hidden = !v?.setup || v.needsTargets;
  // Targets come first: the plan splits them into meals, so nothing else is offered until they're set.
  if (v.needsTargets) {
    host.replaceChildren(
      el("div", { class: "targets-required" },
        el("p", { class: "eyebrow" }, "Step 1 · Required"),
        el("h2", { class: "title-md" }, "Set your calorie and protein targets"),
        el("p", {}, "Your meal plan splits these into meals, so they come first."),
        el("button", { class: "btn primary block", type: "button", onclick: openTargets }, "Set targets")),
      el("div", { class: "empty-block muted-block" },
        el("p", { class: "eyebrow" }, "Step 2"),
        el("p", {}, v.setup ? "Your meal answers are saved. The plan appears as soon as your targets are set." : "Then tell me when you eat and what you like, and you'll get a plan for the next three days.")));
    return;
  }
  if (!v.setup) {
    host.replaceChildren(el("div", { class: "empty-block" },
      el("h2", { class: "title-md" }, "Meals that fit your day"),
      el("p", {}, "Tell me when you eat, how long you can cook and what you like. You'll get 5 to 8 options for each meal, sized to your targets, and a plan for the next three days."),
      el("p", { class: "hint" }, "Takes about a minute. You can change anything later."),
      el("button", { class: "btn primary", type: "button", onclick: () => d.openSheet("dietSetup") }, "Set up my meals")));
    return;
  }
  const all = days();
  if (!ms.date || !all.includes(ms.date)) ms.date = all.includes(d.todayKey()) ? d.todayKey() : all[0];
  const strip = el("div", { class: "seg meal-days", role: "tablist" },
    ...all.map((date) => el("button", { type: "button", role: "tab", class: date === ms.date ? "on" : "", "aria-selected": String(date === ms.date),
      onclick: () => { ms.date = date; paint(); } }, dayLabel(date))));

  const t = v.plan.targets;
  const tot = dayTotals(ms.date);
  const isToday = ms.date === d.todayKey();
  const summary = el("div", { class: "meal-summary" },
    el("div", { class: "big" }, el("span", { class: "num" }, fmt(isToday ? tot.eatenKcal : tot.plannedKcal)), el("span", { class: "unit" }, isToday ? "kcal eaten" : "kcal planned")),
    el("div", { class: "side" },
      el("div", {}, `of ${fmt(t.calories)} kcal`),
      el("div", { class: "muted" }, `P ${fmt(t.proteinG)} · C ${fmt(t.carbsG)} · F ${fmt(t.fatG)} g`)));

  const order = SLOT_ORDER.filter((s) => v.prefs.meals.some((m) => m.slot === s));
  const list = el("ul", { class: "list meal-plan" }, ...order.map((slot) => mealCard(ms.date, slot)).filter(Boolean));
  // What is still to eat today, by name ("Only dinner is left today").
  const left = isToday ? order.filter((s) => { const p = pickOf(ms.date, s); return p && !isEaten(p); }) : [];
  const leftLine = isToday && left.length && left.length < order.length
    ? el("p", { class: "hint left-line" }, left.length === 1 ? `Only ${SLOT_NAME[left[0]].toLowerCase()} is left today.` : `Left today: ${left.map((s) => SLOT_NAME[s].toLowerCase()).join(", ")}.`)
    : null;
  host.replaceChildren(...[strip, summary, leftLine, suppRow(ms.date), list,
    el("div", { class: "fresh-plan" },
      el("button", { class: "btn block", type: "button", onclick: rebuild }, "Make me a fresh plan"),
      el("p", { class: "hint" }, "New options from your current food settings. Meals you've already eaten stay."))].filter(Boolean));
}

/** One row for the day's supplements: what they are and a tap to log them (today only). */
function suppRow(date) {
  const { el, fmt } = d;
  const sup = ms.view?.supplements;
  if (!sup?.lines?.length) return null;
  const kcal = sup.lines.reduce((a, l) => a + l.kcal, 0);
  const protein = sup.lines.reduce((a, l) => a + l.proteinG, 0);
  const isToday = date === d.todayKey();
  const taken = isToday && sup.takenToday;
  const act = async () => {
    try {
      await d.api(`/diet/supplements/${date}`, { method: taken ? "DELETE" : "POST" });
      sup.takenToday = !taken;
      d.toast(taken ? "Supplements removed from today." : "Supplements logged.");
      paint();
    } catch (err) { d.toast(err.message); }
  };
  return el("div", { class: "supp-line" },
    el("span", { class: "what" }, sup.lines.map((l) => `${l.name} (${l.text})`).join(", ")),
    el("small", { class: "sub" }, `${fmt(kcal)} kcal · ${fmt(Math.round(protein))} g protein, already taken out of your meals`),
    isToday ? el("button", { class: "btn small", type: "button", onclick: act }, taken ? "Undo" : "Took them") : null);
}

function mealCard(date, slot) {
  const { el, fmt } = d;
  const p = pickOf(date, slot);
  if (!p) return null;
  const eaten = isEaten(p);
  const items = itemsOf(p);
  const sub = p.kind === "eat_out"
    ? "Eating out"
    : `${fmt(eaten ? sum(items, "kcal") : p.totals.kcal)} kcal · ${fmt(eaten ? sum(items, "proteinG") : p.totals.proteinG)} g protein`;
  return el("li", {},
    el("button", { class: `meal-card${eaten ? " eaten" : ""}`, type: "button", onclick: () => openMeal(date, slot) },
      el("span", { class: "slot" }, SLOT_NAME[slot], timeOf(slot) ? el("small", {}, ` · ${clock(timeOf(slot))}`) : null),
      el("span", { class: "what" }, p.kind === "eat_out" ? p.title : items.map((i) => i.text).join(", ") || p.title),
      el("span", { class: "sub" }, sub, eaten ? el("b", { class: "tick" }, p.status === "partial" ? " · Eaten, portions changed" : " · Eaten") : null),
      eaten ? null : el("span", { class: "edit-cue" }, p.kind === "eat_out" ? "Tap to log what you had" : "Change portions, swap or log your own", el("i", { class: "chev-r" }))));
}

/** From a chat card: the plan's meal screen for one meal (loads the plan first if needed). */
export async function openPlannedMeal(date, slot) {
  // Open the screen straight away from what's in memory; the fresh plan repaints it.
  const known = !!pickOf(date, slot);
  if (known) openMeal(date, slot);
  try { await loadPlan(true); } catch (err) { if (!known) d.toast(err.message); return; }
  if (!pickOf(date, slot)) {
    // An old card: that day has left the plan.
    if (known) d.closeSheet();
    d.toast(date < d.todayKey() ? "That meal's day has passed. Here's your plan now." : "That meal isn't in the plan any more.");
    d.setView("meals");
    return;
  }
  if (!known) openMeal(date, slot);
  else if (stillOpen() && (!ms.edit || !editDirty(ms.edit))) { ms.edit = null; d.openSheet("dietMeal", { fromHistory: true }); }
}

/** The meal screen is still the one showing (they may have gone back while the plan loaded). */
const stillOpen = () => !document.getElementById("sheet").hidden && document.getElementById("sheet-title").textContent.startsWith(SLOT_NAME[ms.sel?.slot] || "\u0000");

function openMeal(date, slot) {
  ms.sel = { date, slot };
  ms.edit = null;
  d.openSheet("dietMeal");
}

async function rebuild(ev) {
  const btn = ev?.currentTarget;
  if (btn) { btn.disabled = true; btn.textContent = "Making your plan…"; }
  try {
    await d.api("/diet/plan/rebuild", { method: "POST" });
    await loadPlan(true);
    d.toast("Fresh plan ready.");
    paint();
  } catch (err) {
    d.toast(err.message);
    if (btn) { btn.disabled = false; btn.textContent = "Make me a fresh plan"; }
  }
}

// ---------- one meal: the meal editor ----------
//
// Change portions, remove items, add foods (searched from the catalog, already filtered by the
// person's diet, foods to avoid and meat limits), or swap the whole meal for another option. The
// numbers update as they edit; Save keeps the meal in the plan for that day.

/** The household step for an item: 1 for pieces and slices, ½ for katoris, ¼ for a usual meal. */
function stepOf(i) {
  const unit = i.servingId?.split(":")[1];
  if (!unit) return 0.25;
  return unit === "piece" || unit === "slice" ? 1 : 0.5;
}

function fmtQty(q) {
  const w = Math.floor(q);
  const f = q - w;
  const fr = f === 0.5 ? "½" : f === 0.25 ? "¼" : f === 0.75 ? "¾" : "";
  return w ? `${w}${fr}` : fr || "0";
}

/** The item's text at a new quantity, e.g. "2 medium roti" → "3 medium roti". */
function textAt(i, q) {
  if (q === i.qty) return i.text;
  // A weighed serving ("100 g paneer") counts servings in front: "2 × 100 g paneer".
  if (i.qty === 1 && /^\d+ ?(g|ml)\b/.test(i.text)) return `${fmtQty(q)} × ${i.text}`;
  const lead = /^[\d¼½¾]+(?:\s*×)?\s*/;
  return lead.test(i.text) ? i.text.replace(/^[\d¼½¾]+/, fmtQty(q)) : `${fmtQty(q)} × ${i.text}`;
}

function scaled(i, q) {
  const f = i.qty ? q / i.qty : 1;
  return { kcal: i.kcal * f, proteinG: i.proteinG * f, carbsG: i.carbsG * f, fatG: i.fatG * f };
}

/** The editor's rows for a planned meal: each planned item, kept at its portion. */
function startEdit(date, slot, items) {
  ms.edit = { date, slot, rows: items.map((base, k) => ({ keep: k, base, qty: base.qty })), adding: false, q: "", hits: null };
}

const editDirty = (e) => e.rows.length !== e.rows.filter((r) => r.keep != null).length
  || e.rows.some((r, k) => r.keep !== k || r.qty !== r.base.qty)
  || e.rows.length !== (pickOf(e.date, e.slot)?.items.length ?? 0);

const editBody = (e) => JSON.stringify({ items: e.rows.map((r) => (r.keep != null ? { keep: r.keep, qty: r.qty } : { servingId: r.servingId, qty: r.qty })) });

function totalsOf(rows) {
  return rows.reduce((a, r) => { const s = scaled(r.base, r.qty); return { kcal: a.kcal + s.kcal, proteinG: a.proteinG + s.proteinG, carbsG: a.carbsG + s.carbsG, fatG: a.fatG + s.fatG }; }, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
}

/** Meal totals against the meal's share of the day: calories big, then protein, carbs and fat bars. */
function totalsPanel(t, budget) {
  const { el, fmt } = d;
  const bar = (label, val, target, cls) => {
    const pct = target ? Math.min(100, Math.round((val / target) * 100)) : 0;
    const over = target && val > target * 1.15;
    return el("div", { class: `mt-macro${over ? " over" : ""}` },
      el("span", { class: "k" }, el("i", { class: `sw ${cls}` }), label),
      el("span", { class: "v" }, `${fmt(val)}`, target ? el("small", {}, ` / ${fmt(target)} g`) : el("small", {}, " g")),
      el("div", { class: "meter thin" }, el("i", { style: `width:${pct}%` })));
  };
  const diff = budget ? Math.round(t.kcal - budget.calories) : 0;
  const near = budget && Math.abs(diff) <= budget.calories * 0.1;
  // Protein is what the plan protects most; say so when an edit leaves the meal well short.
  const proteinShort = budget?.proteinG && t.proteinG < budget.proteinG * 0.85 ? Math.round(budget.proteinG - t.proteinG) : 0;
  return el("div", { class: "meal-edit-totals" },
    el("div", { class: "meal-totals" },
      el("div", { class: "big" }, el("span", { class: "num" }, fmt(t.kcal)), el("span", { class: "unit" }, "kcal")),
      budget ? el("div", { class: "side" },
        el("div", { class: "muted" }, `Meal target ${fmt(budget.calories)} kcal`),
        el("div", { class: near ? "good" : diff > 0 ? "warn" : "muted" }, near ? "On target" : diff > 0 ? `${fmt(diff)} over` : `${fmt(-diff)} under`),
        proteinShort > 0 ? el("div", { class: "warn" }, `${fmt(proteinShort)} g protein short`) : null) : null),
    el("div", { class: "mt-macros" },
      bar("Protein", t.proteinG, budget?.proteinG, "p"),
      bar("Carbs", t.carbsG, budget?.carbsG, "c"),
      bar("Fat", t.fatG, budget?.fatG, "f")));
}

export function mealScreen() {
  const { el, fmt } = d;
  const { date, slot } = ms.sel;
  const p = pickOf(date, slot);
  const wrap = el("div", { class: "stack meal-screen" });
  document.getElementById("sheet-title").textContent = `${SLOT_NAME[slot]} · ${dayLabel(date)}`;
  if (!p) { wrap.append(el("p", { class: "none" }, "This meal isn't in the plan any more.")); return wrap; }
  const canEat = date <= d.todayKey();
  const eaten = isEaten(p);
  const budget = budgetOf(slot);

  if (p.kind === "eat_out") {
    wrap.append(
      el("p", {}, p.title),
      el("p", { class: "hint" }, "Pick a dish with a protein (paneer, dal, chicken, eggs) and go easy on fried sides and refined bread. Log what you had and the rest of the day adjusts."),
      el("button", { class: "btn primary block", type: "button", onclick: () => d.logOwn(slot) }, "Log what I ate"),
      el("p", { class: "hint" }, "Search the food list first. If something isn't there, describe it and I'll estimate it."));
    return wrap;
  }

  if (eaten) {
    const items = itemsOf(p);
    const t = { kcal: sum(items, "kcal"), proteinG: sum(items, "proteinG"), carbsG: sum(items, "carbsG"), fatG: sum(items, "fatG") };
    wrap.append(totalsPanel(t, budget),
      el("ul", { class: "portion-list" }, ...items.map((i) => el("li", {}, el("span", { class: "iname" }, i.text, el("small", {}, `${fmt(i.kcal)} kcal · ${fmt(i.proteinG)} g protein`))))),
      el("p", { class: "done-line" }, p.status === "partial" ? "Eaten, with your changes." : "Eaten as planned."),
      el("button", { class: "link", type: "button", onclick: undo }, "Undo"));
    return wrap;
  }

  if (!ms.edit || ms.edit.date !== date || ms.edit.slot !== slot) startEdit(date, slot, p.items);
  const e = ms.edit;
  const totalsBox = el("div");
  const list = el("ul", { class: "portion-list edit-list" });
  const action = el("div", { class: "stack meal-actions" });
  const addBox = el("div", { class: "stack add-food" });

  const repaint = () => { paintItems(); paintTotals(); paintAction(); };
  const paintTotals = () => totalsBox.replaceChildren(totalsPanel(totalsOf(e.rows), budget));
  const paintItems = () => {
    if (!e.rows.length) { list.replaceChildren(el("li", { class: "none hint" }, "No items. Add a food below, or swap for another meal.")); return; }
    list.replaceChildren(...e.rows.map((r, k) => {
      const i = r.base;
      const step = stepOf(i);
      const s = scaled(i, r.qty);
      const change = (dir) => {
        const next = Math.round((r.qty + dir * step) * 100) / 100;
        if (next <= 0 || next > 20) return;
        r.qty = next;
        repaint();
      };
      return el("li", { class: r.keep == null ? "added" : "" },
        el("span", { class: "iname" }, textAt(i, r.qty),
          el("small", {}, `${fmt(s.kcal)} kcal · P ${fmt(s.proteinG)} · C ${fmt(s.carbsG)} · F ${fmt(s.fatG)} g`)),
        el("span", { class: "stepper small" },
          el("button", { type: "button", "aria-label": `Less ${i.name}`, disabled: r.qty - step <= 0, onclick: () => change(-1) }, "−"),
          el("button", { type: "button", "aria-label": `More ${i.name}`, onclick: () => change(1) }, "+"),
          el("button", { class: "remove", type: "button", "aria-label": `Remove ${i.name}`, onclick: () => { e.rows.splice(k, 1); repaint(); } }, "×")));
    }));
  };
  const paintAction = () => {
    const dirty = editDirty(e);
    const kids = [];
    if (dirty) {
      kids.push(el("button", { class: "btn primary block", type: "button", disabled: !e.rows.length, onclick: (ev) => save(ev, false) }, "Save changes"));
      if (canEat) kids.push(el("button", { class: "btn block", type: "button", disabled: !e.rows.length, onclick: (ev) => save(ev, true) }, "Save and mark eaten"));
      kids.push(el("button", { class: "link quiet", type: "button", onclick: () => { startEdit(date, slot, p.items); paintAdd(); repaint(); } }, "Discard changes"));
    } else if (canEat) {
      kids.push(el("button", { class: "btn primary block", type: "button", onclick: (ev) => save(ev, true) }, "Ate this"),
        el("button", { class: "btn block", type: "button", onclick: () => d.logOwn(slot) }, "Log my own instead"));
    } else {
      kids.push(el("p", { class: "hint" }, "Change it any time before the day. You can log it on the day."));
    }
    action.replaceChildren(...kids);
  };

  // Adding a food: a search box that lists foods (filtered by the server against their restrictions).
  let timer = null;
  let seq = 0;
  const search = async () => {
    const mine = ++seq;
    try {
      const r = await d.api(`/diet/foods?slot=${slot}&q=${encodeURIComponent(e.q)}`);
      if (mine !== seq) return;
      e.hits = r.foods;
    } catch (err) { if (mine === seq) e.hits = []; d.toast(err.message); }
    paintHits();
  };
  const hitsBox = el("ul", { class: "list food-hits" });
  const paintHits = () => {
    if (!e.hits) { hitsBox.replaceChildren(el("li", { class: "hint" }, "Loading…")); return; }
    if (!e.hits.length) { hitsBox.replaceChildren(el("li", { class: "hint" }, e.q ? "Nothing that fits your diet matches that. Try another name." : "Type a food to add.")); return; }
    hitsBox.replaceChildren(...e.hits.map((h) => el("li", {},
      el("span", { class: "fname" }, h.name),
      el("div", { class: "chips wrap" }, ...h.servings.map((s) => el("button", { class: "chip", type: "button", onclick: () => {
        e.rows.push({ servingId: s.id, base: s.item, qty: 1 });
        e.adding = false;
        e.q = "";
        paintAdd();
        repaint();
        d.toast(`Added ${s.item.text}.`);
      } }, `${s.label} · ${fmt(s.item.kcal)} kcal`))))));
  };
  const paintAdd = () => {
    if (!e.adding) {
      addBox.replaceChildren(el("button", { class: "btn block add-btn", type: "button", disabled: e.rows.length >= 12, onclick: () => { e.adding = true; e.hits = null; paintAdd(); search(); } }, "+ Add a food"));
      return;
    }
    const input = el("input", { class: "field", type: "search", placeholder: "Search foods: paneer, curd, apple…", value: e.q, "aria-label": "Search foods", enterkeyhint: "search" });
    input.addEventListener("input", () => { e.q = input.value; clearTimeout(timer); timer = setTimeout(search, 250); });
    addBox.replaceChildren(
      el("div", { class: "row-input" }, input, el("button", { class: "btn small", type: "button", onclick: () => { e.adding = false; e.q = ""; paintAdd(); } }, "Done")),
      el("p", { class: "hint" }, "Only foods that fit your diet and foods to avoid are shown."),
      hitsBox);
    paintHits();
    setTimeout(() => input.focus(), 0);
  };

  async function save(ev, andEat) {
    ev.target.disabled = true;
    try {
      if (editDirty(e)) await d.api(`/diet/days/${date}/${slot}/items`, { method: "PUT", body: editBody(e) });
      if (andEat) await d.api(`/diet/days/${date}/${slot}/eat`, { method: "POST", body: "{}" });
      ms.edit = null;
      await loadPlan(true);
      d.toast(andEat ? "Logged." : "Saved. The plan keeps this meal for the day.");
      if (andEat) d.refresh?.();
      d.openSheet("dietMeal", { fromHistory: true });
      paint();
    } catch (err) {
      d.toast(err.message);
      ev.target.disabled = false;
      // Saved but the log failed: what's on screen is now the plan.
      if (andEat) { await loadPlan(true).catch(() => {}); }
    }
  }
  async function undo() {
    try {
      await d.api(`/diet/days/${date}/${slot}/undo`, { method: "POST" });
      ms.edit = null;
      await loadPlan(true);
      d.toast("Removed from today's log.");
      d.refresh?.();
      d.openSheet("dietMeal", { fromHistory: true });
      paint();
    } catch (err) { d.toast(err.message); }
  }

  paintAdd();
  repaint();
  wrap.append(...[totalsBox, list, addBox, suppNote(slot), action].filter(Boolean));
  if (p.optionId && !p.edited) wrap.append(optionMarks(p.optionId));
  wrap.append(otherOptions(date, slot, p.optionId));
  return wrap;
}

/** Supplements set for this meal: they count toward the day, so the meal's target is smaller. */
function suppNote(slot) {
  const { el, fmt } = d;
  const lines = (ms.view?.supplements?.lines || []).filter((l) => l.slot === slot);
  if (!lines.length) return null;
  const kcal = lines.reduce((a, l) => a + l.kcal, 0);
  const protein = lines.reduce((a, l) => a + l.proteinG, 0);
  return el("p", { class: "hint supp-note" }, `With this meal: ${lines.map((l) => `${l.name} (${l.text})`).join(", ")}, ${fmt(kcal)} kcal and ${fmt(Math.round(protein))} g protein. They're counted on their own, so the meal target is already smaller.`);
}

/** Pin (every day), like, hide for the meal's current option. */
function optionMarks(optionId) {
  const { el } = d;
  const marks = ms.view.marks;
  const pinned = marks.pinned.includes(optionId);
  const liked = marks.liked.includes(optionId);
  const mark = async (action, done) => {
    try {
      const r = await d.api(`/diet/options/${optionId}`, { method: "POST", body: JSON.stringify({ action }) });
      ms.view.marks = { pinned: r.pinned, liked: r.liked, hidden: r.hidden };
      if (done) d.toast(done);
      if (action === "hide") { ms.edit = null; await loadPlan(true); paint(); d.backSheet(); return; }
      if (action === "pin" || action === "unpin") await loadPlan(true);
      d.openSheet("dietMeal", { fromHistory: true });
      paint();
    } catch (err) { d.toast(err.message); }
  };
  return el("div", { class: "option-marks" },
    el("button", { class: `chip${pinned ? " on" : ""}`, type: "button", "aria-pressed": String(pinned), onclick: () => mark(pinned ? "unpin" : "pin", pinned ? "Unpinned." : "Pinned: it'll be in the plan every day.") }, pinned ? "★ Every day" : "☆ Have this every day"),
    el("button", { class: `chip${liked ? " on" : ""}`, type: "button", "aria-pressed": String(liked), onclick: () => mark(liked ? "unlike" : "like") }, liked ? "♥ Liked" : "♡ Like"),
    el("button", { class: "chip", type: "button", onclick: () => mark("hide", "Hidden. It won't be suggested again.") }, "Don't suggest this"));
}

/** The other options for this meal; every one was built inside the person's restrictions. */
function otherOptions(date, slot, currentId) {
  const { el, fmt } = d;
  const others = optionsOf(slot).filter((o) => o.id !== currentId || pickOf(date, slot)?.edited);
  if (!others.length) return el("div");
  const budget = budgetOf(slot);
  return el("div", { class: "stack" },
    el("p", { class: "section-label" }, "Swap for another meal"),
    el("ul", { class: "list option-list" }, ...others.map((o) =>
      el("li", {},
        el("button", { class: "option-row", type: "button", onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try {
            await d.api(`/diet/days/${date}/${slot}/swap`, { method: "POST", body: JSON.stringify({ optionId: o.id }) });
            ms.edit = null;
            await loadPlan(true);
            d.toast("Swapped. You can still change the items.");
            d.openSheet("dietMeal", { fromHistory: true });
            paint();
          } catch (err) { d.toast(err.message); ev.currentTarget.disabled = false; }
        } },
          el("span", { class: "what" }, o.items.map((i) => i.text).join(", ")),
          el("span", { class: "sub" }, `${fmt(o.totals.kcal)} kcal · P ${fmt(o.totals.proteinG)} · C ${fmt(o.totals.carbsG)} · F ${fmt(o.totals.fatG)} g${o.prepMinutes ? ` · ${o.prepMinutes} min` : ""}${ms.view.marks.pinned.includes(o.id) ? " · ★" : ""}`),
          budget && Math.abs(o.totals.kcal - budget.calories) > budget.calories * 0.1 ? el("span", { class: "sub" }, `Sized for ${fmt(budget.calories)} kcal`) : null)))));
}

// ---------- setup ----------

function normalised(meals) {
  const on = meals.filter((m) => m.on);
  const base = on.reduce((a, m) => a + DEFAULT_SHARES[m.slot], 0) || 1;
  let left = 100;
  return on.map((m, k) => {
    const share = k === on.length - 1 ? left : Math.max(5, Math.min(70, Math.round((DEFAULT_SHARES[m.slot] / base) * 100)));
    left -= share;
    return { slot: m.slot, time: m.time || null, share: Math.max(5, Math.min(70, share)), cookMinutes: m.cook };
  });
}

export function setupScreen() {
  const { el } = d;
  const p = ms.view?.prefs;
  const saved = ms.view?.setup;
  const v = {
    meals: SLOT_ORDER.map((slot) => {
      const m = p?.meals.find((x) => x.slot === slot);
      return { slot, on: saved ? !!m : true, time: m?.time || DEFAULT_TIMES[slot], cook: m?.cookMinutes ?? null };
    }),
    whoCooks: p?.whoCooks || "self",
    kitchen: p?.kitchen || "full",
    staples: p?.staples || "both",
    loves: [...(p?.loves || [])],
    restrictions: [...(p?.restrictions || [])],
    fastingDays: [...(p?.fastingDays || [])],
    eatOut: [...(p?.eatOut || [])],
    supplements: (p?.supplements || []).map((x) => ({ name: x.name, servings: x.servings || 1, slot: x.slot || null })),
  };
  const wrap = el("div", { class: "stack diet-setup" });

  const seg = (options, get, set) => {
    const node = el("div", { class: "seg", role: "radiogroup" });
    const paintSeg = () => node.replaceChildren(...options.map(([val, label]) =>
      el("button", { type: "button", role: "radio", class: get() === val ? "on" : "", "aria-checked": String(get() === val), onclick: () => { set(val); paintSeg(); } }, label)));
    paintSeg();
    return node;
  };

  const mealsBox = el("div", { class: "stack" });
  const paintMeals = () => mealsBox.replaceChildren(...v.meals.map((m) =>
    el("div", { class: `setup-meal${m.on ? "" : " off"}` },
      el("div", { class: "set-row" },
        el("div", { class: "set-text" }, el("span", {}, SLOT_NAME[m.slot])),
        el("span", { class: "row-right" },
          m.on ? el("input", { class: "field time", type: "time", value: m.time || "", "aria-label": `${SLOT_NAME[m.slot]} time`, onchange: (e) => { m.time = e.target.value; } }) : null,
          el("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(m.on), "aria-label": `Plan ${SLOT_NAME[m.slot]}`,
            onclick: () => { if (m.on && v.meals.filter((x) => x.on).length === 1) return; m.on = !m.on; paintMeals(); } }))),
      m.on ? el("label", { class: "cook" }, "Time to cook",
        seg([[null, "Any"], [0, "None"], [10, "10 min"], [20, "20 min"], [30, "30 min"]], () => m.cook, (x) => { m.cook = x; })) : null)));
  paintMeals();

  const chipList = (list, placeholder, max) => {
    const box = el("div", { class: "stack" });
    const input = el("input", { class: "field", type: "text", maxlength: "40", placeholder });
    const add = () => { const t = input.value.trim(); if (t && list.length < max && !list.some((x) => x.toLowerCase() === t.toLowerCase())) list.push(t); input.value = ""; paint(); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    const chips = el("div", { class: "chips wrap" });
    const paint = () => chips.replaceChildren(...list.map((t, k) => el("button", { class: "chip on", type: "button", "aria-label": `Remove ${t}`, onclick: () => { list.splice(k, 1); paint(); } }, `${t} ×`)));
    paint();
    box.append(chips, el("div", { class: "row-input" }, input, el("button", { class: "btn small", type: "button", onclick: add }, "Add")));
    return box;
  };

  // Supplements: tap the ones you take daily, then how many and with which meal.
  const choices = ms.view?.supplements?.choices || [];
  const suppBox = el("div", { class: "stack supp-box" });
  const paintSupps = () => {
    const has = (n) => v.supplements.find((x) => x.name === n);
    const chips = el("div", { class: "chips wrap" }, ...choices.map((c) => el("button", { type: "button", class: `chip${has(c.name) ? " on" : ""}`, "aria-pressed": String(!!has(c.name)),
      onclick: () => { v.supplements = has(c.name) ? v.supplements.filter((x) => x.name !== c.name) : v.supplements.length < 8 ? [...v.supplements, { name: c.name, servings: 1, slot: null }] : v.supplements; paintSupps(); } }, c.name)));
    const rows = v.supplements.map((s) => {
      const c = choices.find((x) => x.name === s.name);
      const nowKcal = c ? Math.round(c.kcal * s.servings) : 0;
      const nowP = c ? Math.round(c.proteinG * s.servings) : 0;
      return el("div", { class: "supp-row" },
        el("div", { class: "set-row" },
          el("div", { class: "set-text" }, el("span", {}, s.name), el("small", {}, `${s.servings === 1 ? "" : `${s.servings} × `}${c?.label || "1 serving"} · ${nowKcal} kcal · ${nowP} g protein`)),
          el("span", { class: "row-right" },
            el("button", { class: "btn small", type: "button", "aria-label": `Fewer ${s.name}`, onclick: () => { s.servings = Math.max(0.5, s.servings - 0.5); paintSupps(); } }, "−"),
            el("span", {}, String(s.servings)),
            el("button", { class: "btn small", type: "button", "aria-label": `More ${s.name}`, onclick: () => { s.servings = Math.min(4, s.servings + 0.5); paintSupps(); } }, "+"))),
        seg([[null, "Any meal"], ["breakfast", "Breakfast"], ["lunch", "Lunch"], ["snack", "Snack"], ["dinner", "Dinner"]], () => s.slot, (x) => { s.slot = x; }));
    });
    suppBox.replaceChildren(chips, ...rows);
  };
  paintSupps();

  const days7 = (get, toggle) => {
    const node = el("div", { class: "weekdays" });
    const paintDays = () => node.replaceChildren(...WD.map((w, k) => el("button", { type: "button", class: `chip${get(k) ? " on" : ""}`, "aria-pressed": String(get(k)), onclick: () => { toggle(k); paintDays(); } }, w)));
    paintDays();
    return node;
  };
  const eatOutHas = (day, slot) => v.eatOut.some((e) => e.day === day && e.slot === slot);
  const eatOutToggle = (day, slot) => { v.eatOut = eatOutHas(day, slot) ? v.eatOut.filter((e) => !(e.day === day && e.slot === slot)) : [...v.eatOut, { day, slot }]; };

  const save = el("button", { class: "btn primary block", type: "button", onclick: async () => {
    save.disabled = true;
    try {
      const body = {
        meals: normalised(v.meals),
        whoCooks: v.whoCooks, kitchen: v.kitchen, staples: v.staples,
        loves: v.loves, restrictions: v.restrictions, fastingDays: v.fastingDays,
        supplements: v.supplements,
        eatOut: v.eatOut.filter((e) => v.meals.some((m) => m.on && m.slot === e.slot)),
      };
      const r = await d.api("/diet/prefs", { method: "PUT", body: JSON.stringify(body) });
      await loadPlan(true);
      d.toast(r.needsTargets ? "Saved. Set your targets and the plan builds." : saved ? "Plan updated. Today stays as it is." : "Your plan is ready.");
      d.closeSheet();
      d.setView("meals");
      paint();
    } catch (err) { d.toast(err.message); save.disabled = false; }
  } }, saved ? "Save and update my plan" : "Make my plan");

  wrap.append(
    el("p", { class: "hint" }, "Your diet and foods to avoid come from your food preferences. The plan always fits your calorie and protein targets."),
    el("button", { class: "menu-row", type: "button", onclick: () => d.openSheet("account") }, el("span", {}, el("b", {}, "Diet and foods to avoid"), el("small", {}, "Change them in Food, connections & account")), el("i", { class: "chev-r" })),
    el("p", { class: "section-label" }, "Your meals"),
    mealsBox,
    el("p", { class: "section-label" }, "Who cooks"),
    seg([["self", "Me"], ["family", "Family"], ["cook", "A cook"], ["canteen", "Canteen / mess"]], () => v.whoCooks, (x) => { v.whoCooks = x; }),
    el("p", { class: "section-label" }, "Kitchen"),
    seg([["full", "Full"], ["basic", "Basic (kettle, microwave)"], ["none", "None"]], () => v.kitchen, (x) => { v.kitchen = x; }),
    el("p", { class: "section-label" }, "Roti or rice"),
    seg([["roti", "Mostly roti"], ["rice", "Mostly rice"], ["both", "Both"]], () => v.staples, (x) => { v.staples = x; }),
    el("p", { class: "section-label" }, "Supplements you take daily"),
    el("p", { class: "hint" }, "Whey, creatine, a gainer, vitamins. Their calories and protein count toward your day, so your meals are planned around them."),
    suppBox,
    el("p", { class: "section-label" }, "Foods you love"),
    chipList(v.loves, "e.g. paneer, poha, dosa", 20),
    el("p", { class: "section-label" }, "Anything else to keep in mind"),
    chipList(v.restrictions, "e.g. diabetic, no onion on Tuesdays", 10),
    el("p", { class: "section-label" }, "Fasting days"),
    days7((k) => v.fastingDays.includes(k), (k) => { v.fastingDays = v.fastingDays.includes(k) ? v.fastingDays.filter((x) => x !== k) : [...v.fastingDays, k]; }),
    el("p", { class: "section-label" }, "Lunch you usually eat out"),
    days7((k) => eatOutHas(k, "lunch"), (k) => eatOutToggle(k, "lunch")),
    el("p", { class: "section-label" }, "Dinner you usually eat out"),
    days7((k) => eatOutHas(k, "dinner"), (k) => eatOutToggle(k, "dinner")),
    save);
  return wrap;
}

// ---------- Today ----------

/** One line for the Today food card: eaten against the plan, and the next planned meal. */
export function planLineFor(date, openTab) {
  const { el, fmt } = d;
  if (!ms.view?.setup || !days().includes(date)) return null;
  const picks = SLOT_ORDER.map((s) => pickOf(date, s)).filter(Boolean);
  const next = picks.find((p) => !isEaten(p));
  const tot = dayTotals(date);
  const line = el("button", { class: "plan-line", type: "button", onclick: openTab },
    el("span", {}, `Plan: ${tot.eatenCount} of ${tot.count} meals eaten`),
    next ? el("small", {}, `Next: ${SLOT_NAME[next.slot]}, ${next.kind === "eat_out" ? "eating out" : `${fmt(next.totals.kcal)} kcal`}`) : el("small", {}, "All planned meals eaten"),
    el("i", { class: "chev-r" }));
  if (!next || next.kind === "eat_out") return line;
  return el("div", { class: "plan-line-wrap" }, line,
    el("button", { class: "btn small plan-change", type: "button", onclick: () => openPlannedMeal(next.date, next.slot) }, `Change or swap ${SLOT_NAME[next.slot].toLowerCase()}`));
}

export const mealsTitles = { dietSetup: "Your meals", dietMeal: "" };
