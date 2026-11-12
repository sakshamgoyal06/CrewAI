// Meals tab: the diet plan. Setup answers, the next three days, and one screen per meal with
// portions, "Ate this", swaps and pins. Everything big opens as its own screen (UI rule).

const SLOT_NAME = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner" };
const SLOT_ORDER = ["breakfast", "lunch", "snack", "dinner"];
/** A fasting-day allowance (pick.ts): planned like a meal out, with its own words. */
const isFast = (p) => p.kind === "eat_out" && /^Fasting meal/.test(p.title || "");
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
// The server's today (profile timezone) wins: the app's own date can be a cached one from yesterday.
const todayKey = () => ms.view?.today || d.todayKey();
const isEaten = (p) => p && (p.status === "logged" || p.status === "partial");

function dayLabel(date) {
  const t = todayKey();
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
  if (!ms.date || !all.includes(ms.date)) ms.date = all.includes(todayKey()) ? todayKey() : all[0];
  const strip = el("div", { class: "seg meal-days", role: "tablist" },
    ...all.map((date) => el("button", { type: "button", role: "tab", class: date === ms.date ? "on" : "", "aria-selected": String(date === ms.date),
      onclick: () => { ms.date = date; paint(); } }, dayLabel(date))));

  const t = v.plan.targets;
  const isToday = ms.date === todayKey();
  const summary = daySummary(ms.date, t, isToday);

  // The same list as Today: planned meals with their state, plus anything extra.
  const order = SLOT_ORDER.filter((s) => v.prefs.meals.some((m) => m.slot === s));
  const list = dayMealList(listFor(ms.date), { title: isToday ? "Meals today" : `Meals · ${dayLabel(ms.date)}` })
    || el("ul", { class: "list meal-plan" }, ...order.map((slot) => mealCard(ms.date, slot)).filter(Boolean));
  host.replaceChildren(...[gapCard(v.proteinGap, v.planGaps || [], v.gapCause, v.prefs), strip, summary, list,
    el("div", { class: "fresh-plan" },
      el("button", { class: "btn block", type: "button", onclick: rebuild }, "Make me a fresh plan"),
      el("p", { class: "hint" }, "New options from your current food settings. Meals you've already eaten stay."))].filter(Boolean));
}

/**
 * Every target the planned meals can't reach under their own rules (calories, protein, carbs, fat,
 * fibre), flagged together when the plan is built. Protein keeps its three choices; the rest can be
 * kept as they are or fixed by loosening a rule. Answered protein: one quiet line until the rules change.
 */
function gapCard(g, gaps, cause, prefs) {
  const { el, fmt } = d;
  const others = gaps.filter((x) => x.key !== "proteinG");
  const proteinOpen = g && g.answered?.choice !== "accept";
  // Answers Magnus gave by default (12 Nov plan, item 7) carry an Undo that reopens the choice.
  const autoKept = prefs?.planGapsOk?.auto ? prefs.planGapsOk.keys.map((k) => GAP_LABEL[k]).filter(Boolean) : [];
  const autoProtein = g && g.answered?.choice === "accept" && g.answered.auto;
  const undo = autoProtein || autoKept.length
    ? el("button", { class: "link", type: "button", onclick: (e) => undoGapDefaults(e.currentTarget) }, "Undo, let me choose")
    : null;
  const lines = [
    g && g.answered?.choice === "accept" ? `Protein target is ${Math.round(g.plannedG / 5) * 5} g while ${g.cause} limits the plan. It goes back to ${g.targetG} g when that ends.` : null,
    autoKept.length ? `${autoKept.join(", ")} kept as the plan has ${autoKept.length === 1 ? "it" : "them"}, so the coach won't count ${autoKept.length === 1 ? "it" : "them"} against you.` : null,
  ].filter(Boolean);
  const note = lines.length ? el("p", { class: "hint gap-note" }, lines.join(" "), undo ? " " : null, undo) : null;
  if (!proteinOpen && !others.length) return note;
  // One line on the Meals tab; the choices open as their own screen (UI rule: big content = screen).
  const first = proteinOpen ? `Plan reaches ${fmt(g.plannedG)} of ${fmt(g.targetG)} g protein` : `Plan misses ${others[0].label.toLowerCase()}`;
  const more = (proteinOpen ? others.length : others.length - 1);
  return el("div", {},
    note,
    el("button", { class: "gap-banner", type: "button", onclick: () => d.openSheet("planGaps") },
      el("span", { class: "gap-dot", "aria-hidden": "true" }),
      el("span", { class: "gap-text" }, first, more ? el("small", {}, ` and ${more} more`) : null),
      el("span", { class: "gap-cta" }, "Decide"),
      el("i", { class: "chev-r", "aria-hidden": "true" })));
}

const GAP_LABEL = { kcal: "Calories", carbsG: "Carbs", fatG: "Fat", fiberG: "Fibre" };

