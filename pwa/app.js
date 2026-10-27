// Magnus health app. Coach chat is home; the tracker is the second page. Both write through
// the same /api/health endpoints, so anything logged in one shows up in the other.

const TOKEN_KEY = "magnus-health-token";
const CONFIRMED_KEY = "magnus-confirmed-drafts";
const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
  },
};

const state = { snapshot: null, sending: false };

// ---------- API ----------

async function api(path, options = {}) {
  const res = await fetch(`/api/health${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${store.get(TOKEN_KEY, "")}` },
  });
  if (res.status === 401) {
    store.set(TOKEN_KEY, null);
    showConnect();
    throw new Error("This device was disconnected. Paste your token again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(body.error));
  return body;
}

function friendlyError(code) {
  return {
    future_date: "That date is in the future.",
    invalid_body: "Some values look off. Check and try again.",
    deadline_must_be_after_start: "The deadline needs to be after today.",
    no_items: "Add at least one item.",
  }[code] || "Something went wrong. Try again.";
}

// ---------- helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

const fmt = (n, dp = 0) => (n == null || Number.isNaN(n) ? "–" : Number(n).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: 0 }));
const dateOf = (d) => new Date(`${d}T12:00:00Z`);
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const WD_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOTS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snack", "Snack"]];

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

// ---------- navigation ----------

function showConnect() {
  $("connect").hidden = false;
  $("shell").hidden = true;
}

function showShell() {
  $("connect").hidden = true;
  $("shell").hidden = false;
}

function setView(view) {
  $("view-coach").hidden = view !== "coach";
  $("view-tracker").hidden = view !== "tracker";
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.view === view);
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  if (view === "tracker") window.scrollTo(0, 0);
}

// ---------- snapshot ----------

async function refresh() {
  try {
    state.snapshot = await api("/today");
    renderSnapshot(state.snapshot);
  } catch (err) {
    toast(err.message);
  }
}

