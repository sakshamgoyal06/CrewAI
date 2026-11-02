// Magnus health app. Coach chat is home; the tracker is the second page. Both write through
// the same /api/health endpoints, so anything logged in one shows up in the other.

import { SESSION_ID, trackApi } from "./telemetry.js";
import { runOnboarding } from "./onboarding.js";
import { bearer, captureRedirect, signedIn, signInWithGoogle, signOut, useToken, authConfig } from "./session.js";

const TIMEZONE = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
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

const state = {
  snapshot: null, sending: false, historySig: null, trainingLoaded: false,
  history: null, selectedDate: null, open: new Set(), trend: { metric: "calories", range: 30 },
};
// Last good responses, so a cold open paints instantly and the network only fills in changes.
const CHAT_CACHE_KEY = "magnus-chat-cache";
const SNAPSHOT_CACHE_KEY = "magnus-snapshot-cache";
const HISTORY_CACHE_KEY = "magnus-history-cache";
const USUAL_CACHE_KEY = "magnus-usual-meals";
const ONBOARDED_KEY = "magnus-onboarded";

// ---------- API ----------

// Logs that are safe to replay (each is an upsert or idempotent) wait here when the phone is offline.
const QUEUE_KEY = "magnus-offline-queue";
const QUEUEABLE = [/^\/steps$/, /^\/checkins$/, /^\/meals\/confirm$/, /^\/workout-check$/];