async function undoGapDefaults(btn) {
  btn.disabled = true;
  try {
    await d.api("/diet/plan-gaps/undo", { method: "POST", body: "{}" });
    d.toast("Undone. Pick how to handle the gaps.");
    await loadPlan(true);
    d.refresh?.();
    paint();
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

/** The plan's gaps and what to do about them, as its own screen. */
export function planGapsScreen() {
  const { el, fmt } = d;
  const v = ms.view;
  const g = v?.proteinGap;
  const gaps = v?.planGaps || [];
  const cause = v?.gapCause;
  const others = gaps.filter((x) => x.key !== "proteinG");
  const proteinOpen = g && g.answered?.choice !== "accept";
  if (!proteinOpen && !others.length) return el("div", { class: "stack" }, el("p", { class: "none" }, "Your plan reaches every target now."));
  const act = async (btn, path, body, done) => {
    btn.disabled = true;
    try {
      const r = await d.api(path, { method: "POST", body: JSON.stringify(body || {}) });
      d.toast(done(r));
      await loadPlan(true);
      d.refresh?.();
      paint();
      d.closeSheet();
    } catch (err) {
      btn.disabled = false;
      d.toast(err.message);
    }
  };
  const answer = (btn, choice) => choice === "loosen"
    ? d.openSheet("dietSetup")
    : act(btn, "/diet/protein-gap", { choice }, (r) => (choice === "accept" ? `Protein target set to ${r.proteinTarget} g for now.` : `Added ${r.supplement} to your supplements.`));
  const again = g?.answered?.choice === "supplement";
  const why = cause || g?.cause || "your food settings";
  const row = (x) => el("li", {}, el("b", {}, x.label), ` ${fmt(x.planned)} of ${fmt(x.target)} ${x.unit}`, el("small", {}, x.direction === "over" ? " over" : " short"));
  const list = [...(proteinOpen ? [{ key: "proteinG", label: "Protein", unit: "g", planned: g.plannedG, target: g.targetG, direction: "under" }] : []), ...others];
  // One strong button (the first choice); the rest are plain rows.
  return el("div", { class: "stack gap-screen" },
    el("p", { class: "pa-head" }, `${again ? "Even with the supplement, your" : "Your"} planned meals don't reach ${list.length === 1 ? "one target" : `${list.length} targets`}. ${why[0].toUpperCase()}${why.slice(1)} limits what fits.`),
    el("ul", { class: "gap-list" }, ...list.map(row)),
    el("p", { class: "hint" }, "Those gaps are the plan's, not yours. Pick how to handle them:"),
    el("div", { class: "stack" },
      proteinOpen ? el("button", { class: "btn primary block", type: "button", onclick: (e) => answer(e.currentTarget, "accept") }, `Aim for ${Math.round(g.plannedG / 5) * 5} g protein for now`) : null,
      proteinOpen && !again ? el("button", { class: "btn block", type: "button", onclick: (e) => answer(e.currentTarget, "supplement") }, "Add a protein supplement") : null,
      others.length ? el("button", { class: `btn block${proteinOpen ? "" : " primary"}`, type: "button", onclick: (e) => act(e.currentTarget, "/diet/plan-gaps/accept", {}, () => "Kept. The coach won't count these against you.") }, `Keep ${others.map((x) => x.label.toLowerCase()).join(", ")} as planned`) : null,
      el("button", { class: "link center", type: "button", onclick: (e) => answer(e.currentTarget, "loosen") }, "Loosen a food rule")));
}

/**
 * The day at a glance: a calorie ring with the key number big, a colour bar per macro, and up to
 * two status tags. On today the solid fill is what's been eaten and the faint fill what's planned;
 * on other days the fill is what's planned. Target, planned, eaten and any eating-out allowance
 * sit in a fold. All numbers come from the server's day account.
 */
function daySummary(date, t, isToday) {
  const { el, fmt } = d;
  const a = (ms.view.accounts || []).find((x) => x.date === date);
  if (!a) return el("div", { class: "day-glance" }, ring(0, 0, fmt(t.calories), "kcal target"));
  const tgt = a.target;
  const plannedKcal = a.planned.kcal + a.allowanceKcal;
  const main = isToday ? a.logged.kcal : plannedKcal;
  const macro = (key, name, cls) => {
    const goal = tgt[key] || 0;
    const now = isToday ? a.logged[key] : a.planned[key];
    const pct = goal ? now / goal : 0;
    const ghost = isToday && goal ? Math.min(1, a.planned[key] / goal) : 0;
    const state = pct > 1.12 ? "over" : !isToday && pct < 0.9 ? "short" : "";
    return el("li", { class: `mac ${cls} ${state}` },
      el("span", { class: "mac-name" }, name),
      el("span", { class: "mac-val" }, el("b", {}, fmt(now)), el("small", {}, ` / ${fmt(goal)} g`)),
      el("span", { class: "mac-bar" },
        ghost ? el("i", { class: "ghost", style: `width:${ghost * 100}%` }) : null,
        el("i", { class: "fill", style: `width:${Math.min(1, pct) * 100}%` })));
  };
  const tags = [];
  if (Math.abs(a.unallocatedKcal) < 50) tags.push(["good", isToday ? "Plan on target" : "Calories on target"]);
  // On today "planned" is what's eaten plus what's still to eat: where the day lands.
  if (a.unallocatedKcal <= -50) tags.push(["bad", isToday ? `Heading ${fmt(-a.unallocatedKcal)} kcal over` : `${fmt(-a.unallocatedKcal)} kcal over`]);
  if (a.proteinShortG >= 10) tags.push(["warn", `${fmt(a.proteinShortG)} g protein short`]);
  if (a.unallocatedKcal >= 50) tags.push(["warn", isToday ? `${fmt(a.unallocatedKcal)} kcal not planned yet` : `${fmt(a.unallocatedKcal)} kcal unplanned`]);
  const left = Math.round(tgt.kcal - a.logged.kcal);
  return el("div", { class: "day-glance" },
    el("div", { class: "glance-top" },
      ring(tgt.kcal ? main / tgt.kcal : 0, isToday && tgt.kcal ? plannedKcal / tgt.kcal : 0, fmt(main), isToday ? `of ${fmt(tgt.kcal)} eaten` : `of ${fmt(tgt.kcal)} kcal`),
      el("div", { class: "glance-side" },
        el("div", { class: "glance-tags" }, ...tags.slice(0, 2).map(([k, txt]) => el("span", { class: `tag ${k}` }, txt))),
        isToday ? el("p", { class: "glance-left" }, left >= 0 ? el("b", {}, fmt(left)) : el("b", { class: "over" }, fmt(-left)), left >= 0 ? " kcal left today" : " kcal over today") : null,
        el("ul", { class: "macs" }, macro("proteinG", "Protein", "p"), macro("carbsG", "Carbs", "c"), macro("fatG", "Fat", "f")))),
    dayDetails(a, isToday));
}

/** The calorie ring: a solid arc for the main number and, on today, a faint arc for what's planned. */
function ring(frac, ghost, value, label) {
  const { el, svg } = d;
  const C = 2 * Math.PI * 52;
  const arc = (f, cls) => svg("circle", { class: cls, cx: 60, cy: 60, r: 52, "stroke-dasharray": `${C}`, "stroke-dashoffset": `${C * (1 - Math.max(0, Math.min(1, f)))}` });
  const g = svg("svg", { viewBox: "0 0 120 120", "aria-hidden": "true" });
  g.append(svg("circle", { class: "track", cx: 60, cy: 60, r: 52 }));
  if (ghost) g.append(arc(ghost, "ghost"));
  g.append(arc(frac, frac > 1.05 ? "fill over" : "fill"));
  return el("div", { class: "kcal-ring" }, g,
    el("div", { class: "ring-mid" }, el("b", {}, value), el("small", {}, label)));
}

/** The fold under the ring: the numbers behind it, in short rows. */
function dayDetails(a, isToday) {
  const { el, fmt } = d;
  const m = (x) => `P ${fmt(x.proteinG)} · C ${fmt(x.carbsG)} · F ${fmt(x.fatG)}`;
  const row = (k, v, sub) => el("li", {}, el("span", { class: "k" }, k), el("span", { class: "v" }, v, sub ? el("small", {}, sub) : null));
  const rows = [
    row("Target", `${fmt(a.target.kcal)} kcal`, m(a.target)),
    row(isToday ? "Eaten + still to eat" : "Planned", `${fmt(a.planned.kcal)} kcal`, m(a.planned)),
    a.allowanceKcal ? row("Eating out", `~${fmt(a.allowanceKcal)} kcal`, "food not known yet") : null,
    isToday ? row("Eaten", `${fmt(a.logged.kcal)} kcal`, m(a.logged)) : null,
  ].filter(Boolean);
  const tip = a.proteinShortG >= 10
    ? el("p", { class: "glance-tip" }, a.allowanceKcal ? "Pick a protein dish when you eat out." : "Close the protein gap with curd, an egg or a scoop of whey.")
    : null;
  return el("details", { class: "glance-more" },
    el("summary", {}, el("span", {}, "Details"), el("i", { class: "chev" })),
    el("ul", { class: "glance-rows" }, ...rows),
    tip);
}

function mealCard(date, slot) {
  const { el, fmt } = d;
  const p = pickOf(date, slot);
  if (!p) return null;
  const eaten = isEaten(p);
  const items = itemsOf(p);
  const sub = p.kind === "eat_out"
    ? (isFast(p) ? "Fasting day" : "Eating out")
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
    d.toast(date < todayKey() ? "That meal's day has passed. Here's your plan now." : "That meal isn't in the plan any more.");
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

const editBody = (e) => JSON.stringify({ items: e.rows.map((r) => (r.keep != null ? { keep: r.keep, qty: r.qty } : r.custom ? { custom: r.custom, qty: r.qty } : { servingId: r.servingId, qty: r.qty })) });

/** A food from "Can't find it? Search" (web lookup or typed in) as an editor row with its own numbers. */
function customRow(it) {
  // Same characters the server accepts for a food name; anything else becomes a space.
  const name = it.name.replace(/[^\p{L}\p{M}\p{N}\s.,'’&%/()+×½¼¾-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Food";
  const cap = (n, max) => Math.min(max, Math.max(0, Math.round((+n || 0) * 10) / 10));
  const c = { name, kcal: Math.max(1, Math.round(cap(it.per.kcal, 3000))), proteinG: cap(it.per.p, 300), carbsG: cap(it.per.c, 500), fatG: cap(it.per.f, 300) };
  return { custom: c, base: { name: c.name, text: c.name, qty: 1, servingId: null, kcal: c.kcal, proteinG: c.proteinG, carbsG: c.carbsG, fatG: c.fatG }, qty: 1 };
}

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
  const canEat = date <= todayKey();
  // Before midnight starting the meal's day an edit changes the plan; on the day it records a swap.
  const onTheDay = canEat;
  const eaten = isEaten(p);
  const budget = budgetOf(slot);

  if (p.kind === "eat_out" && isFast(p)) {
    wrap.append(
      el("p", {}, p.title),
      el("p", { class: "hint" }, "Your fasting day. There's no fasting dish in your plan for this meal yet, so it's a calorie allowance."),
      el("p", { class: "hint" }, "Sabudana, kuttu or rajgira, potato, fruit, makhana, milk, curd and nuts all work. Log what you had and the rest of the day adjusts."),
      el("button", { class: "btn primary block", type: "button", onclick: () => d.logOwn(slot, date) }, "Log what I ate"));
    return wrap;
  }
  if (p.kind === "eat_out") {
    wrap.append(
      el("p", {}, p.title),
      el("p", { class: "hint" }, "This is a calorie allowance, not a planned meal: its protein, carbs and fat aren't known until you log what you had."),
      el("p", { class: "hint" }, "Pick a dish with a protein (paneer, dal, chicken, eggs) and go easy on fried sides and refined bread. Log what you had and the rest of the day adjusts."),
      el("button", { class: "btn primary block", type: "button", onclick: () => d.logOwn(slot, date) }, "Log what I ate"),
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
    if (dirty && onTheDay) {
      // On the meal's day an edit is what they had: logged as Had instead, the plan keeps its meal.
      kids.push(el("button", { class: "btn primary block", type: "button", disabled: !e.rows.length, onclick: (ev) => save(ev, false) }, "Log what I had"),
        el("p", { class: "hint" }, "Logged as what you had instead. The plan keeps its meal, so you can see the swap."));
      kids.push(el("button", { class: "link quiet", type: "button", onclick: () => { startEdit(date, slot, p.items); paintAdd(); repaint(); } }, "Discard changes"));
    } else if (dirty) {
      kids.push(el("button", { class: "btn primary block", type: "button", disabled: !e.rows.length, onclick: (ev) => save(ev, false) }, "Save changes"));
      kids.push(el("button", { class: "link quiet", type: "button", onclick: () => { startEdit(date, slot, p.items); paintAdd(); repaint(); } }, "Discard changes"));
    } else if (canEat) {
      // One strong button; logging something else is a quiet link under it.
      kids.push(el("button", { class: "btn primary block", type: "button", onclick: (ev) => save(ev, true) }, "Ate this"),
        el("button", { class: "link quiet center", type: "button", onclick: () => d.logOwn(slot, date) }, "Log my own instead"));
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
  // Not in the food list (or only a near miss, like plain raita for boondi raita): look it up on the web.
  const findOnWeb = () => {
    const q = e.q.trim();
    d.findFood(q, (added) => {
      const room = 12 - e.rows.length;
      e.rows.push(...added.slice(0, Math.max(0, room)).map(customRow));
      e.adding = false;
      e.q = "";
    });
  };
  const findRow = (none) => {
    const q = e.q.trim();
    return el("li", { class: "find-more" },
      none ? el("p", { class: "hint" }, `“${q}” isn't in the food list for your diet.`) : null,
      el("button", { class: "btn block", type: "button", title: `Search the web for “${q}”`, onclick: findOnWeb }, none ? `Search the web for “${q}”` : `Not here? Search for “${q}”`));
  };
  const paintHits = () => {
    if (!e.hits) { hitsBox.replaceChildren(el("li", { class: "hint" }, "Loading…")); return; }
    const canFind = e.q.trim().length >= 2;
    if (!e.hits.length) { hitsBox.replaceChildren(canFind ? findRow(true) : el("li", { class: "hint" }, "Type a food to add.")); return; }
    hitsBox.replaceChildren(...e.hits.map((h) => el("li", {},
      el("span", { class: "fname" }, h.name, h.mine ? el("small", { class: "tag" }, "yours") : null),
      el("div", { class: "chips wrap" }, ...h.servings.map((s) => el("button", { class: "chip", type: "button", onclick: () => {
        // A saved food of theirs has no catalog serving: it goes in with its own numbers.
        e.rows.push(s.custom ? { custom: s.custom, base: s.item, qty: 1 } : { servingId: s.id, base: s.item, qty: 1 });
        e.adding = false;
        e.q = "";
        paintAdd();
        repaint();
        d.toast(`Added ${s.item.text}.`);
      } }, `${s.label} · ${fmt(s.item.kcal)} kcal`))))), canFind ? findRow(false) : null);
  };
  const paintAdd = () => {
    if (!e.adding) {
      addBox.replaceChildren(el("button", { class: "link add-link", type: "button", disabled: e.rows.length >= 12, onclick: () => { e.adding = true; e.hits = null; paintAdd(); search(); } }, "+ Add a food"));
      return;
    }
    const input = el("input", { class: "field", type: "search", placeholder: "Search foods: paneer, curd, apple…", value: e.q, "aria-label": "Search foods", enterkeyhint: "search" });
    input.addEventListener("input", () => { e.q = input.value; clearTimeout(timer); timer = setTimeout(search, 250); });
    addBox.replaceChildren(
      el("div", { class: "row-input" }, input, el("button", { class: "btn small", type: "button", onclick: () => { e.adding = false; e.q = ""; paintAdd(); } }, "Done")),
      el("p", { class: "hint" }, "Only foods that fit your diet and foods to avoid are shown. Not listed? Search the web for it."),
      hitsBox);
    paintHits();
    setTimeout(() => input.focus(), 0);
  };

  async function save(ev, andEat) {
    ev.target.disabled = true;
    try {
      const r = editDirty(e) ? await d.api(`/diet/days/${date}/${slot}/items`, { method: "PUT", body: editBody(e) }) : null;
      if (andEat && !r?.logged) await d.api(`/diet/days/${date}/${slot}/eat`, { method: "POST", body: JSON.stringify(ev.target.dataset.early ? { early: true } : {}) });
      ms.edit = null;
      await loadPlan(true);
      d.toast(r?.logged ? "Logged as what you had instead." : andEat ? "Logged." : "Saved. The plan keeps this meal for that day.");
      if (andEat || r?.logged) d.refresh?.();
      d.openSheet("dietMeal", { fromHistory: true });
      paint();
    } catch (err) {
      d.toast(err.message);
      ev.target.disabled = false;
      if (err.code === "too_early") { ev.target.dataset.early = "1"; ev.target.textContent = "Yes, I've eaten it"; }
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
  wrap.append(...[totalsBox, list, addBox, action].filter(Boolean));
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

/** "Why swap?": each reason means something different; only the first two are remembered. */
function swapReasons(date, slot) {
  const { el } = d;
  const reasons = [
    ["want_different", "Want something different"],
    ["unavailable_today", "Ingredients not there today"],
    ["too_much_effort", "Too much effort"],
    ["dislike_combo", "Don't like this combination"],
    ["dont_cook", "We don't cook this"],
  ];
  const send = async (reason, btn) => {
    btn.disabled = true;
    try {
      const r = await d.api(`/diet/days/${date}/${slot}/feedback`, { method: "POST", body: JSON.stringify({ reason }) });
      ms.edit = null;
      await loadPlan(true);
      d.toast(reason === "dont_cook" ? "Got it. That dish won't be planned again." : reason === "too_much_effort" ? "Got it. Quicker meals first from now on." : reason === "dislike_combo" ? "That combination won't come back. Its foods still can." : "Swapped for today only.");
      d.openSheet("dietMeal", { fromHistory: true });
      paint();
      return r;
    } catch (err) { d.toast(err.message); btn.disabled = false; }
  };
  return el("div", { class: "stack" },
    el("p", { class: "section-label" }, "Or tell me why, and I'll pick"),
    el("div", { class: "chips wrap" }, ...reasons.map(([k, label]) => el("button", { class: "chip", type: "button", onclick: (e) => send(k, e.currentTarget) }, label))));
}

function optionSub(o, budget) {
  const { fmt } = d;
  const prep = o.prep ? (o.prep.totalMinutes ? ` · about ${o.prep.totalMinutes} min${o.prep.activeMinutes && o.prep.activeMinutes < o.prep.totalMinutes ? `, ${o.prep.activeMinutes} hands-on` : ""}` : " · no cooking") : o.prepMinutes ? ` · ${o.prepMinutes} min` : "";
  const needs = o.prep?.needs?.length ? ` · uses ${o.prep.needs.join(", ")}` : "";
  return `${fmt(o.totals.kcal)} kcal · P ${fmt(o.totals.proteinG)} · C ${fmt(o.totals.carbsG)} · F ${fmt(o.totals.fatG)} g${prep}${needs}${ms.view.marks.pinned.includes(o.id) ? " · ★" : ""}`;
}

/** The other options for this meal; every one was built inside the person's restrictions. */
function otherOptions(date, slot, currentId) {
  const { el } = d;
  const all = optionsOf(slot).filter((o) => o.id !== currentId || pickOf(date, slot)?.edited);
  const others = all.filter((o) => !o.novelty);
  const novel = all.filter((o) => o.novelty);
  if (!all.length) return el("div");
  const budget = budgetOf(slot);
  const row = (o) =>
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
          el("span", { class: "sub" }, optionSub(o, budget))));
  return el("div", { class: "stack" },
    el("p", { class: "section-label" }, "Swap for another meal"),
    el("ul", { class: "list option-list" }, ...others.map(row)),
    novel.length ? el("details", { class: "try-new" },
      el("summary", {}, "Try something new"),
      el("p", { class: "hint" }, "Dishes you don't usually cook. Never planned unless you pick one."),
      el("ul", { class: "list option-list" }, ...novel.map(row))) : null,
    date >= todayKey() && !isEaten(pickOf(date, slot) || {}) ? swapReasons(date, slot) : null);
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
    el("button", { class: "menu-row", type: "button", onclick: () => d.openSheet("foodPrefs") }, el("span", {}, el("b", {}, "Diet and foods to avoid"), el("small", {}, "Change them in You, then Food")), el("i", { class: "chev-r" })),
    el("p", { class: "section-label" }, "Your meals"),
    mealsBox,
    el("p", { class: "section-label" }, "Who cooks"),
    seg([["self", "Me"], ["family", "Family"], ["cook", "A cook"], ["canteen", "Canteen / mess"]], () => v.whoCooks, (x) => { v.whoCooks = x; }),
    el("p", { class: "section-label" }, "Kitchen"),
    seg([["full", "Full"], ["basic", "Basic (kettle, microwave)"], ["none", "None"]], () => v.kitchen, (x) => { v.kitchen = x; }),
    el("p", { class: "section-label" }, "Roti or rice"),
    seg([["roti", "Mostly roti"], ["rice", "Mostly rice"], ["both", "Both"]], () => v.staples, (x) => { v.staples = x; }),
    el("p", { class: "section-label" }, "Supplements you're happy to have"),
    el("p", { class: "hint" }, "Magnus adds them to a meal (whey with breakfast unless you pick one), and they count like any food. You can also add one to any meal yourself."),
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

// ---------- the day's one meal list ----------
//
// The same rows on Today, the Meals tab and anywhere else a day's meals show (server: dayMeals.ts).
// A planned meal shows the plan until it's eaten, then what was logged. Anything else logged is an
// Extra under its meal. Tap an eaten row to see its items; tap a planned one to open it.

const STATE_ICON = { eaten: "✓", instead: "⇄", extra: "+", todo: "", missed: "–", skipped: "0" };
const openRows = new Set();

/** Calories with the eating-out "~" for a planned meal whose food isn't known yet. */
const kcalText = (r) => `${r.eatOut && r.state === "todo" ? "~" : ""}${d.fmt(r.totals.kcal)}`;

export function dayMealList(list, { title = null, compact = false } = {}) {
  const { el, fmt } = d;
  if (!list) return null;
  const isToday = list.date === todayKey();
  const future = list.date > todayKey();
  const head = el("div", { class: "dm-head" },
    el("b", {}, title ?? (isToday ? "Meals today" : "Meals")),
    el("span", { class: "dm-tags" },
      list.planned ? el("span", { class: `tag ${list.done === list.planned ? "good" : ""}` }, `${list.done} of ${list.planned} done`) : null,
      list.extras ? el("span", { class: "tag extra" }, `${list.extras} extra`) : null));
  // An earlier day can still be filled in: whatever is added there counts on that day everywhere.
  const addPast = !isToday && !future
    ? el("button", { class: "btn small", type: "button", onclick: () => d.logOwn(null, list.date) }, "Add a meal to this day")
    : null;
  if (!list.rows.length) {
    return el("div", { class: "day-meals" }, head, el("p", { class: "none" }, isToday ? "Nothing logged yet today." : future ? "Nothing planned." : "Nothing logged this day."), addPast);
  }
  const planBySlot = new Map(list.rows.filter((r) => r.state !== "extra").map((r) => [r.slot, r]));
  // Two or more planned meals still open: one tap logs the rest as planned (each keeps its own Remove).
  const openPlanned = list.rows.filter((r) => (r.state === "todo" || r.state === "missed") && !r.eatOut);
  const rest = !future && openPlanned.length >= 2
    ? el("button", { class: "btn small block dm-rest", type: "button", onclick: (ev) => eatRest(ev.currentTarget, list.date) }, isToday ? "Rest of today as planned" : "Rest of this day as planned")
    : null;
  // Today's Food section shows only what still needs an answer (the full list lives on Meals).
  if (compact && isToday) {
    const open = list.rows.filter((r) => r.state === "todo" || r.state === "missed").slice(0, 2);
    const all = el("button", { class: "link small dm-all", type: "button", onclick: () => d.setView("meals") },
      open.length ? `All ${list.rows.length} meals` : "See today's meals");
    return el("div", { class: "day-meals compact" }, head,
      open.length
        ? el("ul", { class: "dm-list" }, ...open.map((r) => dayMealRow(list, r, planBySlot)))
        : el("p", { class: "none" }, list.planned ? "Every planned meal is answered." : "Nothing planned for the rest of today."),
      rest,
      all);
  }
  const rows = list.rows.map((r) => dayMealRow(list, r, planBySlot));
  const foot = !future && list.eaten.kcal
    ? el("div", { class: "dm-foot" },
        el("span", {}, "Eaten"),
        el("span", {}, el("b", {}, `${fmt(list.eaten.kcal)} kcal`), ` · P ${fmt(list.eaten.proteinG)} · C ${fmt(list.eaten.carbsG)} · F ${fmt(list.eaten.fatG)} g`))
    : null;
  return el("div", { class: "day-meals" }, head, el("ul", { class: "dm-list" }, ...rows), rest, foot, addPast);
}

/** "Rest of today as planned": every open planned meal that's due, logged in one tap. */
async function eatRest(btn, date) {
  btn.disabled = true;
  try {
    const r = await d.api(`/diet/days/${date}/eat-rest`, { method: "POST" });
    const n = r.logged?.length || 0;
    const later = r.left?.length ? ` ${r.left.map((s) => SLOT_NAME[s] || s).join(" and ")} is later, so it's still open.` : "";
    await afterChange(n ? `Logged ${n} meal${n === 1 ? "" : "s"} as planned. Remove any from its row if it's wrong.${later}` : `Nothing due yet.${later}`);
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

function dayMealRow(list, r, planBySlot) {
  const { el, fmt } = d;
  const date = list.date;
  const planned = r.state === "todo" || r.state === "missed";
  const label = r.state === "extra" ? null : `${SLOT_NAME[r.slot] || "Meal"}${r.time ? ` · ${clock(r.time)}` : ""}`;
  const note = r.state === "instead" ? `instead of ${r.insteadOf}`
    : r.state === "extra" ? `logged ${loggedClock(r.loggedAt)}`
    : r.state === "missed" ? "Not logged"
    : r.state === "skipped" ? "Skipped, counts as 0 kcal"
    : r.changed ? "portions changed"
    : r.eatOut && planned ? "Eating out: log what you have"
    : null;
  const key = `${date}|${r.key}`;
  const open = openRows.has(key);
  const li = el("li", { class: `dm-row ${r.state}${open ? " open" : ""}` });
  const main = el("button", { class: "dm-main", type: "button", "aria-expanded": planned ? null : String(open) },
    el("span", { class: `dm-dot ${r.state}`, "aria-hidden": "true" }, STATE_ICON[r.state]),
    el("span", { class: "dm-what" },
      label ? el("span", { class: "dm-slot" }, label) : null,
      el("span", { class: "dm-text" }, r.text, r.state === "extra" ? el("span", { class: "tag extra" }, "Extra") : null),
      note ? el("span", { class: "dm-note" }, note) : null),
    el("span", { class: "dm-kcal" }, kcalText(r), el("small", {}, planned ? " planned" : " kcal"),
      // A planned meal opens its editor on tap (portions, swap, log your own): the chevron says so.
      planned ? el("i", { class: "chev-r", "aria-hidden": "true" }) : null));
  const body = el("div", { class: "dm-body" });
  const fill = () => body.replaceChildren(...(openRows.has(key) ? detail(list, r, planBySlot) : []));
  main.addEventListener("click", () => {
    if (planned) return openPlannedMeal(date, r.slot);
    openRows.has(key) ? openRows.delete(key) : openRows.add(key);
    li.classList.toggle("open", openRows.has(key));
    main.setAttribute("aria-expanded", String(openRows.has(key)));
    fill();
  });
  fill();
  li.append(main);
  // A planned meal of today or a past day: one tap logs it as planned. Editing or swapping is a tap
  // on the row itself, so each row carries two answers, not three buttons.
  if (planned && date <= todayKey()) {
    li.append(el("div", { class: "dm-acts" },
      r.eatOut
        ? el("button", { class: "btn small", type: "button", onclick: () => d.logOwn(r.slot, date) }, "Log what I had")
        : el("button", { class: "btn small primary", type: "button", onclick: (ev) => ateThis(ev.currentTarget, date, r.slot) }, "Ate this"),
      // Only a skip counts as eating nothing; a meal left blank stays "not logged".
      el("button", { class: "link", type: "button", onclick: (ev) => skipMeal(ev.currentTarget, date, r.slot) }, "Skipped it")));
  }
  li.append(body);
  return li;
}

function loggedClock(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function detail(list, r, planBySlot) {
  const { el, fmt } = d;
  const chips = el("div", { class: "chips-row" },
    ...[["proteinG", "Protein", "p"], ["carbsG", "Carbs", "c"], ["fatG", "Fat", "f"]].map(([k, label, cls]) =>
      el("span", { class: "mchip" }, el("i", { class: `sw ${cls}` }), `${label} `, el("b", {}, `${fmt(r.totals[k], 1)} g`))));
  const items = r.items?.length > 1
    ? el("ul", { class: "items-list" }, ...r.items.map((i) =>
        el("li", {}, el("span", { class: "iname" }, i.name), el("span", { class: "ikcal" }, fmt(i.kcal)),
          el("span", { class: "imac" }, `P ${fmt(i.proteinG)} · C ${fmt(i.carbsG)} · F ${fmt(i.fatG)}`))))
    : null;
  const acts = [];
  if (r.state === "instead") {
    acts.push(el("button", { class: "link", type: "button", onclick: (ev) => setRole(ev.currentTarget, r, "extra") }, "It was extra"));
  }
  if (r.state === "extra" && planBySlot.get(r.slot)?.state === "todo" && !planBySlot.get(r.slot)?.eatOut) {
    acts.push(el("button", { class: "link", type: "button", onclick: (ev) => setRole(ev.currentTarget, r, "instead") }, `Count it as my ${SLOT_NAME[r.slot].toLowerCase()}`));
  }
  if (r.state === "skipped") {
    acts.push(el("button", { class: "link", type: "button", onclick: (ev) => undoSkip(ev.currentTarget, list.date, r.slot) }, "Undo skip"));
  }
  if (r.mealSessionId) acts.push(el("button", { class: "link danger", type: "button", onclick: (ev) => removeLogged(ev.currentTarget, r) }, "Remove"));
  return [chips, items, acts.length ? el("div", { class: "row-actions" }, ...acts) : null].filter(Boolean);
}

async function afterChange(msg) {
  if (msg) d.toast(msg);
  await loadPlan(true).catch(() => {});
  d.refresh();
}

async function ateThis(btn, date, slot) {
  btn.disabled = true;
  try {
    await d.api(`/diet/days/${date}/${slot}/eat`, { method: "POST", body: JSON.stringify(btn.dataset.early ? { early: true } : {}) });
    await afterChange("Logged as planned.");
  } catch (err) {
    btn.disabled = false;
    if (err.code === "already_logged") return afterChange();
    // More than an hour before the meal: ask once, the next tap logs it.
    if (err.code === "too_early") { btn.dataset.early = "1"; btn.textContent = "Yes, I've eaten it"; }
    d.toast(err.message);
  }
}

async function skipMeal(btn, date, slot) {
  btn.disabled = true;
  try {
    await d.api(`/diet/days/${date}/${slot}/skip`, { method: "POST" });
    await afterChange(`${SLOT_NAME[slot] || "Meal"} marked as skipped.`);
  } catch (err) {
    btn.disabled = false;
    if (err.code === "already_logged") return afterChange();
    d.toast(err.message);
  }
}

async function undoSkip(btn, date, slot) {
  btn.disabled = true;
  try {
    await d.api(`/diet/days/${date}/${slot}/undo`, { method: "POST" });
    await afterChange(`${SLOT_NAME[slot] || "Meal"} is back on your plan.`);
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

async function setRole(btn, r, role) {
  btn.disabled = true;
  try {
    await d.api(`/meals/${encodeURIComponent(r.mealSessionId)}/plan`, { method: "POST", body: JSON.stringify({ role }) });
    await afterChange(role === "extra" ? `Moved to extras. ${SLOT_NAME[r.slot] || "The meal"} is back on your plan.` : `Counted as your ${SLOT_NAME[r.slot]?.toLowerCase() || "meal"}.`);
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

async function removeLogged(btn, r) {
  btn.disabled = true;
  try {
    await d.api(`/meals/${encodeURIComponent(r.mealSessionId)}`, { method: "DELETE" });
    await afterChange("Meal removed.");
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

/** The Meals tab's own list for a day (the plan view carries one per planned day). */
export function listFor(date) {
  return (ms.view?.lists || []).find((x) => x.date === date) || null;
}

export const mealsTitles = { dietSetup: "Your meals", dietMeal: "", planGaps: "Plan vs your targets" };