function renderSnapshot(s) {
  const label = dateOf(s.today.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  $("coach-date").textContent = label;
  $("tracker-date").textContent = label;

  const ns = s.northStar;
  $("pill-days").textContent = String(ns.onTrackDays);
  $("pill-ring").style.strokeDashoffset = String(94.25 * (1 - ns.onTrackDays / 7));

  renderWeekRing(ns);
  $("ns-num").textContent = String(ns.onTrackDays);
  $("ns-of").textContent = `of ${ns.windowDays} days`;
  const gap = ns.goal - ns.onTrackDays;
  $("ns-line").textContent =
    gap <= 0 ? `At or above your goal of ${ns.goal}. Keep the streak honest.` :
    ns.mostMissed ? `${gap} short of ${ns.goal}. ${ns.mostMissed.label} slipped on ${ns.mostMissed.missedDays} day${ns.mostMissed.missedDays === 1 ? "" : "s"}.` :
    `${gap} short of ${ns.goal}. Close out today to move it.`;
  $("week-labels").replaceChildren(
    ...ns.days.map((d, i) => el("span", { class: [d.onTrack && "on", i === ns.days.length - 1 && "today"].filter(Boolean).join(" ") }, WD[dateOf(d.date).getUTCDay()])),
  );

  renderGoal(s);

  $("today-score").textContent = s.today.onTrack ? "On track" : `${s.today.score}%`;
  $("checks").replaceChildren(
    ...s.today.checks.map((c) =>
      el("li", { class: c.met ? "met" : "" },
        el("span", { class: "dot" }),
        el("span", {}, c.label),
        el("span", { class: "detail" }, c.detail),
        el("div", { class: "bar" }, el("i", { style: `width:${Math.round(c.progress * 100)}%` })),
      ),
    ),
  );

  const meals = s.meals || [];
  $("meals-meta").textContent = `${fmt(s.today.calories)} kcal · ${fmt(s.today.proteinG)} g protein`;
  $("meals").replaceChildren(
    ...(meals.length
      ? meals.map((m) =>
          el("li", {},
            el("div", { class: "main" },
              el("div", { class: "title" }, m.text),
              el("div", { class: "sub" }, `${cap(m.slot)} · ${new Date(m.loggedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`),
            ),
            el("div", { class: "right" },
              el("span", {}, `${fmt(m.calories)} kcal`),
              el("button", { class: "del", type: "button", "aria-label": `Remove ${m.text}`, onclick: () => deleteMeal(m) }, "×"),
            ),
          ),
        )
      : [el("li", { class: "none" }, "Nothing logged yet today.")]),
  );

  $("workouts").replaceChildren(
    ...(!s.hevyConnected
      ? [el("li", { class: "none" }, "Hevy isn't connected for this account.")]
      : s.workouts.length
        ? s.workouts.slice(0, 5).map((w) =>
            el("li", {},
              el("div", { class: "main" },
                el("div", { class: "title" }, w.title),
                el("div", { class: "sub" }, `${WD_LONG[dateOf(w.localDate).getUTCDay()]} ${dateOf(w.localDate).getUTCDate()}`),
              ),
              el("div", { class: "right meta" }, [w.durationMin != null ? `${w.durationMin} min` : null, `${w.exerciseCount} exercises`].filter(Boolean).join(" · ")),
            ),
          )
        : [el("li", { class: "none" }, "No recent workouts.")]),
  );

  renderChips(s);
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");

function renderWeekRing(ns) {
  const ring = $("week-ring");
  ring.replaceChildren();
  const n = 7, r = 86, cx = 100, cy = 100, gapDeg = 7;
  const seg = 360 / n;
  const days = ns.days.slice(-n);
  for (let i = 0; i < n; i++) {
    const a0 = -90 + i * seg + gapDeg / 2, a1 = -90 + (i + 1) * seg - gapDeg / 2;
    const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    const d = days[i];
    const isToday = i === days.length - 1;
    ring.append(svg("path", {
      d: `M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`,
      fill: "none",
      "stroke-width": "10",
      "stroke-linecap": "round",
      stroke: d && d.onTrack ? "var(--accent)" : "var(--hair-strong)",
      opacity: d ? (d.onTrack || isToday ? "1" : "0.6") : "0.3",
    }));
  }
}

const PACE_LABEL = { ahead: "Ahead", on_pace: "On pace", behind: "Behind", reached: "Reached", not_enough_data: "Need more weigh-ins" };

function renderGoal(s) {
  const g = s.goal;
  $("checkin-due").hidden = !(g ? g.checkinDue : s.checkins.length === 0);
  if (!g) {
    $("goal-meta").textContent = "";
    $("goal-body").replaceChildren(
      el("p", { class: "empty-goal" }, "Set a target weight, body fat or muscle mass and a deadline. Daily consistency is scored against it."),
      el("button", { class: "btn primary block", type: "button", onclick: () => openSheet("settings") }, "Set your goal"),
    );
    return;
  }
  const deadline = dateOf(g.goal.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  $("goal-meta").textContent = `${fmt(g.weeksLeft, 1)} weeks left · ${deadline}`;
  $("goal-body").replaceChildren(
    ...g.metrics.map((m) => {
      const signed = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${fmt(v, 2)}`);
      const series = s.checkins.filter((c) => c[m.metric] != null).map((c) => ({ d: c.localDate, v: c[m.metric] }));
      return el("div", { class: "metric" },
        el("div", { class: "metric-top" },
          el("div", {},
            el("div", { class: "metric-name" }, m.label),
            el("div", { class: "metric-val" }, m.latest == null ? "–" : fmt(m.latest, 1), el("small", {}, ` ${m.unit}`)),
          ),
          el("div", { class: "metric-target" }, `Target ${fmt(m.target, 1)} ${m.unit}`, el("br"), el("span", { class: `tag ${m.pace}` }, PACE_LABEL[m.pace])),
        ),
        el("div", { class: "bar" }, el("i", { style: `width:${Math.round((m.progress ?? 0) * 100)}%` })),
        el("div", { class: "pace" },
          el("span", {}, `Needed ${signed(m.requiredPerWeek)} ${m.unit}/wk`),
          el("span", {}, `Trend ${signed(m.actualPerWeek)} ${m.unit}/wk`),
          m.projectedDate ? el("span", {}, `Lands ${dateOf(m.projectedDate).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`) : null,
        ),
        series.length >= 2 ? sparkline(series, m.target) : null,
      );
    }),
  );
}

function sparkline(series, target) {
  const W = 300, H = 56, pad = 4;
  const vals = series.map((p) => p.v).concat(target);
  const min = Math.min(...vals), max = Math.max(...vals);
  const t0 = dateOf(series[0].d).getTime(), t1 = dateOf(series.at(-1).d).getTime() || t0 + 1;
  const x = (d) => pad + ((dateOf(d).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 2 * pad);
  const y = (v) => pad + (1 - (v - min) / Math.max(0.0001, max - min)) * (H - 2 * pad);
  const line = series.map((p, i) => `${i ? "L" : "M"} ${x(p.d).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const s = svg("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  s.append(
    svg("path", { class: "area", d: `${line} L ${x(series.at(-1).d)} ${H} L ${x(series[0].d)} ${H} Z` }),
    svg("line", { class: "target", x1: "0", x2: String(W), y1: String(y(target)), y2: String(y(target)) }),
    svg("path", { class: "line", d: line }),
  );
  return s;
}

async function deleteMeal(m) {
  try {
    await api(`/meals/${encodeURIComponent(m.mealSessionId)}`, { method: "DELETE" });
    toast("Meal removed.");
    refresh();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- coach ----------

function renderChips(s) {
  const h = new Date().getHours();
  const meal = h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner";
  const chips = [
    [`Log ${meal}`, `I had `],
    s?.goal?.checkinDue || (s && !s.goal && !s.checkins.length) ? ["Weekly weigh-in", "Weigh-in: "] : null,
    ["Steps today", "Steps today: "],
    ["How am I doing?", "How am I doing this week?"],
    !s?.goal ? ["Set my goal", "I want to reach "] : ["Why am I off track?", "Why am I off track this week, and what should I change?"],
  ].filter(Boolean);
  $("chips").replaceChildren(
    ...chips.map(([label, text]) =>
      el("button", { class: "chip", type: "button", onclick: () => {
        const input = $("input");
        input.value = text;
        input.focus();
        autosize();
        if (text.endsWith("?")) $("composer").requestSubmit();
      } }, label),
    ),
  );
}

function scrollThread() {
  const t = $("thread");
  requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; });
}

function addMessage(role, text) {
  const node = el("div", { class: `msg ${role}` }, text);
  $("thread").append(node);
  scrollThread();
  return node;
}

function renderEmpty() {
  $("thread").replaceChildren(
    el("div", { class: "empty" },
      el("p", { class: "eyebrow" }, "Coach"),
      el("h2", { class: "display" }, "What did you eat, walk or lift today?"),
      el("p", {}, "Tell me in plain words. I'll log it, keep your week on track, and tell you what's slipping."),
    ),
  );
}

async function loadHistory() {
  try {
    const { messages } = await api("/chat");
    if (!messages.length) return renderEmpty();
    $("thread").replaceChildren();
    for (const m of messages) {
      addMessage(m.role === "user" ? "user" : "coach", m.content);
      for (const c of m.cards || []) if (c.type === "meal_draft") $("thread").append(mealDraftCard(c.draft));
    }
    scrollThread();
  } catch (err) {
    renderEmpty();
  }
}

async function send(text) {
  if (state.sending || !text.trim()) return;
  state.sending = true;
  $("send").disabled = true;
  if ($("thread").querySelector(".empty")) $("thread").replaceChildren();
  addMessage("user", text);
  const typing = el("div", { class: "msg coach typing" }, el("i"), el("i"), el("i"));
  $("thread").append(typing);
  scrollThread();
  try {
    const reply = await api("/chat", { method: "POST", body: JSON.stringify({ text }) });
    typing.remove();
    addMessage("coach", reply.text);
    for (const c of reply.cards) if (c.type === "meal_draft") $("thread").append(mealDraftCard(c.draft));
    scrollThread();
    if (reply.changed) refresh();
  } catch (err) {
    typing.remove();
    addMessage("coach err", err.message);
  } finally {
    state.sending = false;
    $("send").disabled = false;
  }
}

function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${Math.min(140, t.scrollHeight)}px`;
}

// ---------- meal draft card ----------

function confirmedDrafts() { return store.get(CONFIRMED_KEY, {}); }
function markDraft(id, status) {
  const all = confirmedDrafts();
  all[id] = status;
  const keys = Object.keys(all);
  if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete all[k];
  store.set(CONFIRMED_KEY, all);
}

/** Editable estimate. Saves exactly what's on the card; re-confirming the same card never double-logs. */
function mealDraftCard(draft, { onDone } = {}) {
  const status = confirmedDrafts()[draft.draftId];
  const card = el("div", { class: "draft" });
  if (status) return finishedCard(card, draft, status);

  const original = JSON.stringify(draft.items);
  const items = draft.items.length ? draft.items.map((i) => ({ ...i })) : [{ name: draft.text, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }];
  let slot = SLOTS.some(([k]) => k === draft.slot) ? draft.slot : "snack";

  const kcal = el("div", { class: "draft-kcal" });
  const macros = el("div", { class: "macros" });
  const list = el("ul", { class: "items" });
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "Meal" });
  const confirm = el("button", { class: "btn primary", type: "button" }, "Confirm & log");

  function totals() {
    const t = items.reduce((a, i) => ({ c: a.c + (+i.calories || 0), p: a.p + (+i.protein_g || 0), cb: a.cb + (+i.carbs_g || 0), f: a.f + (+i.fat_g || 0) }), { c: 0, p: 0, cb: 0, f: 0 });
    kcal.replaceChildren(fmt(t.c), el("small", {}, "kcal"));
    macros.replaceChildren(
      el("span", {}, el("b", {}, fmt(t.p, 1)), " g protein"),
      el("span", {}, el("b", {}, fmt(t.cb, 1)), " g carbs"),
      el("span", {}, el("b", {}, fmt(t.f, 1)), " g fat"),
    );
    confirm.disabled = !items.length || items.some((i) => !i.name.trim()) || t.c <= 0;
  }

  function renderItems() {
    list.replaceChildren(
      el("li", { class: "item-head" }, el("span", {}, "Item"), el("span", {}, "kcal"), el("span", {}, "prot g"), el("span")),
      ...items.map((item, idx) =>
        el("li", { class: "item" },
          el("input", { value: item.name, "aria-label": "Item name", oninput: (e) => { item.name = e.target.value; totals(); } }),
          el("input", { class: "num", inputmode: "decimal", value: String(item.calories), "aria-label": "Calories", oninput: (e) => { item.calories = Math.max(0, parseFloat(e.target.value) || 0); totals(); } }),
          el("input", { class: "num", inputmode: "decimal", value: String(item.protein_g), "aria-label": "Protein grams", oninput: (e) => { item.protein_g = Math.max(0, parseFloat(e.target.value) || 0); totals(); } }),
          el("button", { class: "x", type: "button", "aria-label": "Remove item", onclick: () => { items.splice(idx, 1); renderItems(); totals(); } }, "×"),
        ),
      ),
    );
  }

  function renderSeg() {
    seg.replaceChildren(...SLOTS.map(([k, label]) =>
      el("button", { type: "button", class: k === slot ? "on" : "", role: "radio", "aria-checked": String(k === slot), onclick: () => { slot = k; renderSeg(); } }, label)));
  }

  confirm.addEventListener("click", async () => {
    confirm.disabled = true;
    confirm.textContent = "Logging…";
    try {
      const body = {
        draftId: draft.draftId,
        text: draft.text,
        slot,
        source: draft.source,
        items: items.map((i) => ({ name: i.name.trim(), calories: +i.calories || 0, protein_g: +i.protein_g || 0, carbs_g: +i.carbs_g || 0, fat_g: +i.fat_g || 0 })),
        edited: JSON.stringify(items) !== original || slot !== draft.slot,
      };
      const r = await api("/meals/confirm", { method: "POST", body: JSON.stringify(body) });
      const done = { state: "logged", calories: r.totals.calories };
      markDraft(draft.draftId, done);
      finishedCard(card, draft, done);
      toast(r.alreadySaved ? "Already logged." : `Logged ${fmt(r.totals.calories)} kcal.`);
      refresh();
      onDone?.();
    } catch (err) {
      confirm.disabled = false;
      confirm.textContent = "Confirm & log";
      toast(err.message);
    }
  });

  const discard = el("button", { class: "btn", type: "button", onclick: () => { markDraft(draft.draftId, { state: "discarded" }); finishedCard(card, draft, { state: "discarded" }); onDone?.(); } }, "Discard");

  card.append(...[
    el("p", { class: "eyebrow" }, "Meal estimate · check and confirm"),
    kcal, macros,
    !draft.estimated ? el("p", { class: "draft-note" }, "No estimate found. Enter calories and protein yourself.") : null,
    draft.servingAssumption ? el("p", { class: "draft-note" }, draft.servingAssumption) : null,
    seg, list,
    el("button", { class: "add-line", type: "button", onclick: () => { items.push({ name: "", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }); renderItems(); totals(); list.querySelector("li:last-child input")?.focus(); } }, "+ Add item"),
    el("div", { class: "draft-actions" }, discard, confirm),
  ].filter(Boolean));
  renderSeg();
  renderItems();
  totals();
  return card;
}

function finishedCard(card, draft, status) {
  card.className = "draft done";
  card.replaceChildren(
    status.state === "logged"
      ? el("div", { class: "done-line" }, "✓ ", `Logged · ${draft.text} · ${fmt(status.calories)} kcal`)
      : el("div", { class: "muted" }, `Discarded · ${draft.text}`),
  );
  return card;
}

// ---------- sheets ----------

function closeSheet() {
  $("sheet").hidden = true;
  $("scrim").hidden = true;
}

function openSheet(kind) {
  const body = $("sheet-body");
  const titles = { meal: "Log a meal", steps: "Steps & walks", checkin: "Weigh-in", settings: "Goal & targets", quick: "Quick add" };
  $("sheet-title").textContent = titles[kind];
  body.replaceChildren(SHEETS[kind]());
  $("sheet").hidden = false;
  $("scrim").hidden = false;
  body.querySelector("input, textarea")?.focus();
}

function submitter(fn) {
  return async (e) => {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector("button[type=submit]");
    if (btn) btn.disabled = true;
    try { await fn(new FormData(e.target)); } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
  };
}

const num = (v) => (v === "" || v == null ? undefined : Number(v));

const SHEETS = {
  quick() {
    return el("div", { class: "quick-row" },
      ...[["meal", "Meal"], ["steps", "Steps"], ["checkin", "Weigh-in"]].map(([k, l]) =>
        el("button", { class: "quick", type: "button", onclick: () => openSheet(k) }, el("span", {}, l))));
  },

  meal() {
    const holder = el("div");
    const form = el("form", { class: "stack", onsubmit: submitter(async (fd) => {
      const draft = await api("/meals/draft", { method: "POST", body: JSON.stringify({ text: fd.get("text") }) });
      form.hidden = true;
      holder.replaceChildren(mealDraftCard(draft, { onDone: () => setTimeout(closeSheet, 700) }));
    }) },
      el("textarea", { class: "field", name: "text", rows: "3", required: true, placeholder: "e.g. 2 rotis, a bowl of dal, 100 g paneer bhurji", minlength: "2" }),
      el("button", { class: "btn primary block", type: "submit" }, "Estimate"),
      el("p", { class: "hint" }, "You'll see the estimate and can fix any line before it's logged."),
    );
    return el("div", {}, form, holder);
  },

  steps() {
    const today = state.snapshot?.today;
    return el("form", { class: "stack", onsubmit: submitter(async (fd) => {
      await api("/steps", { method: "POST", body: JSON.stringify({ steps: num(fd.get("steps")), walkMinutes: num(fd.get("walk")), source: "manual" }) });
      toast("Steps saved.");
      closeSheet();
      refresh();
    }) },
      el("div", { class: "grid2" },
        el("label", {}, "Steps today", el("input", { class: "field", name: "steps", type: "number", inputmode: "numeric", min: "0", required: true, value: today?.steps ? String(today.steps) : null })),
        el("label", {}, "Walk minutes", el("input", { class: "field", name: "walk", type: "number", inputmode: "numeric", min: "0", value: today?.walkMinutes != null ? String(today.walkMinutes) : null })),
      ),
      el("p", { class: "hint" }, "Enter the day's total. Steps also sync automatically once the phone automation is set up."),
      el("button", { class: "btn primary block", type: "submit" }, "Save"),
    );
  },

  checkin() {
    const last = state.snapshot?.checkins?.at(-1);
    return el("form", { class: "stack", onsubmit: submitter(async (fd) => {
      await api("/checkins", { method: "POST", body: JSON.stringify({ weightKg: num(fd.get("w")), bodyFatPct: num(fd.get("bf")), muscleMassKg: num(fd.get("mm")) }) });
      toast("Weigh-in saved.");
      closeSheet();
      refresh();
    }) },
      el("div", { class: "grid3" },
        el("label", {}, "Weight kg", el("input", { class: "field", name: "w", type: "number", step: "0.1", inputmode: "decimal", placeholder: last?.weight_kg ?? "" })),
        el("label", {}, "Body fat %", el("input", { class: "field", name: "bf", type: "number", step: "0.1", inputmode: "decimal", placeholder: last?.body_fat_pct ?? "" })),
        el("label", {}, "Muscle kg", el("input", { class: "field", name: "mm", type: "number", step: "0.1", inputmode: "decimal", placeholder: last?.muscle_mass_kg ?? "" })),
      ),
      el("p", { class: "hint" }, "Same scale, same time of day (morning, before eating) keeps the trend honest."),
      el("button", { class: "btn primary block", type: "submit" }, "Save weigh-in"),
    );
  },

  settings() {
    const s = state.snapshot;
    const g = s?.goal?.goal;
    const t = s?.targets || {};
    const days = new Set(t.trainingDays || []);
    const dayButtons = el("div", { class: "days" },
      ...WD.map((d, i) => {
        const b = el("button", { type: "button", class: days.has(i) ? "on" : "", "aria-pressed": String(days.has(i)), "aria-label": WD_LONG[i] }, d);
        b.addEventListener("click", () => { days.has(i) ? days.delete(i) : days.add(i); b.classList.toggle("on"); b.setAttribute("aria-pressed", String(days.has(i))); });
        return b;
      }));
    return el("div", {},
      el("form", { class: "stack", onsubmit: submitter(async (fd) => {
        await api("/goal", { method: "POST", body: JSON.stringify({ targetWeightKg: num(fd.get("tw")), targetBodyFatPct: num(fd.get("tbf")), targetMuscleMassKg: num(fd.get("tmm")), deadline: fd.get("deadline") }) });
        toast("Goal saved.");
        refresh();
      }) },
        el("p", { class: "section-label" }, "Outcome goal"),
        el("div", { class: "grid3" },
          el("label", {}, "Weight kg", el("input", { class: "field", name: "tw", type: "number", step: "0.1", inputmode: "decimal", value: g?.targets.weight_kg ?? null })),
          el("label", {}, "Body fat %", el("input", { class: "field", name: "tbf", type: "number", step: "0.1", inputmode: "decimal", value: g?.targets.body_fat_pct ?? null })),
          el("label", {}, "Muscle kg", el("input", { class: "field", name: "tmm", type: "number", step: "0.1", inputmode: "decimal", value: g?.targets.muscle_mass_kg ?? null })),
        ),
        el("label", {}, "Deadline", el("input", { class: "field", name: "deadline", type: "date", required: true, value: g?.deadline ?? null })),
        el("button", { class: "btn primary block", type: "submit" }, "Save goal"),
      ),
      el("form", { class: "stack", onsubmit: submitter(async (fd) => {
        await api("/targets", { method: "POST", body: JSON.stringify({ calorieTarget: num(fd.get("kcal")), proteinTarget: num(fd.get("prot")), stepTarget: num(fd.get("steps")), trainingDays: [...days] }) });
        toast("Targets saved.");
        refresh();
      }) },
        el("p", { class: "section-label" }, "Daily targets"),
        el("div", { class: "grid3" },
          el("label", {}, "Calories", el("input", { class: "field", name: "kcal", type: "number", inputmode: "numeric", value: t.calorieTarget ?? null })),
          el("label", {}, "Protein g", el("input", { class: "field", name: "prot", type: "number", inputmode: "numeric", value: t.proteinTarget ?? null })),
          el("label", {}, "Steps", el("input", { class: "field", name: "steps", type: "number", inputmode: "numeric", value: t.stepTarget ?? null })),
        ),
        el("label", {}, "Training days", dayButtons),
        el("button", { class: "btn block", type: "submit" }, "Save targets"),
      ),
      el("p", { class: "section-label" }, "Device"),
      el("button", { class: "link", type: "button", onclick: () => { store.set(TOKEN_KEY, null); closeSheet(); showConnect(); } }, "Disconnect this device"),
    );
  },
};

// ---------- wiring ----------

$("connect-form").addEventListener("submit", (e) => {
  e.preventDefault();
  store.set(TOKEN_KEY, $("token").value.trim());
  $("token").value = "";
  start();
});

for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => setView(t.dataset.view));
$("coach-stat").addEventListener("click", () => setView("tracker"));
$("settings-btn").addEventListener("click", () => openSheet("settings"));
$("quick").addEventListener("click", () => openSheet("quick"));
$("sheet-close").addEventListener("click", closeSheet);
$("scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sheet]");
  if (b) openSheet(b.dataset.sheet);
});

$("input").addEventListener("input", autosize);
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("input").value;
  $("input").value = "";
  autosize();
  send(text);
});

document.addEventListener("visibilitychange", () => { if (!document.hidden && store.get(TOKEN_KEY, "")) refresh(); });

function start() {
  showShell();
  $("greeting").textContent = greeting();
  setView(location.hash === "#tracker" ? "tracker" : "coach");
  renderChips(null);
  loadHistory();
  refresh();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});
}

if (store.get(TOKEN_KEY, "")) start();
else showConnect();