async function request(path, options, force = false) {
  const token = await bearer({ force });
  return fetch(`/api/health${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-magnus-session": SESSION_ID, "x-magnus-timezone": TIMEZONE },
  });
}

function clearLocalData() {
  for (const k of [USUAL_CACHE_KEY, CHAT_CACHE_KEY, SNAPSHOT_CACHE_KEY, HISTORY_CACHE_KEY, QUEUE_KEY, ONBOARDED_KEY]) store.set(k, null);
}

function endSession(message) {
  signOut();
  clearLocalData();
  showConnect(message);
}

async function api(path, options = {}) {
  let res;
  const started = performance.now();
  try {
    res = await request(path, options);
    // A Google session can expire between the check and the request: refresh once and retry.
    if (res.status === 401) res = await request(path, options, true);
  } catch (err) {
    trackApi(path, options.method, 0, performance.now() - started, options.replay ? "network (replay)" : "network");
    if (options.method === "POST" && QUEUEABLE.some((re) => re.test(path)) && !options.replay) {
      const q = store.get(QUEUE_KEY, []);
      q.push({ path, body: options.body, at: Date.now() });
      store.set(QUEUE_KEY, q.slice(-50));
      toast("Offline. Saved on this phone; it syncs when you're back online.");
      return { ok: true, queued: true, totals: { calories: 0 } };
    }
    throw new Error("You're offline.");
  }
  if (res.status === 401) {
    endSession("You were signed out. Sign in again to continue.");
    throw new Error("Signed out.");
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body.error === "signup_closed") {
      endSession("Magnus is invite-only right now. Ask Saksham for an invite.");
      throw new Error("Invite only.");
    }
  }
  const body = await res.json().catch(() => ({}));
  trackApi(path, options.method, res.status, performance.now() - started, res.ok ? null : body.error || `http_${res.status}`);
  if (!res.ok) throw new Error(friendlyError(body.error));
  return body;
}

function friendlyError(code) {
  return {
    future_date: "That date is in the future.",
    invalid_body: "Some values look off. Check and try again.",
    deadline_must_be_after_start: "The deadline needs to be after today.",
    no_items: "Add at least one item.",
    hevy_not_connected: "Hevy isn't connected for this account.",
    hevy_unavailable: "Couldn't reach Hevy. Try again in a minute.",
    routine_changed_in_hevy: "That routine changed in Hevy since. Ask the coach for a fresh suggestion.",
    routine_not_found: "That routine no longer exists in Hevy.",
    proposal_discarded: "That suggestion was discarded.",
    proposal_in_progress: "Already sending that to Hevy.",
    push_not_configured: "Push isn't set up on the server yet (VAPID keys).",
    no_devices: "This device isn't subscribed yet.",
    not_enough_data: "Not enough logged days yet to find a pattern.",
    meal_not_found: "That meal isn't in your usual list any more.",
    not_food: "I don't see a meal in that photo. Try a clearer shot of the plate, or type what you ate.",
    unreadable: "I couldn't read that photo. Try again, or type what you ate.",
    owner_account: "The owner account can't be deleted from the app.",
    daily_limit: "You've hit today's limit for the coach. Log from the tracker, or try again tomorrow.",
    hevy_key_invalid: "Hevy didn't accept that key. Copy it again from hevy.com → Settings → Developer.",
  }[code] || "Something went wrong. Try again.";
}

async function flushQueue() {
  const q = store.get(QUEUE_KEY, []);
  if (!q.length || !navigator.onLine) return;
  const left = [];
  for (const item of q) {
    try {
      await api(item.path, { method: "POST", body: item.body, replay: true });
    } catch (err) {
      // A rejected log (bad data, expired) is dropped; a network failure keeps it for later.
      if (err.message === "You're offline.") left.push(item);
    }
  }
  store.set(QUEUE_KEY, left);
  if (left.length < q.length) {
    toast(`Synced ${q.length - left.length} saved log${q.length - left.length === 1 ? "" : "s"}.`);
    refresh();
  }
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

function showConnect(message) {
  $("connect").hidden = false;
  $("shell").hidden = true;
  $("connect-error").hidden = !message;
  $("connect-error").textContent = message || "";
  authConfig().then((cfg) => {
    $("google-signin").hidden = !cfg?.google;
    $("token-details").open = !cfg?.google;
  });
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
  if (view === "tracker") {
    window.scrollTo(0, 0);
    // Hevy history is several slow calls; only fetch it once the tracker is actually opened.
    if (!state.trainingLoaded) { state.trainingLoaded = true; loadTraining(); loadDays(); loadReview(); }
    else if (state.history) requestAnimationFrame(renderTrend);
  }
}

// ---------- snapshot ----------

async function refresh() {
  try {
    if (state.trainingLoaded) loadDays();
    state.snapshot = await api("/today");
    renderSnapshot(state.snapshot);
    store.set(SNAPSHOT_CACHE_KEY, state.snapshot);
    loadUsual();
  } catch (err) {
    toast(err.message);
  }
}

// ---------- usual meals ----------

/** Meals logged again and again; the chat chips and the meal sheet offer them as one tap. */
async function loadUsual() {
  try {
    const r = await api("/meals/usual");
    state.usual = r.meals || [];
    store.set(USUAL_CACHE_KEY, state.usual);
    renderChips(state.snapshot);
  } catch { /* chips just stay as they were */ }
}

const short = (t, n = 24) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

function repeatMeal(m) {
  return coachTurn(
    () => addMessage("user", `Usual: ${m.text}`),
    () => api("/meals/repeat", { method: "POST", body: JSON.stringify({ key: m.key }) }),
  );
}

/** A usual meal as a local draft (for the meal sheet): same items, fresh id, confirm as usual. */
function usualDraft(m) {
  const h = new Date().getHours();
  const slot = m.slot === "snack" ? "snack" : h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 18 ? "snack" : "dinner";
  return { draftId: crypto.randomUUID(), text: m.text, slot, source: m.source, items: m.items.map((i) => ({ ...i })), totals: m.totals, estimated: true, servingAssumption: null };
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
  if (state.review) renderReview();

  // Day cards: from the history once it's loaded; until then today's numbers from this snapshot.
  if (!state.history) renderDay();
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

// ---------- days: food, activity, trends ----------
// One /history call carries the last 30 days in full (meal items, macros, steps, burn, Hevy sets),
// so picking a day or switching a chart never waits on the network.

const SLOT_LABEL = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack", unspecified: "Meal" };
const MACROS = [["proteinG", "Protein", 4, "p"], ["carbsG", "Carbs", 4, "c"], ["fatG", "Fat", 9, "f"]];

async function loadDays() {
  if (loadDays.running) return;
  loadDays.running = true;
  try {
    state.history = await api("/history?days=30");
    store.set(HISTORY_CACHE_KEY, state.history);
    renderDays();
  } catch (err) {
    if (!state.history) $("fuel-body").replaceChildren(el("p", { class: "none" }, "Couldn't load your days. Pull down or reopen to retry."));
  } finally {
    loadDays.running = false;
  }
}

function todayKey() {
  return state.history?.today || state.snapshot?.today?.date || null;
}

function selectedDay() {
  const days = state.history?.days || [];
  return days.find((d) => d.date === state.selectedDate) || days.at(-1) || null;
}

function selectDay(date, { scroll = false } = {}) {
  state.selectedDate = date;
  renderStrip();
  renderDay();
  renderTrend();
  if (scroll) $("days-strip").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDays() {
  const h = state.history;
  if (!h) return;
  // A new day, or a date that fell out of the window: back to today.
  if (!h.days.some((d) => d.date === state.selectedDate)) state.selectedDate = h.today;
  renderStrip(true);
  renderDay();
  renderTrend();
}

const shortDate = (d) => dateOf(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const dayName = (d) => (d === todayKey() ? "Today" : shortDate(d));
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function renderStrip(scrollToEnd = false) {
  const strip = $("days-strip");
  const days = state.history?.days || [];
  strip.replaceChildren(
    ...days.map((d) => {
      const logged = d.meals.length || d.steps || d.workouts.length;
      const b = el("button", {
        type: "button", role: "tab",
        class: ["day-pill", d.date === state.selectedDate && "sel", d.date === todayKey() && "today"].filter(Boolean).join(" "),
        "aria-selected": String(d.date === state.selectedDate),
        "aria-label": `${shortDate(d.date)}${d.onTrack ? ", on track" : ""}${d.workouts.length ? ", workout" : ""}`,
        onclick: () => selectDay(d.date),
      },
        el("span", { class: "wd" }, WD[d.weekday]),
        el("span", { class: "dn" }, String(dateOf(d.date).getUTCDate())),
        el("i", { class: `mark ${d.onTrack ? "on" : logged ? "some" : ""}${d.workouts.length || d.trainedUnlogged ? " lift" : ""}` }),
      );
      return b;
    }),
  );
  if (scrollToEnd) strip.scrollLeft = strip.scrollWidth;
  else strip.querySelector(".sel")?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Today's numbers before /history has ever loaded: same shape as a history day, fewer fields. */
function snapshotDay() {
  const s = state.snapshot;
  if (!s) return null;
  return {
    date: s.today.date, weekday: dateOf(s.today.date).getUTCDay(), isTrainingDay: s.today.isTrainingDay,
    onTrack: s.today.onTrack, score: s.today.score, checks: s.today.checks,
    calories: s.today.calories, proteinG: s.today.proteinG, carbsG: null, fatG: null,
    meals: (s.meals || []).map((m) => ({ ...m, proteinG: m.proteinG, carbsG: null, fatG: null, items: [] })).reverse(),
    steps: s.today.steps, walkMinutes: s.today.walkMinutes, burn: null, workouts: [], trainedUnlogged: false, partial: true,
  };
}

function renderDay() {
  const d = (state.history && selectedDay()) || snapshotDay();
  if (!d) return;
  const isToday = d.date === todayKey() || d.partial;
  const t = state.history?.targets || state.snapshot?.targets || {};
  renderFuel(d, t);
  renderMove(d, t, isToday);
  $("day-card-title").textContent = isToday ? "Today" : shortDate(d.date);
  $("today-score").textContent = d.onTrack ? "On track" : `${d.score}%`;
  $("checks").replaceChildren(
    ...d.checks.map((c) =>
      el("li", { class: c.met ? "met" : "" },
        el("span", { class: "dot" }),
        el("span", {}, c.label),
        el("span", { class: "detail" }, c.detail),
        el("div", { class: "bar" }, el("i", { style: `width:${Math.round(c.progress * 100)}%` })),
      ),
    ),
  );
  $("quick-row").hidden = !isToday;
}

function renderFuel(d, t) {
  const target = t.calorieTarget;
  $("fuel-meta").textContent = d.meals.length ? `${d.meals.length} meal${d.meals.length === 1 ? "" : "s"}` : "";
  const over = target && d.calories > target;
  const top = el("div", { class: "fuel-top" },
    el("div", { class: "big" }, el("span", { class: "num" }, fmt(d.calories)), el("span", { class: "unit" }, "kcal")),
    target
      ? el("div", { class: "side" },
          el("div", {}, `of ${fmt(target)}`),
          el("div", { class: over ? "warn" : "muted" }, over ? `${fmt(d.calories - target)} over` : `${fmt(target - d.calories)} left`))
      : el("button", { class: "link", type: "button", onclick: () => openSheet("settings") }, "Set a calorie target"),
  );
  const meter = target
    ? el("div", { class: `meter${over ? " over" : ""}`, role: "img", "aria-label": `${fmt(d.calories)} of ${fmt(target)} kcal` },
        el("i", { style: `width:${Math.min(100, Math.round((d.calories / target) * 100))}%` }))
    : null;

  let macros = null;
  if (d.carbsG != null) {
    const kcal = MACROS.map(([k, , per]) => (d[k] || 0) * per);
    const total = kcal.reduce((a, b) => a + b, 0);
    macros = el("div", { class: "macros-block" },
      total
        ? el("div", { class: "macro-bar", role: "img", "aria-label": MACROS.map(([k, label]) => `${label} ${fmt(d[k])} g`).join(", ") },
            ...MACROS.map(([, , , cls], i) => (kcal[i] ? el("i", { class: cls, style: `flex-grow:${kcal[i]}` }) : null)))
        : el("div", { class: "macro-bar empty" }),
      el("div", { class: "macro-legend" },
        ...MACROS.map(([k, label, , cls], i) =>
          el("div", { class: "ml" },
            el("span", { class: "k" }, el("i", { class: `sw ${cls}` }), label),
            el("span", { class: "v" }, `${fmt(d[k])}`, el("small", {}, " g"),
              k === "proteinG" && t.proteinTarget ? el("small", { class: "of" }, ` / ${fmt(t.proteinTarget)}`) : null),
            el("span", { class: "pct" }, total ? `${Math.round((kcal[i] / total) * 100)}%` : "–"),
          ))),
    );
  } else {
    macros = el("div", { class: "macro-legend" }, el("div", { class: "ml" }, el("span", { class: "k" }, el("i", { class: "sw p" }), "Protein"), el("span", { class: "v" }, `${fmt(d.proteinG)}`, el("small", {}, " g"))));
  }
  $("fuel-body").replaceChildren(...[top, meter, macros].filter(Boolean));

  $("meals").replaceChildren(
    ...(d.meals.length
      ? d.meals.map((m) => mealRow(m, d))
      : [el("li", { class: "none" }, d.date === todayKey() ? "Nothing logged yet today." : "No meals logged this day.")]),
  );
}

function expander(key, head, body) {
  const open = state.open.has(key);
  const li = el("li", { class: `row${open ? " open" : ""}` });
  const btn = el("button", { class: "row-head", type: "button", "aria-expanded": String(open) }, ...head, el("span", { class: "chev", "aria-hidden": "true" }));
  const panel = el("div", { class: "row-body" }, ...(open ? body() : []));
  btn.addEventListener("click", () => {
    const now = !state.open.has(key);
    now ? state.open.add(key) : state.open.delete(key);
    li.classList.toggle("open", now);
    btn.setAttribute("aria-expanded", String(now));
    panel.replaceChildren(...(now ? body().filter(Boolean) : []));
  });
  li.append(btn, panel);
  return li;
}

function mealRow(m) {
  return expander(`meal:${m.mealSessionId}`,
    [
      el("span", { class: "main" },
        el("span", { class: "title" }, m.text),
        el("span", { class: "sub" }, `${SLOT_LABEL[m.slot] || cap(m.slot)} · ${timeOf(m.loggedAt)}`),
      ),
      el("span", { class: "right" }, el("b", {}, fmt(m.calories)), el("small", {}, " kcal")),
    ],
    () => [
      m.carbsG != null
        ? el("div", { class: "chips-row" }, ...MACROS.map(([k, label, , cls]) => el("span", { class: "mchip" }, el("i", { class: `sw ${cls}` }), `${label} `, el("b", {}, `${fmt(m[k], 1)} g`))))
        : el("div", { class: "chips-row" }, el("span", { class: "mchip" }, el("i", { class: "sw p" }), "Protein ", el("b", {}, `${fmt(m.proteinG)} g`))),
      m.items?.length
        ? el("ul", { class: "items-list" },
            ...m.items.map((i) =>
              el("li", {},
                el("span", { class: "iname" }, i.name),
                el("span", { class: "ikcal" }, `${fmt(i.calories)}`),
                el("span", { class: "imac" }, `P ${fmt(i.proteinG)} · C ${fmt(i.carbsG)} · F ${fmt(i.fatG)}`),
              )))
        : null,
      el("div", { class: "row-actions" },
        el("button", { class: "link danger", type: "button", onclick: () => deleteMeal(m) }, "Remove meal")),
    ]);
}

function renderMove(d, t, isToday) {
  const hevy = state.history?.hevy;
  const s = state.snapshot;
  $("move-meta").textContent = isToday && d.isTrainingDay && s?.gym?.time ? `Gym ${clock(s.gym.time)}` : d.isTrainingDay ? "Training day" : "Rest day";
  const stepT = t.stepTarget || 8000;
  const mins = d.workouts.reduce((a, w) => a + (w.durationMin || 0), 0);
  const tile = (label, value, unit, sub, pct) =>
    el("div", { class: "tile" },
      el("div", { class: "tl" }, label),
      el("div", { class: "tv" }, value, unit ? el("small", {}, ` ${unit}`) : null),
      pct != null ? el("div", { class: "meter thin" }, el("i", { style: `width:${Math.min(100, Math.round(pct * 100))}%` })) : null,
      el("div", { class: "ts" }, sub),
    );
  $("move-tiles").replaceChildren(
    tile("Steps", fmt(d.steps), null, `of ${fmt(stepT)}`, d.steps / stepT),
    tile("Burned", d.burn ? fmt(d.burn.kcal) : "–", d.burn ? "kcal" : null, d.burn ? (d.burn.source === "estimate" ? "estimated" : "from phone") : "no data yet", null),
    tile("Workout", d.workouts.length ? fmt(mins) : d.trainedUnlogged ? "✓" : "–", d.workouts.length ? "min" : null,
      d.workouts.length ? `${fmt(d.workouts.reduce((a, w) => a + w.volumeKg, 0))} kg lifted` : d.trainedUnlogged ? "not in Hevy" : d.isTrainingDay ? "none logged" : "rest", null),
  );
  const rows = d.workouts.map((w) =>
    expander(`w:${w.id || w.startTime}`,
      [
        el("span", { class: "main" },
          el("span", { class: "title" }, w.title),
          el("span", { class: "sub" }, [timeOf(w.startTime), w.durationMin != null ? `${w.durationMin} min` : null, `${w.exercises.length} exercises`].filter(Boolean).join(" · ")),
        ),
        el("span", { class: "right" }, el("b", {}, fmt(w.volumeKg)), el("small", {}, " kg")),
      ],
      () => [
        el("ol", { class: "ex-list" },
          ...w.exercises.map((e) =>
            el("li", {},
              el("div", { class: "ex-name" }, e.title),
              el("div", { class: "sets" }, ...e.sets.map((st) => el("span", { class: `set${st.type === "warmup" ? " warm" : st.type === "failure" ? " fail" : st.type === "dropset" ? " drop" : ""}`, title: st.type }, setLabel(st)))),
            ))),
        el("p", { class: "hint" }, `${w.setCount} working sets · warm-ups faded`),
      ]));
  $("workouts").replaceChildren(
    ...(rows.length
      ? rows
      : [el("li", { class: "none" },
          hevy === "not_connected" ? "Hevy isn't connected for this account."
          : hevy === "unavailable" ? "Couldn't reach Hevy just now."
          : d.trainedUnlogged ? "You trained but didn't log it in Hevy."
          : d.partial ? "Loading workouts…"
          : "No workout logged.")]),
  );
}

function setLabel(st) {
  if (st.weightKg != null && st.reps != null) return `${fmt(st.weightKg, 1)} × ${st.reps}`;
  if (st.reps != null) return `${st.reps} reps`;
  if (st.distanceM != null) return st.distanceM >= 1000 ? `${fmt(st.distanceM / 1000, 2)} km` : `${fmt(st.distanceM)} m`;
  if (st.durationS != null) return st.durationS >= 120 ? `${Math.round(st.durationS / 60)} min` : `${st.durationS} s`;
  return "set";
}

// ---------- trends chart ----------

const TREND = {
  calories: {
    unit: "kcal",
    value: (d) => d.calories,
    target: (t) => t.calorieTarget,
    summary(days, t) {
      const logged = days.filter((d) => d.calories > 0);
      if (!logged.length) return ["No meals logged in this range.", null];
      const avg = logged.reduce((a, d) => a + d.calories, 0) / logged.length;
      const inRange = t.calorieTarget ? logged.filter((d) => d.calories >= t.calorieTarget * 0.6 && d.calories <= t.calorieTarget).length : null;
      return [`${fmt(avg)} kcal`, `average on ${logged.length} logged day${logged.length === 1 ? "" : "s"}${inRange != null ? ` · ${inRange} within target` : ""}`];
    },
    tip: (d) => [`${fmt(d.calories)} kcal`, `${d.meals.length} meal${d.meals.length === 1 ? "" : "s"}`],
  },
  macros: {
    unit: "kcal",
    stack: (d) => MACROS.map(([k, , per]) => (d[k] || 0) * per),
    summary(days, t) {
      const logged = days.filter((d) => d.calories > 0);
      if (!logged.length) return ["No meals logged in this range.", null];
      const avg = (k) => logged.reduce((a, d) => a + (d[k] || 0), 0) / logged.length;
      return [`${fmt(avg("proteinG"))} g protein`, `daily average · ${fmt(avg("carbsG"))} g carbs · ${fmt(avg("fatG"))} g fat${t.proteinTarget ? ` · target ${fmt(t.proteinTarget)} g protein` : ""}`];
    },
    tip: (d) => [`${fmt(d.calories)} kcal`, ...MACROS.map(([k, label]) => `${label} ${fmt(d[k])} g`)],
  },
  steps: {
    unit: "steps",
    value: (d) => d.steps,
    target: (t) => t.stepTarget,
    summary(days, t) {
      const withSteps = days.filter((d) => d.steps > 0);
      if (!withSteps.length) return ["No steps synced yet.", "Set up Health Connect sync, or add steps by hand from Today."];
      const avg = withSteps.reduce((a, d) => a + d.steps, 0) / withSteps.length;
      const hit = days.filter((d) => d.steps >= (t.stepTarget || 8000)).length;
      return [`${fmt(avg)} steps`, `daily average · ${hit} day${hit === 1 ? "" : "s"} at ${fmt(t.stepTarget || 8000)}+`];
    },
    tip: (d) => [`${fmt(d.steps)} steps`, d.walkMinutes ? `${d.walkMinutes} min walking` : null],
  },
  burn: {
    unit: "kcal",
    value: (d) => d.burn?.kcal || 0,
    estimated: (d) => d.burn?.source === "estimate",
    summary(days) {
      const withBurn = days.filter((d) => d.burn);
      if (!withBurn.length) return ["Nothing to show yet.", "Burn comes from steps and workouts."];
      const avg = withBurn.reduce((a, d) => a + d.burn.kcal, 0) / withBurn.length;
      return [`${fmt(avg)} kcal`, "active calories, daily average"];
    },
    tip: (d) => (d.burn ? [`${fmt(d.burn.kcal)} kcal`, d.burn.source === "estimate" ? `est. · steps ${fmt(d.burn.stepsKcal)} + gym ${fmt(d.burn.workoutKcal)}` : "Health Connect"] : ["No data"]),
  },
  training: {
    unit: "min",
    value: (d) => d.workouts.reduce((a, w) => a + (w.durationMin || 0), 0),
    summary(days) {
      const ws = days.flatMap((d) => d.workouts);
      if (!ws.length) return ["No workouts in this range.", null];
      const vol = ws.reduce((a, w) => a + w.volumeKg, 0);
      return [`${ws.length} workout${ws.length === 1 ? "" : "s"}`, `${fmt((ws.length / days.length) * 7, 1)} a week · ${fmt(vol)} kg lifted`];
    },
    tip: (d) => (d.workouts.length ? [...d.workouts.map((w) => `${w.title} · ${w.durationMin ?? "?"} min`), `${fmt(d.workouts.reduce((a, w) => a + w.volumeKg, 0))} kg lifted`] : [d.isTrainingDay ? "Training day, nothing logged" : "Rest"]),
  },
};

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10) * p;
}
const compact = (v) => (v >= 10000 ? `${fmt(v / 1000)}K` : v >= 1000 ? `${fmt(v / 1000, 1)}K` : fmt(v));

function renderTrend() {
  const h = state.history;
  if (!h) return;
  const { metric, range } = state.trend;
  for (const b of document.querySelectorAll("#trend-tabs button")) b.classList.toggle("on", b.dataset.metric === metric);
  for (const b of document.querySelectorAll("#trend-range button")) b.classList.toggle("on", Number(b.dataset.range) === range);
  const cfg = TREND[metric];
  const days = h.days.slice(-range);
  const t = h.targets || {};
  const [headline, sub] = cfg.summary(days, t);
  const summary = $("trend-summary");
  const showSummary = () => {
    summary.classList.remove("picked");
    summary.replaceChildren(el("span", { class: "tv" }, headline), ...(sub ? [el("span", { class: "ts" }, sub)] : []));
  };
  // Tapping a bar swaps the summary for that day's readout, so nothing floats over the chart.
  const showDay = (d) => {
    if (!d) return showSummary();
    const [first, ...rest] = cfg.tip(d).filter(Boolean);
    summary.classList.add("picked");
    summary.replaceChildren(
      el("span", { class: "tv" }, first),
      el("span", { class: "ts" }, [dayName(d.date), ...rest].join(" · ")),
      el("button", { class: "link pick-open", type: "button", onclick: () => selectDay(d.date, { scroll: true }) }, "Open day →"),
    );
  };
  showSummary();

  const notes = {
    burn: days.some((d) => d.burn?.source === "estimate")
      ? "Faded bars are estimates from steps and workout time. Turn on Active calories in HC Webhook to use your phone's numbers."
      : "",
    macros: "Calories from each macro: protein and carbs 4 kcal/g, fat 9 kcal/g.",
  };
  $("trend-note").textContent = notes[metric] || "Tap a bar to see that day.";
  const target = cfg.target ? cfg.target(t) : null;
  $("trend-legend").replaceChildren(
    ...(metric === "macros" ? MACROS.map(([, label, , cls]) => el("span", { class: "lg" }, el("i", { class: `sw ${cls}` }), label)) : []),
    ...(target ? [el("span", { class: "lg" }, el("i", { class: "key-target" }), `Target ${fmt(target)}`)] : []),
  );
  barChart($("trend-chart"), days, cfg, target, showDay);
}

function barChart(host, days, cfg, target, onPick) {
  const W = Math.max(260, host.clientWidth || 320), H = 168;
  const padL = 34, padR = 4, padT = 10, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const stacks = days.map((d) => (cfg.stack ? cfg.stack(d) : [cfg.value(d)]));
  const totals = stacks.map((s) => s.reduce((a, b) => a + b, 0));
  const max = niceMax(Math.max(...totals, target || 0) * 1.05);
  const slot = iw / days.length;
  const bw = Math.max(3, Math.min(24, slot * 0.62));
  const y = (v) => padT + ih - (v / max) * ih;
  const colors = cfg.stack ? ["p", "c", "f"] : ["one"];

  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), role: "img", "aria-label": `${cfg.unit} per day, last ${days.length} days` });
  for (const v of [0, max / 2, max]) {
    s.append(svg("line", { class: "grid", x1: String(padL), x2: String(W - padR), y1: String(y(v)), y2: String(y(v)) }));
    const tx = svg("text", { class: "axis", x: String(padL - 6), y: String(y(v) + 3.5), "text-anchor": "end" });
    tx.textContent = compact(v);
    s.append(tx);
  }
  const bars = [];
  days.forEach((d, i) => {
    const cx = padL + slot * i + slot / 2;
    const g = svg("g", { class: `col${d.date === state.selectedDate ? " sel" : ""}${cfg.estimated?.(d) ? " est" : ""}` });
    let base = 0;
    const segs = stacks[i];
    const lastNonZero = segs.reduce((acc, v, j) => (v > 0 ? j : acc), -1);
    segs.forEach((v, j) => {
      if (v <= 0) return;
      // 2px surface gap between stacked parts; only the top end is rounded, the baseline stays square.
      const top = y(base + v);
      const yb = y(base) - (base > 0 ? 2 : 0);
      const hgt = yb - top;
      if (hgt > 0.5) {
        const x0 = cx - bw / 2, r = j === lastNonZero ? Math.min(4, bw / 2, hgt) : 0;
        g.append(svg("path", {
          class: `bar ${colors[j]}`,
          d: `M ${x0} ${yb} V ${top + r} Q ${x0} ${top} ${x0 + r} ${top} H ${x0 + bw - r} Q ${x0 + bw} ${top} ${x0 + bw} ${top + r} V ${yb} Z`,
        }));
      }
      base += v;
    });
    if (!totals[i]) g.append(svg("circle", { class: "zero", cx: String(cx), cy: String(y(0) - 1.5), r: "1.5" }));
    s.append(g);
    bars.push(g);
    const showLabel = days.length <= 7 || (days.length - 1 - i) % 7 === 0;
    if (showLabel) {
      const tx = svg("text", { class: `axis${d.date === state.selectedDate ? " strong" : ""}`, x: String(cx), y: String(H - 6), "text-anchor": "middle" });
      tx.textContent = days.length <= 7 ? WD[d.weekday] : String(dateOf(d.date).getUTCDate());
      s.append(tx);
    }
  });
  if (target) s.append(svg("line", { class: "target", x1: String(padL), x2: String(W - padR), y1: String(y(target)), y2: String(y(target)) }));
  // Which day the cards above show.
  const si = days.findIndex((d) => d.date === state.selectedDate);
  if (si >= 0) s.append(svg("circle", { class: "selmark", cx: String(padL + slot * si + slot / 2), cy: String(H - 18.5), r: "2" }));
  const hit = svg("rect", { class: "hit", x: String(padL), y: "0", width: String(iw), height: String(H) });
  s.append(hit);

  host.replaceChildren(s);

  let active = -1;
  const show = (i) => {
    if (i === active) return;
    active = i;
    bars.forEach((b, j) => b.classList.toggle("dim", i >= 0 && j !== i));
    onPick(i >= 0 ? days[i] : null);
  };
  const indexAt = (e) => {
    const r = s.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W - padL;
    return Math.max(0, Math.min(days.length - 1, Math.floor(x / slot)));
  };
  host.hideTip = () => show(-1);
  hit.addEventListener("pointerdown", (e) => show(indexAt(e)));
  // Phones fire emulated mouse events after a tap; only a real hover device follows the pointer.
  const hover = matchMedia("(hover: hover)").matches;
  hit.addEventListener("pointermove", (e) => { if ((hover && e.pointerType === "mouse") || e.buttons) show(indexAt(e)); });
  hit.addEventListener("pointerleave", (e) => { if (hover && e.pointerType === "mouse") show(-1); });
}

for (const b of document.querySelectorAll("#trend-tabs button")) b.addEventListener("click", () => { state.trend.metric = b.dataset.metric; renderTrend(); });
for (const b of document.querySelectorAll("#trend-range button")) b.addEventListener("click", () => { state.trend.range = Number(b.dataset.range); renderTrend(); });
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("#trend-chart, #trend-summary")) $("trend-chart").hideTip?.();
});
let resizeTimer;
window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderTrend, 150); });

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
  // The two best usual meals for this time of day lead, as one-tap repeats.
  const usual = (state.usual || []).slice(0, 2).map((m) =>
    el("button", { class: "chip usual", type: "button", title: m.text, onclick: () => repeatMeal(m) }, `↻ ${short(m.text)}`));
  $("chips").replaceChildren(
    ...usual,
    ...chips.map(([label, text]) =>
      el("button", { class: "chip", type: "button", onclick: () => {
        // Questions send straight away (no keyboard pop-up); the rest pre-fill for the person to finish.
        if (text.endsWith("?")) { send(text); return; }
        const input = $("input");
        input.value = text;
        input.focus();
        autosize();
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

function historySig(messages) {
  const last = messages.at(-1);
  return `${messages.length}|${last?.createdAt ?? ""}|${JSON.stringify(messages.flatMap((m) => (m.cards || []).map((c) => c.status ?? "")))}`;
}

function renderHistory(messages) {
  const sig = historySig(messages);
  // Rebuilding the whole thread is the slow part on a phone; skip it when nothing changed.
  if (sig === state.historySig) return;
  state.historySig = sig;
  if (!messages.length) return renderEmpty();
  const t = $("thread");
  const prevBehavior = t.style.scrollBehavior;
  t.style.scrollBehavior = "auto";
  t.replaceChildren();
  for (const m of messages) {
    addMessage(m.role === "user" ? "user" : "coach", m.content);
    for (const c of m.cards || []) appendCard(c);
  }
  requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; t.style.scrollBehavior = prevBehavior; });
}

async function loadHistory() {
  try {
    const { messages } = await api("/chat");
    if (state.sending) return;
    renderHistory(messages);
    store.set(CHAT_CACHE_KEY, messages.slice(-50));
  } catch (err) {
    if (!state.historySig) renderEmpty();
  }
}

// A coach turn can take a while (meal web search); past this the UI frees up instead of looking dead.
const CHAT_TIMEOUT_MS = 90_000;

/** Returns false when the message wasn't sent, so the caller keeps the text. */
async function send(text) {
  if (!text.trim()) return false;
  return coachTurn(addMessage.bind(null, "user", text), () => api("/chat", { method: "POST", body: JSON.stringify({ text }) }));
}

/**
 * One exchange in the thread: the person's bubble, a typing indicator, then the reply and its
 * cards. Shared by typed messages, meal photos and repeat meals.
 */
async function coachTurn(showUser, request) {
  if (state.sending) {
    toast("Still answering your last message. One moment.");
    return false;
  }
  state.sending = true;
  state.historySig = null;
  $("send").disabled = true;
  if ($("thread").querySelector(".empty")) $("thread").replaceChildren();
  showUser();
  const typing = el("div", { class: "msg coach typing" }, el("i"), el("i"), el("i"));
  $("thread").append(typing);
  scrollThread();
  try {
    let timer;
    const reply = await Promise.race([
      request(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("That's taking too long. The answer will show when you reopen the app, or try again.")), CHAT_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    typing.remove();
    addMessage("coach", reply.text);
    for (const c of reply.cards || []) appendCard(c);
    scrollThread();
    if (reply.changed) refresh();
  } catch (err) {
    typing.remove();
    addMessage("coach err", err.message);
  } finally {
    state.sending = false;
    $("send").disabled = false;
  }
  return true;
}

// ---------- meal photos ----------

const PHOTO_MAX_PX = 1280;

/** Shrinks a camera photo to ~1280 px JPEG (a few hundred KB) before upload; returns base64. */
async function photoToJpeg(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw new Error("Couldn't open that image. Try a JPEG or PNG photo.");
  const scale = Math.min(1, PHOTO_MAX_PX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("Couldn't prepare that photo.");
  const dataUrl = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("Couldn't read that photo."));
    r.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

/** Photo of the plate → draft card in the thread. Text in the composer goes along as a note. */
async function sendPhoto(file) {
  if (!file) return;
  if (state.sending) { toast("Still answering your last message. One moment."); return; }
  const note = $("input").value.trim();
  $("input").value = "";
  autosize();
  const preview = URL.createObjectURL(file);
  await coachTurn(
    () => {
      $("thread").append(el("div", { class: "msg user photo" },
        el("img", { src: preview, alt: "Meal photo", onload: () => scrollThread() }),
        note ? el("span", {}, note) : null));
      scrollThread();
    },
    async () => {
      const image = await photoToJpeg(file);
      return api("/meals/photo", { method: "POST", body: JSON.stringify({ image, mediaType: "image/jpeg", note: note || undefined }) });
    },
  );
}

function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${Math.min(140, t.scrollHeight)}px`;
}

function appendCard(c) {
  if (c.type === "meal_draft") $("thread").append(mealDraftCard(c.draft));
  else if (c.type === "workout_check") $("thread").append(workoutCheckCard(c));
  else if (c.type === "hevy_proposal") $("thread").append(hevyProposalCard(c));
  else if (c.type === "rca") $("thread").append(rcaCard(c));
  else if (c.type === "calorie_review") $("thread").append(calorieReviewCard(c.review));
}

// ---------- root-cause card ----------

const RCA_STATUS = { trying: "Trying it this week", declined: "Skipped", helped: "It helped", no_change: "Didn't move the needle" };

/** Why the days slipped: evidence, one hypothesis, one experiment to take up. */
function rcaCard(c) {
  const card = el("div", { class: "draft rca" });
  function render(cur) {
    const actions = cur.status === "proposed"
      ? (() => {
          const yes = el("button", { class: "btn primary", type: "button" }, "I'll try it");
          const no = el("button", { class: "btn", type: "button" }, "Not this one");
          const go = async (action) => {
            yes.disabled = no.disabled = true;
            try {
              const r = await api(`/rca/${cur.reportId}`, { method: "POST", body: JSON.stringify({ action }) });
              render({ ...cur, status: r.status });
              if (action === "try") toast("Noted. I'll check in a week whether it helped.");
            } catch (err) {
              yes.disabled = no.disabled = false;
              toast(err.message);
            }
          };
          yes.addEventListener("click", () => go("try"));
          no.addEventListener("click", () => go("decline"));
          return el("div", { class: "draft-actions" }, no, yes);
        })()
      : el("p", { class: `rca-status ${cur.status}` }, RCA_STATUS[cur.status] || cur.status);
    card.replaceChildren(
      el("p", { class: "eyebrow" }, "Root cause · last 3 weeks"),
      el("p", { class: "rca-hypothesis" }, cur.hypothesis),
      cur.evidence?.length ? el("ul", { class: "changes evidence" }, ...cur.evidence.map((t) => el("li", { class: "info" }, el("span", { class: "sign" }, "·"), el("span", {}, t)))) : null,
      el("div", { class: "experiment" }, el("p", { class: "section-label" }, "Experiment · 7 days"), el("p", {}, cur.experiment)),
      actions,
    );
  }
  render(c);
  return card;
}

// ---------- calorie target review ----------

const REVIEW_KEY = "magnus-calorie-reviews";
const reviewId = (r) => `${r.suggestedTarget}|${r.maintenanceKcal}|${r.avgIntakeKcal}`;

async function loadReview() {
  try {
    state.review = await api("/targets/review");
  } catch {
    state.review = null;
  }
  renderReview();
}

function renderReview() {
  const host = $("target-review");
  const r = state.review;
  if (!r) return host.replaceChildren();
  if (r.status !== "ok") {
    return host.replaceChildren(el("p", { class: "section-label" }, "Calorie target"), el("p", { class: "hint" }, r.summary));
  }
  host.replaceChildren(reviewPanel(r, () => renderReview()));
}

/** Maintenance from real intake + weight trend, the on-pace target, and one tap to apply it. */
function reviewPanel(r, rerender) {
  const current = state.snapshot?.targets?.calorieTarget ?? r.currentTarget;
  const applied = current === r.suggestedTarget;
  const kept = store.get(REVIEW_KEY, {})[reviewId(r)] === "kept";
  const signed = (v) => `${v > 0 ? "+" : ""}${fmt(v, 2)}`;
  const apply = el("button", { class: "btn primary", type: "button" }, `Set ${fmt(r.suggestedTarget)} kcal`);
  apply.addEventListener("click", async () => {
    apply.disabled = true;
    try {
      await api("/targets", { method: "POST", body: JSON.stringify({ calorieTarget: r.suggestedTarget }) });
      if (state.snapshot?.targets) state.snapshot.targets.calorieTarget = r.suggestedTarget;
      toast(`Calorie target set to ${fmt(r.suggestedTarget)} kcal.`);
      rerender();
      refresh();
    } catch (err) {
      apply.disabled = false;
      toast(err.message);
    }
  });
  const keep = el("button", { class: "btn", type: "button", onclick: () => {
    const all = store.get(REVIEW_KEY, {});
    all[reviewId(r)] = "kept";
    store.set(REVIEW_KEY, all);
    rerender();
  } }, current ? `Keep ${fmt(current)}` : "Not now");
  const offer = r.recommend && !applied && !kept;
  return el("div", { class: "review" },
    el("p", { class: "eyebrow" }, `Calorie target · last 4 weeks · ${r.confidence} confidence`),
    el("div", { class: "review-top" },
      el("div", { class: "draft-kcal" }, fmt(offer || applied ? r.suggestedTarget : current ?? r.suggestedTarget), el("small", {}, "kcal / day")),
      el("span", { class: `tag ${r.cappedForSafety ? "behind" : "on_pace"}` }, `${signed(r.plannedKgPerWeek)} kg/wk`),
    ),
    el("div", { class: "review-stats" },
      el("span", {}, el("b", {}, fmt(r.maintenanceKcal)), " maintenance"),
      el("span", {}, el("b", {}, fmt(r.avgIntakeKcal)), " avg logged"),
      el("span", {}, el("b", {}, signed(r.actualKgPerWeek)), " kg/wk now"),
    ),
    el("p", { class: "review-line" }, r.summary),
    offer ? el("div", { class: "draft-actions" }, keep, apply)
      : el("p", { class: "rca-status trying" }, applied ? `✓ Target is ${fmt(r.suggestedTarget)} kcal` : kept ? `Kept ${fmt(current)} kcal` : "✓ Your target is on pace"),
  );
}

function calorieReviewCard(review) {
  const card = el("div", { class: "draft" });
  const paint = () => card.replaceChildren(reviewPanel(review, paint));
  paint();
  return card;
}

// ---------- push notifications ----------

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser can't receive push. Install the app from Chrome first.");
  const { publicKey } = await api("/push");
  if (!publicKey) throw new Error(friendlyError("push_not_configured"));
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked for this app in Android settings.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await api("/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
}

async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api("/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe();
}

const NUDGES = [
  ["morning_plan", "Morning plan"],
  ["meal_reminder", "Meal reminders"],
  ["step_pace", "Step pace"],
  ["workout_check", "Workout check"],
  ["evening_wrap", "Evening wrap"],
  ["weigh_in", "Weekly weigh-in"],
  ["rca", "Root-cause reviews"],
];

function notificationsSection() {
  const wrap = el("div", { class: "stack" }, el("p", { class: "section-label" }, "Notifications"));
  const status = el("p", { class: "hint" }, "Checking…");
  const toggle = el("button", { class: "btn block", type: "button" }, "…");
  const test = el("button", { class: "link", type: "button", hidden: true }, "Send a test");
  const kinds = el("div", { class: "toggles" });
  const quiet = el("div", { class: "grid2" });
  wrap.append(status, toggle, test, kinds, quiet);

  let prefs = { quietStart: "22:30", quietEnd: "07:00", off: [] };
  const savePrefs = async (patch) => {
    prefs = { ...prefs, ...patch };
    try { await api("/push/prefs", { method: "POST", body: JSON.stringify(patch) }); } catch (err) { toast(err.message); }
  };

  async function paint() {
    const sub = await currentSubscription().catch(() => null);
    const on = !!sub && Notification.permission === "granted";
    status.textContent = on ? "On for this phone. Tap a nudge to turn it off." : "Off. Turn on to get nudges for meals, steps, workouts and reviews.";
    toggle.textContent = on ? "Turn off on this phone" : "Turn on notifications";
    toggle.className = on ? "btn block" : "btn primary block";
    test.hidden = !on;
    kinds.replaceChildren(...NUDGES.map(([k, label]) => {
      const b = el("button", { type: "button", class: prefs.off.includes(k) ? "" : "on", "aria-pressed": String(!prefs.off.includes(k)) }, label);
      b.addEventListener("click", () => {
        const off = prefs.off.includes(k) ? prefs.off.filter((x) => x !== k) : [...prefs.off, k];
        savePrefs({ off });
        paint();
      });
      return b;
    }));
    kinds.hidden = !on;
    quiet.hidden = !on;
  }

  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      (await currentSubscription()) ? await disablePush() : await enablePush();
    } catch (err) {
      toast(err.message);
    }
    toggle.disabled = false;
    paint();
  });
  test.addEventListener("click", async () => {
    try { await api("/push/test", { method: "POST" }); toast("Sent. It should arrive in a few seconds."); } catch (err) { toast(err.message); }
  });

  api("/push").then((r) => {
    prefs = r.prefs || prefs;
    quiet.replaceChildren(
      el("label", {}, "Quiet from", el("input", { class: "field", type: "time", value: prefs.quietStart, onchange: (e) => savePrefs({ quietStart: e.target.value }) })),
      el("label", {}, "Until", el("input", { class: "field", type: "time", value: prefs.quietEnd, onchange: (e) => savePrefs({ quietEnd: e.target.value }) })),
    );
    paint();
  }).catch(() => paint());
  return wrap;
}

// ---------- account ----------

/** Who's signed in, Hevy, the Health Connect token, and sign-out. */
function accountSection() {
  const wrap = el("div", { class: "stack" }, el("p", { class: "section-label" }, "Account"));
  const who = el("p", { class: "hint" }, "Loading…");
  const hevy = el("div", { class: "stack" });
  const hc = el("div", { class: "stack" });
  const out = el("button", { class: "link danger", type: "button", onclick: () => { if (confirm("Sign out of Magnus on this phone?")) { closeSheet(); endSession(); } } }, "Sign out");
  const download = el("button", { class: "link", type: "button", onclick: async () => {
    try {
      const data = await api("/account/export");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      el("a", { href: url, download: `magnus-export-${new Date().toISOString().slice(0, 10)}.json` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) { toast(err.message); }
  } }, "Download my data");
  const remove = el("button", { class: "link danger", type: "button", onclick: async () => {
    const typed = prompt("This deletes your account and every meal, weigh-in and message. It can't be undone. Type DELETE to confirm.");
    if (typed !== "DELETE") return;
    try {
      await api("/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
      closeSheet();
      endSession("Your account and data were deleted.");
    } catch (err) { toast(err.message); }
  } }, "Delete account");
  wrap.append(who, el("p", { class: "section-label" }, "Hevy"), hevy, el("p", { class: "section-label" }, "Health Connect"), hc,
    el("p", { class: "section-label" }, "Your data"), el("p", { class: "hint" }, "Your data is yours: download all of it, or delete it for good."), el("div", { class: "row-between" }, download, remove), out);

  function paintHevy(connected) {
    if (connected) {
      hevy.replaceChildren(
        el("p", { class: "hint" }, "Connected. Workouts and routines come from your Hevy account."),
        el("button", { class: "link", type: "button", onclick: async () => {
          try { await api("/integrations/hevy", { method: "DELETE" }); toast("Hevy disconnected."); paintHevy(false); } catch (err) { toast(err.message); }
        } }, "Disconnect Hevy"),
      );
      return;
    }
    hevy.replaceChildren(
      el("form", { class: "stack", onsubmit: submitter(async (fd) => {
        await api("/integrations/hevy", { method: "POST", body: JSON.stringify({ apiKey: String(fd.get("key") || "").trim() }) });
        toast("Hevy connected.");
        state.trainingLoaded = false;
        paintHevy(true);
        refresh();
      }) },
        el("p", { class: "hint" }, "Paste your Hevy API key (Hevy Pro: hevy.com → Settings → Developer). I read workouts and only change routines when you tap Apply."),
        el("input", { class: "field", name: "key", type: "password", autocomplete: "off", placeholder: "Hevy API key", required: true }),
        el("button", { class: "btn block", type: "submit" }, "Connect Hevy"),
      ),
    );
  }

  function paintHc(tokens) {
    const list = tokens.map((t) => el("div", { class: "row-between" },
      el("span", { class: "hint" }, `${t.label} · ${t.lastUsedAt ? `last sync ${new Date(t.lastUsedAt).toLocaleDateString()}` : "not used yet"}`),
      el("button", { class: "link danger", type: "button", onclick: async () => {
        try { await api(`/account/tokens/${t.id}`, { method: "DELETE" }); toast("Token revoked."); load(); } catch (err) { toast(err.message); }
      } }, "Revoke")));
    hc.replaceChildren(
      el("p", { class: "hint" }, "Steps, walks and scale readings sync from Health Connect through the HC Webhook app. Create a token, then paste it into HC Webhook with this URL:"),
      el("code", { class: "copyable" }, `${location.origin}/api/health/ingest/health-connect`),
      ...list,
      el("button", { class: "btn block", type: "button", onclick: async (e) => {
        e.target.disabled = true;
        try {
          const r = await api("/account/tokens", { method: "POST", body: JSON.stringify({ label: "Health Connect" }) });
          await navigator.clipboard?.writeText(r.token).catch(() => {});
          hc.prepend(el("p", { class: "hint" }, "Copied. It's shown only once:"), el("code", { class: "copyable" }, r.token));
          toast("Token created and copied.");
        } catch (err) { toast(err.message); }
        e.target.disabled = false;
      } }, "Create Health Connect token"),
    );
  }

  async function load() {
    try {
      const a = await api("/account");
      who.textContent = a.email ? `Signed in as ${a.email}` : a.name ? `Signed in as ${a.name}` : "Signed in with an app token.";
      paintHevy(a.hevyConnected);
      paintHc(a.tokens || []);
    } catch (err) {
      who.textContent = err.message;
    }
  }
  load();
  return wrap;
}

// ---------- Hevy proposal card ----------

const PROPOSAL_LABEL = { routine_update: "Routine change", routine_create: "New routine", workout_log: "Log workout" };
const LINE_MARK = { add: "+", remove: "−", change: "→", keep: "·", info: "" };

/** A change the coach wants to make in Hevy. Nothing is written until Apply. */
function hevyProposalCard(p) {
  const card = el("div", { class: "draft proposal" });

  function render(cur) {
    if (cur.status === "applied" || cur.status === "discarded") {
      card.className = "draft done";
      card.replaceChildren(
        cur.status === "applied"
          ? el("div", { class: "done-line" }, `✓ ${cur.kind === "workout_log" ? "Logged" : cur.kind === "routine_create" ? "Created" : "Updated"} in Hevy · ${cur.title}`)
          : el("div", { class: "muted" }, `Discarded · ${PROPOSAL_LABEL[cur.kind]} · ${cur.title}`),
      );
      return;
    }
    const apply = el("button", { class: "btn primary", type: "button" }, cur.status === "failed" ? "Try again" : "Apply to Hevy");
    const discard = el("button", { class: "btn", type: "button" }, "Discard");
    apply.addEventListener("click", async () => {
      apply.disabled = discard.disabled = true;
      apply.textContent = "Sending…";
      try {
        await api(`/hevy/proposals/${cur.proposalId}/apply`, { method: "POST" });
        render({ ...cur, status: "applied" });
        toast("Saved to Hevy.");
        refresh();
        loadTraining(true);
      } catch (err) {
        render({ ...cur, status: "failed", errorText: err.message });
      }
    });
    discard.addEventListener("click", async () => {
      apply.disabled = discard.disabled = true;
      try {
        await api(`/hevy/proposals/${cur.proposalId}/discard`, { method: "POST" });
        render({ ...cur, status: "discarded" });
      } catch (err) {
        apply.disabled = discard.disabled = false;
        toast(err.message);
      }
    });
    card.className = "draft proposal";
    card.replaceChildren(...[
      el("p", { class: "eyebrow" }, `${PROPOSAL_LABEL[cur.kind]} · check and apply`),
      el("h3", { class: "proposal-title" }, cur.title),
      cur.reason ? el("p", { class: "draft-note" }, cur.reason) : null,
      el("ul", { class: "changes" }, ...cur.lines.map((l) => el("li", { class: l.kind }, el("span", { class: "sign" }, LINE_MARK[l.kind]), el("span", {}, l.text)))),
      cur.status === "failed" ? el("p", { class: "draft-note err" }, cur.errorText || friendlyError(cur.error)) : null,
      el("div", { class: "draft-actions" }, discard, apply),
    ].filter(Boolean));
  }

  render(p);
  return card;
}

// ---------- training (tracker) ----------

const TREND_LABEL = { progressing: "Progressing", stalled: "Stalled", regressing: "Slipping", new: "New" };

async function loadTraining(fresh = false) {
  try {
    const r = await api(`/training${fresh ? "?fresh=1" : ""}`);
    renderTraining(r);
  } catch {
    $("lifts").replaceChildren(el("li", { class: "none" }, "Couldn't load Hevy history."));
  }
}

function renderTraining(r) {
  const a = r.analysis;
  if (!r.connected || !a) {
    $("lifts-meta").textContent = "";
    $("lifts").replaceChildren(el("li", { class: "none" }, "Connect Hevy to see how your lifts are moving."));
    $("lifts-ask").hidden = true;
    return;
  }
  $("lifts-meta").textContent = `${a.workoutsPerWeek}/wk · ${a.weeks} weeks`;
  const order = { regressing: 0, stalled: 1, progressing: 2, new: 3 };
  const rows = [...a.exercises].filter((e) => e.e1rmSeries.length).sort((x, y) => order[x.trend] - order[y.trend] || y.sessions - x.sessions).slice(0, 6);
  $("lifts").replaceChildren(
    ...(rows.length
      ? rows.map((e) =>
          el("li", {},
            el("div", { class: "main" },
              el("div", { class: "title" }, e.title),
              el("div", { class: "sub" }, [e.lastTopSet ? `Last ${e.lastTopSet}` : null, `${e.sessions} sessions`].filter(Boolean).join(" · ")),
            ),
            el("div", { class: "right" },
              el("span", { class: `tag ${e.trend}` }, `${TREND_LABEL[e.trend]}${e.changePct != null && e.trend !== "stalled" && e.trend !== "new" ? ` ${e.changePct > 0 ? "+" : ""}${e.changePct}%` : ""}`),
            ),
          ),
        )
      : [el("li", { class: "none" }, "No weighted lifts in the last 8 weeks.")]),
  );
  const stuck = [...a.stalled, ...a.regressing];
  $("lifts-ask").hidden = !stuck.length;
  $("lifts-ask").onclick = () => {
    setView("coach");
    send(`${stuck.slice(0, 3).join(", ")} ${stuck.length === 1 ? "has" : "have"} stopped moving. What should I change in my routine?`);
  };
}

// ---------- workout check card ----------

const SKIP_REASONS = ["Tired", "Busy", "Sore or injured", "Sick", "Travelling"];

function clock(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** Asked a few hours after the gym slot when Hevy has nothing for the day. */
function workoutCheckCard(c) {
  const card = el("div", { class: "draft check" });
  const day = `${WD_LONG[dateOf(c.date).getUTCDay()]} ${dateOf(c.date).getUTCDate()}`;

  async function answer(body, buttons) {
    for (const b of buttons) b.disabled = true;
    try {
      const r = await api("/workout-check", { method: "POST", body: JSON.stringify({ date: c.date, ...body }) });
      if (r.status === "missing") {
        toast("Still nothing in Hevy for that day.");
        for (const b of buttons) b.disabled = false;
        return;
      }
      render({ ...c, status: r.status, reason: body.reason ?? null });
      refresh();
    } catch (err) {
      for (const b of buttons) b.disabled = false;
      toast(err.message);
    }
  }

  function render(cur) {
    if (cur.status !== "missing") {
      card.className = "draft done";
      const line =
        cur.status === "found" ? "✓ Workout found in Hevy" :
        cur.status === "trained_unlogged" ? "✓ Trained, not logged in Hevy" :
        `Skipped${cur.reason ? ` · ${cur.reason}` : ""}`;
      card.replaceChildren(el("div", { class: cur.status === "skipped" ? "muted" : "done-line" }, `${line} · ${day}`));
      return;
    }
    const recheck = el("button", { class: "btn", type: "button" }, "Check Hevy again");
    const trained = el("button", { class: "btn", type: "button" }, "Trained, didn't log");
    const skipped = el("button", { class: "btn primary", type: "button" }, "Skipped");
    const buttons = [recheck, trained, skipped];
    recheck.addEventListener("click", () => answer({ answer: "recheck" }, buttons));
    trained.addEventListener("click", () => answer({ answer: "trained_unlogged" }, buttons));
    const reasons = el("div", { class: "reasons", hidden: true });
    skipped.addEventListener("click", () => { reasons.hidden = !reasons.hidden; });
    const other = el("input", { class: "field", placeholder: "Other reason", maxlength: "300" });
    reasons.append(
      el("p", { class: "draft-note" }, "What got in the way? This feeds the weekly review."),
      el("div", { class: "chips wrap" },
        ...SKIP_REASONS.map((r) => el("button", { class: "chip", type: "button", onclick: (e) => answer({ answer: "skipped", reason: r }, [...buttons, ...reasons.querySelectorAll("button")]) }, r))),
      el("form", { class: "reason-other", onsubmit: (e) => { e.preventDefault(); answer({ answer: "skipped", reason: other.value.trim() || undefined }, [...buttons, ...reasons.querySelectorAll("button")]); } },
        other, el("button", { class: "btn", type: "submit" }, "Save")),
    );
    card.className = "draft check";
    card.replaceChildren(
      el("p", { class: "eyebrow" }, `Workout check · ${day}`),
      el("p", { class: "check-line" }, `Nothing in Hevy after your ${clock(cur.gymTime)} slot.`),
      el("div", { class: "draft-actions" }, recheck, trained),
      el("div", { class: "draft-actions" }, skipped),
      reasons,
    );
  }

  render(c);
  return card;
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
    draft.servingAssumption ? assumptionNote(draft.servingAssumption) : null,
    seg, list,
    el("button", { class: "add-line", type: "button", onclick: () => { items.push({ name: "", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }); renderItems(); totals(); list.querySelector("li:last-child input")?.focus(); } }, "+ Add item"),
    el("div", { class: "draft-actions" }, discard, confirm),
  ].filter(Boolean));
  renderSeg();
  renderItems();
  totals();
  return card;
}

// Short assumptions show inline; long ones collapse to one line with "How estimated".
function assumptionNote(text) {
  if (text.length <= 110) return el("p", { class: "draft-note" }, text);
  return el("details", { class: "draft-why" },
    el("summary", {}, el("span", { class: "peek" }, text), el("span", { class: "more" }, "How estimated"), el("span", { class: "less" }, "Hide details")),
    el("p", {}, text));
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
    return el("div", { class: "quick-row two" },
      ...[["meal", "Meal"], ["steps", "Steps"], ["checkin", "Weigh-in"]].map(([k, l]) =>
        el("button", { class: "quick", type: "button", onclick: () => openSheet(k) }, el("span", {}, l))),
      el("button", { class: "quick", type: "button", onclick: () => { closeSheet(); $("photo-input").click(); } }, el("span", {}, "Photo")));
  },

  meal() {
    const holder = el("div");
    const form = el("form", { class: "stack", onsubmit: submitter(async (fd) => {
      const btn = form.querySelector("button[type=submit]");
      btn.textContent = "Estimating… (checks the web, ~10 s)";
      let draft;
      try {
        draft = await api("/meals/draft", { method: "POST", body: JSON.stringify({ text: fd.get("text") }) });
      } finally {
        btn.textContent = "Estimate";
      }
      form.hidden = true;
      holder.replaceChildren(mealDraftCard(draft, { onDone: () => setTimeout(closeSheet, 700) }));
    }) },
      (state.usual || []).length
        ? el("div", { class: "usual-list" },
            el("p", { class: "section-label" }, "Your usual"),
            ...state.usual.slice(0, 5).map((m) =>
              el("button", { class: "usual-row", type: "button", onclick: () => {
                form.hidden = true;
                holder.replaceChildren(mealDraftCard(usualDraft(m), { onDone: () => setTimeout(closeSheet, 700) }));
              } },
                el("span", {}, m.text),
                el("small", {}, `${fmt(m.totals.calories)} kcal · ${m.count}×`))))
        : null,
      el("textarea", { class: "field", name: "text", rows: "3", required: true, placeholder: "e.g. 2 rotis, a bowl of dal, 100 g paneer bhurji", minlength: "2" }),
      el("button", { class: "btn primary block", type: "submit" }, "Estimate"),
      el("p", { class: "hint" }, "You'll see the estimate and can fix any line before it's logged."),
      el("button", { class: "link", type: "button", onclick: () => { closeSheet(); $("photo-input").click(); } }, "Or snap a photo of the plate"),
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
      loadReview();
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
        await api("/targets", { method: "POST", body: JSON.stringify({ calorieTarget: num(fd.get("kcal")), proteinTarget: num(fd.get("prot")), stepTarget: num(fd.get("steps")), trainingDays: [...days], gymTime: fd.get("gym") || null, checkDelayMin: num(fd.get("delay")) }) });
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
        el("div", { class: "grid2" },
          el("label", {}, "Gym slot", el("input", { class: "field", name: "gym", type: "time", value: s?.gym?.time ?? null })),
          el("label", {}, "Check Hevy after",
            el("select", { class: "field", name: "delay" },
              ...[[120, "2 hours"], [180, "3 hours"], [240, "4 hours"]].map(([v, label]) =>
                el("option", { value: String(v), selected: (s?.gym?.checkDelayMin ?? 180) === v ? "" : null }, label)))),
        ),
        el("p", { class: "hint" }, "On training days, if Hevy has no workout by then, I'll ask in chat."),
        el("button", { class: "btn block", type: "submit" }, "Save targets"),
      ),
      notificationsSection(),
      accountSection(),
    );
  },
};

// ---------- wiring ----------

$("connect-form").addEventListener("submit", (e) => {
  e.preventDefault();
  useToken($("token").value);
  $("token").value = "";
  start();
});
$("google-signin").addEventListener("click", async () => {
  $("google-signin").disabled = true;
  try { await signInWithGoogle(); } catch (err) { showConnect(err.message); $("google-signin").disabled = false; }
});

for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => setView(t.dataset.view));
$("coach-stat").addEventListener("click", () => setView("tracker"));
$("settings-btn").addEventListener("click", () => openSheet("settings"));
$("quick").addEventListener("click", () => openSheet("quick"));
$("photo").addEventListener("click", () => $("photo-input").click());
$("photo-input").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if ($("view-coach").hidden) setView("coach");
  sendPhoto(file);
});
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
  if (!text.trim() || state.sending) { send(text); return; }
  $("input").value = "";
  autosize();
  send(text);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden || !signedIn()) return;
  refresh();
  // The workout check posts into chat on its own, so pick that up when the app comes back.
  if (!state.sending) loadHistory();
});

/** A new account goes through the interview before the coach opens. Asked once per device. */
async function ensureOnboarded() {
  if (store.get(ONBOARDED_KEY, false)) return true;
  let account;
  try { account = await api("/account"); } catch (err) { return !/Signed out|Invite only/.test(err.message); }
  if (!account.onboarded) {
    $("connect").hidden = true;
    $("shell").hidden = true;
    $("onboarding").hidden = false;
    await runOnboarding($("onboarding"), { api, el, toast });
    $("onboarding").hidden = true;
  }
  store.set(ONBOARDED_KEY, true);
  return true;
}

async function start() {
  if (!(await ensureOnboarded())) return;
  showShell();
  $("greeting").textContent = greeting();
  setView(location.hash === "#tracker" ? "tracker" : "coach");
  renderChips(null);
  const cachedChat = store.get(CHAT_CACHE_KEY, null);
  if (Array.isArray(cachedChat)) renderHistory(cachedChat);
  const cachedDays = store.get(HISTORY_CACHE_KEY, null);
  if (cachedDays?.days?.length) state.history = cachedDays;
  const cachedSnap = store.get(SNAPSHOT_CACHE_KEY, null);
  if (cachedSnap) {
    try { state.snapshot = cachedSnap; renderSnapshot(cachedSnap); } catch { state.snapshot = null; }
  }
  if (state.history) { try { renderDays(); } catch { state.history = null; } }
  const cachedUsual = store.get(USUAL_CACHE_KEY, null);
  if (Array.isArray(cachedUsual)) { state.usual = cachedUsual; renderChips(state.snapshot); }
  loadHistory();
  refresh();
  flushQueue();
}

window.addEventListener("online", flushQueue);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});
}

const redirectError = captureRedirect();
if (redirectError) showConnect(redirectError);
else if (signedIn()) start();
else showConnect();
