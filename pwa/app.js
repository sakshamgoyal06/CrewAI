// Magnus health app. Four tabs: Coach chat (home), Today, Progress and You (settings). All write through
// the same /api/health endpoints, so anything logged in one shows up in the other.

import { SESSION_ID, trackApi } from "./telemetry.js";
import { runOnboarding } from "./onboarding.js";
import { scanView } from "./scan.js";
import { foodPrefsEditor } from "./foodprefs.js";
import { fromServer, routineEditor, toPayload } from "./routine.js";
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
// Set when the PWA is opened from the Android app (its launch URL carries ?src=android).
const ANDROID_KEY = "magnus-android";
const ONBOARDED_KEY = "magnus-onboarded";

// ---------- API ----------

// Logs that are safe to replay (each is an upsert or idempotent) wait here when the phone is offline.
const QUEUE_KEY = "magnus-offline-queue";
const QUEUEABLE = [/^\/steps$/, /^\/checkins$/, /^\/meals\/confirm$/, /^\/workout-check$/, /^\/activities$/];

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
    barcode_not_found: "That barcode isn't in the food database yet. Type what it was instead, or snap a photo of the label.",
    barcode_lookup_failed: "Couldn't reach the food database just now. Try again in a minute, or type what you had.",
    free_limit: "That's today's free allowance. Upgrade to Pro in Settings for unlimited coaching, or log from Today.",
    billing_unavailable: "Payments aren't available right now. Try again later.",
    invalid_signature: "The payment couldn't be verified. If you were charged, it will show up within a few minutes.",
    daily_limit: "You've hit today's limit for the coach. Log from Today, or try again tomorrow.",
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

const VIEWS = ["coach", "today", "progress", "you"];
/** Old links (and the Android app) still say #tracker; that page is now Today. */
const viewFromHash = (h) => { const v = h.replace("#", ""); return v === "tracker" ? "today" : VIEWS.includes(v) ? v : "coach"; };

function setView(view) {
  if (!VIEWS.includes(view)) view = "coach";
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  for (const t of document.querySelectorAll(".tab")) {
    t.classList.toggle("active", t.dataset.view === view);
    t.setAttribute("aria-current", t.dataset.view === view ? "page" : "false");
  }
  if (view !== "coach") document.body.classList.remove("typing");
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  if (view !== "coach") window.scrollTo(0, 0);
  if (view === "today" || view === "progress") {
    // Hevy history is several slow calls; only fetch it once a tracker page is actually opened.
    if (!state.trainingLoaded) { state.trainingLoaded = true; loadTraining(); loadDays(); loadReview(); }
    else if (view === "progress" && state.history) requestAnimationFrame(renderTrend);
    // The strip may have been drawn while this page was hidden, when it had no width to scroll.
    if (view === "today" && state.history) requestAnimationFrame(() => renderStrip(state.selectedDate === todayKey()));
  }
  if (view === "you") renderYou();
}

/** The You page: who's signed in and one-line summaries under each settings row. */
function renderYou() {
  const s = state.snapshot;
  const g = s?.goal;
  $("you-goal").textContent = g
    ? [g.goal.targets.weight_kg != null ? `${fmt(g.goal.targets.weight_kg, 1)} kg` : null, g.goal.targets.body_fat_pct != null ? `${fmt(g.goal.targets.body_fat_pct, 1)}% fat` : null,
       `by ${dateOf(g.goal.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`].filter(Boolean).join(" · ")
    : "Set a target and a deadline";
  const r = s?.routine || [];
  $("you-routine").textContent = r.length ? r.map((i) => i.label).join(" · ") : "Walks, gym, swims, sports and reminders";
  if (!renderYou.loaded) {
    renderYou.loaded = true;
    api("/account").then((a) => { $("you-who").textContent = a.email || a.name || "Signed in"; }).catch(() => { renderYou.loaded = false; });
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
  if (!$("view-you").hidden) renderYou();
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
    steps: s.today.steps, walkMinutes: s.today.walkMinutes, burn: null, workouts: [], activities: [], sportCounted: null, trainedUnlogged: false, routine: s.today.routine || [], partial: true,
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
  $("move-meta").textContent = d.routine?.length
    ? `${d.routine.filter((r) => r.state === "done").length}/${d.routine.length} done`
    : isToday && d.isTrainingDay && s?.gym?.time ? `Gym ${clock(s.gym.time)}` : d.isTrainingDay ? "Training day" : "Rest day";
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
    tile("Workout", d.workouts.length ? fmt(mins) : d.trainedUnlogged || d.sportCounted ? "✓" : "–", d.workouts.length ? "min" : null,
      d.workouts.length ? `${fmt(d.workouts.reduce((a, w) => a + w.volumeKg, 0))} kg lifted` : d.trainedUnlogged ? "not in Hevy" : d.sportCounted ? d.sportCounted.split(" · ")[0] : d.isTrainingDay ? "none logged" : "rest", null),
  );
  renderRoutineToday(d);
  renderBurnBreakdown(d);
  renderActivities(d);
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
          : d.sportCounted ? `No gym today. ${d.sportCounted.split(" · ")[0]} counted as training.`
          : d.partial ? "Loading workouts…"
          : "No workout logged.")]),
  );
}

/** The routine items planned that day, ticked off as they're logged; non-gym ones can be marked done here. */
function renderRoutineToday(d) {
  const list = $("routine-today");
  const items = d.routine || [];
  list.hidden = !items.length;
  $("routine-edit").textContent = (state.snapshot?.routine || []).length ? "Edit routine" : "Set your routine: walks, gym, swims, sports";
  const today = state.history?.today;
  list.replaceChildren(...items.map((r) => {
    const mark = r.state === "done" ? "✓" : r.state === "skipped" ? "–" : "";
    let action = null;
    if (r.state === "pending" && !r.gym) {
      action = el("button", { class: "btn", type: "button" }, "Done");
      action.addEventListener("click", async () => {
        action.disabled = true;
        try { await answerRoutine({ itemId: r.itemId, date: d.date, answer: "done" }); toast(`${r.label} logged.`); }
        catch (err) { action.disabled = false; toast(err.message); }
      });
    }
    const sub = r.state === "pending"
      ? (r.gym ? `${r.detail} · log it in Hevy` : `${r.detail} · ${r.durationMin} min`)
      : r.detail;
    return el("li", { class: r.state },
      el("span", { class: "mark", "aria-hidden": "true" }, mark),
      el("span", { class: "main" }, el("span", { class: "title" }, r.label), el("span", { class: "sub" }, sub)),
      !today || d.date <= today ? action : null);
  }));
}

/** Steps + gym + each activity, so the Burned number explains itself. */
function renderBurnBreakdown(d) {
  const box = $("burn-breakdown");
  const b = d.burn;
  if (!b || (!b.activities?.length && b.source !== "estimate")) { box.hidden = true; return; }
  const parts = [];
  if (b.source === "health_connect") parts.push(["Phone", b.kcal - (b.activityKcal || 0)]);
  else {
    if (b.stepsKcal) parts.push(["Steps", b.stepsKcal]);
    if (b.workoutKcal) parts.push(["Gym", b.workoutKcal]);
  }
  for (const l of b.activities || []) if (l.counted) parts.push([l.label, b.source === "health_connect" ? null : l.kcal]);
  if (b.source === "health_connect" && b.activityKcal) parts.push(["not seen by phone", b.activityKcal]);
  const shown = parts.filter(([, v]) => v !== 0);
  if (shown.length < 2) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(...shown.flatMap(([k, v], i) => [i ? " · " : "", `${k} `, v == null ? "" : el("b", {}, fmt(v))]), ` = ${fmt(b.kcal)} kcal`);
}

const ACT_SRC = { health_connect: "Health Connect", chat: "chat", quick_add: "added" };

function renderActivities(d) {
  const list = d.activities || [];
  $("activities").replaceChildren(...list.map((a) =>
    expander(`act:${a.id}`,
      [
        el("span", { class: "main" },
          el("span", { class: "title" }, a.label, a.source === "health_connect" ? el("span", { class: "tag-src" }, "from phone") : null),
          el("span", { class: "sub" }, [a.startTime ? timeOf(a.startTime) : null, `${a.durationMin} min`, a.intensity !== "moderate" ? a.intensity : null, a.distanceM ? `${fmt(a.distanceM / 1000, 1)} km` : null].filter(Boolean).join(" · ")),
        ),
        el("span", { class: "right" }, el("b", {}, a.counted ? fmt(a.kcal) : "–"), el("small", {}, " kcal")),
      ],
      () => [
        el("p", { class: "hint" },
          !a.counted
            ? a.why === "duplicate_hevy" ? "Same session as your Hevy workout, so it isn't counted twice." : "Health Connect already has this session, so it isn't counted twice."
            : a.kcalSource === "device" ? "Calories from your phone or watch." : a.kcalSource === "user" ? "Calories you entered." : "Estimated from the activity, how long and how hard, and your weight.",
          d.sportCounted && d.sportCounted.startsWith(a.label) ? " Counted as the day's training." : ""),
        el("div", { class: "row-actions" },
          el("button", { class: "link danger", type: "button", onclick: () => deleteActivity(a) }, "Remove")),
      ])));
  $("activities").querySelectorAll("li.row").forEach((li, i) => { if (list[i] && !list[i].counted) li.classList.add("not-counted"); });
}

async function deleteActivity(a) {
  try {
    await api(`/activities/${a.id}`, { method: "DELETE" });
    toast(`Removed ${a.label.toLowerCase()}.`);
    refresh();
  } catch (err) {
    toast(err.message);
  }
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
      if (!withBurn.length) return ["Nothing to show yet.", "Burn comes from steps, workouts and activities."];
      const avg = withBurn.reduce((a, d) => a + d.burn.kcal, 0) / withBurn.length;
      return [`${fmt(avg)} kcal`, "active calories, daily average"];
    },
    tip: (d) => (d.burn ? [`${fmt(d.burn.kcal)} kcal`, d.burn.source === "estimate" ? `est. · steps ${fmt(d.burn.stepsKcal)} + gym ${fmt(d.burn.workoutKcal)}${d.burn.activityKcal ? ` + sport ${fmt(d.burn.activityKcal)}` : ""}` : `Health Connect${d.burn.activityKcal ? ` + ${fmt(d.burn.activityKcal)} logged` : ""}`] : ["No data"]),
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

/** Suggestions for the empty chat and the Log sheet. Kept off the composer so typing has room. */
function suggestions(s) {
  const h = new Date().getHours();
  const meal = h < 11 ? "breakfast" : h < 16 ? "lunch" : "dinner";
  return [
    [`Log ${meal}`, "I had "],
    s?.goal?.checkinDue || (s && !s.goal && !s.checkins.length) ? ["Weekly weigh-in", "Weigh-in: "] : null,
    ["How am I doing?", "How am I doing this week?"],
    !s?.goal ? ["Set my goal", "I want to reach "] : ["Why am I off track?", "Why am I off track this week, and what should I change?"],
  ].filter(Boolean);
}

/** Questions send straight away; the rest pre-fill the composer for the person to finish. */
function useSuggestion(text) {
  closeSheet();
  if ($("view-coach").hidden) setView("coach");
  if (text.endsWith("?")) { send(text); return; }
  const input = $("input");
  input.value = text;
  input.focus();
  autosize();
}

function renderChips(s) {
  state.suggest = suggestions(s);
  if ($("thread").querySelector(".empty")) renderEmpty();
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
      el("h2", { class: "display" }, "What did you eat, walk or lift today?"),
      el("p", {}, "Tell me in plain words. I'll log it, keep your week on track, and tell you what's slipping."),
      el("div", { class: "suggest" },
        ...(state.suggest || suggestions(state.snapshot)).map(([label, text]) =>
          el("button", { type: "button", onclick: () => useSuggestion(text) }, label))),
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

// ---------- weekly review ----------

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

function weeklyReviewView(r) {
  const w = r.week;
  const p = r.previous;
  const delta = (cur, prev, unit = "") => {
    if (prev == null || cur == null) return null;
    const d = Math.round(cur - prev);
    return d === 0 ? "same as last week" : `${d > 0 ? "+" : "−"}${fmt(Math.abs(d))}${unit} vs last week`;
  };
  const stat = (label, value, target, sub) => el("div", { class: "review-stat" },
    el("small", {}, label),
    el("strong", {}, value),
    target ? el("span", { class: "hint" }, target) : null,
    sub ? el("span", { class: "hint" }, sub) : null);
  const t = r.targets;
  const out = [
    el("p", { class: "review-headline" }, r.headline),
    el("div", { class: "review-days" }, ...r.days.map((d) => el("span", { class: `review-day${d.onTrack ? " on" : ""}`, title: d.date },
      el("i", {}), el("small", {}, WEEKDAY_LETTERS[d.weekday])))),
    el("div", { class: "review-grid" },
      stat("On-track days", `${w.onTrackDays} / 7`, `goal ${r.onTrackGoal}`, p ? delta(w.onTrackDays, p.onTrackDays) : null),
      stat("Avg calories", w.avgCalories == null ? "–" : fmt(w.avgCalories), t.calorieTarget ? `target ${fmt(t.calorieTarget)}` : null, `${w.daysLogged} of 7 days logged`),
      stat("Avg protein", w.avgProteinG == null ? "–" : `${w.avgProteinG} g`, t.proteinTarget ? `target ${t.proteinTarget} g` : null, p ? delta(w.avgProteinG, p.avgProteinG, " g") : null),
      stat("Avg steps", fmt(w.avgSteps), `target ${fmt(t.stepTarget)}`, p ? delta(w.avgSteps, p.avgSteps) : null),
      stat("Workouts", `${w.workouts}`, w.plannedWorkouts ? `${w.plannedWorkouts} planned` : null, null),
    ),
  ];
  if (r.activityLine) out.push(el("p", { class: "section-label" }, "Outside the gym"), el("p", { class: "hint" }, r.activityLine));
  if (r.goal) {
    out.push(el("p", { class: "section-label" }, `Goal · ${r.goal.weeksLeft} weeks left`));
    for (const m of r.goal.metrics) {
      const pace = { ahead: "Ahead of pace", on_pace: "On pace", behind: "Behind pace", reached: "Reached", not_enough_data: "Need more weigh-ins" }[m.pace] || m.pace;
      const per = (v) => (v == null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v * 100) / 100} ${m.unit}/wk`);
      out.push(el("div", { class: `review-goal ${m.pace}` },
        el("div", { class: "row-between" }, el("strong", {}, `${m.label}: ${m.latest ?? "–"} → ${m.target} ${m.unit}`), el("span", { class: "tag" }, pace)),
        el("span", { class: "hint" }, `Needed ${per(m.requiredPerWeek)} · actual ${per(m.actualPerWeek)}${m.projectedDate ? ` · on this trend you get there ${new Date(m.projectedDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : ""}`)));
    }
    if (r.goal.checkinDue) out.push(el("button", { class: "btn block", type: "button", onclick: () => openSheet("checkin") }, "Log this week's weigh-in"));
  }
  out.push(
    el("p", { class: "section-label" }, "Next week's one thing"),
    el("p", { class: "review-focus" }, r.focus),
    el("button", { class: "btn primary block", type: "button", onclick: () => { closeSheet(); setView("coach"); $("input").value = "Let's go over my week. What should I change?"; autosize(); $("input").focus(); } }, "Talk it through with the coach"),
  );
  return out;
}

async function sendBarcode(code, grams) {
  await coachTurn(
    () => { addMessage("user", `▥ Scanned barcode ${code}${grams ? ` (${grams} g)` : ""}`); scrollThread(); },
    () => api("/meals/barcode", { method: "POST", body: JSON.stringify({ code, grams }) }),
  );
}

function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${Math.min(140, t.scrollHeight)}px`;
  // Camera when empty, send once there's text: one action at a time on the right.
  $("composer").classList.toggle("has-text", !!t.value.trim());
}

function appendCard(c) {
  if (c.type === "meal_draft") $("thread").append(mealDraftCard(c.draft));
  else if (c.type === "activity_draft") $("thread").append(activityDraftCard(c.draft));
  else if (c.type === "workout_check") $("thread").append(workoutCheckCard(c));
  else if (c.type === "routine_check") $("thread").append(routineCheckCard(c));
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
    // Older reports stored the hypothesis as their first piece of evidence too.
    const evidence = (cur.evidence || []).filter((t) => t !== cur.hypothesis);
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
      evidence.length ? el("ul", { class: "changes evidence" }, ...evidence.map((t) => el("li", { class: "info" }, el("span", { class: "sign" }, "·"), el("span", {}, t)))) : null,
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
  ["routine_reminder", "Routine reminders"],
  ["routine_check", "Routine follow-ups"],
  ["workout_check", "Workout check"],
  ["evening_wrap", "Evening wrap"],
  ["weigh_in", "Weekly weigh-in"],
  ["rca", "Root-cause reviews"],
];

/** Settings: the weekly routine. Saving replaces it, and training days follow from it. */
function routineSection({ heading = true } = {}) {
  const items = fromServer(state.snapshot?.routine || []);
  let dirty = false;
  const save = el("button", { class: "btn block", type: "button", disabled: "" }, "Save routine");
  const editor = routineEditor(el, items, () => { dirty = true; save.disabled = false; });
  save.addEventListener("click", async () => {
    if (items.some((i) => !i.days.length)) { toast("Each activity needs at least one day."); return; }
    if (items.some((i) => i.activity === "other" && !i.label.trim())) { toast("Name the activity marked 'Something else'."); return; }
    save.disabled = true;
    try {
      const r = await api("/routine", { method: "PUT", body: JSON.stringify(toPayload(items)) });
      dirty = false;
      toast(r.lifting?.short ? `Saved. Your plan wants ${r.lifting.need} gym days a week.` : "Routine saved.");
      refresh();
      if (!heading) closeSheet();
    } catch (err) {
      save.disabled = !dirty;
      toast(err.message.includes("routine_unavailable") ? "Routines need a quick database update first." : err.message);
    }
  });
  return el("div", { class: "stack" },
    heading ? el("p", { class: "section-label" }, "Your routine") : null,
    el("p", { class: "hint" }, "I remind you before each one, tick it off when it's logged (Hevy for the gym, Health Connect or a tap for the rest), and ask if it's missing."),
    editor,
    save);
}

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
// ---------- plan & billing ----------

let razorpayLoad = null;
function loadRazorpay() {
  razorpayLoad ??= new Promise((resolve, reject) => {
    const s = el("script", { src: "https://checkout.razorpay.com/v1/checkout.js" });
    s.onload = () => resolve(window.Razorpay);
    s.onerror = () => { razorpayLoad = null; reject(new Error("Couldn't load the payment screen. Check your connection.")); };
    document.head.append(s);
  });
  return razorpayLoad;
}

async function upgrade(planId) {
  const [Razorpay, sub] = await Promise.all([
    loadRazorpay(),
    api("/billing/razorpay/subscribe", { method: "POST", body: JSON.stringify({ plan: planId }) }),
  ]);
  await new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: sub.keyId,
      subscription_id: sub.subscriptionId,
      name: "Magnus Pro",
      description: planId === "yearly" ? "Yearly plan" : "Monthly plan",
      theme: { color: "#d9b26f" },
      handler: async (resp) => {
        try {
          await api("/billing/razorpay/confirm", { method: "POST", body: JSON.stringify(resp) });
          toast("Welcome to Magnus Pro.");
          resolve();
        } catch (err) { reject(err); }
      },
      modal: { ondismiss: () => resolve() },
    });
    rzp.on("payment.failed", (e) => reject(new Error(e?.error?.description || "The payment didn't go through.")));
    rzp.open();
  });
}

function planSection(box) {
  const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
  async function paint() {
    let b;
    try { b = await api("/billing"); } catch { box.replaceChildren(); return; }
    if (!b.enabled) { box.replaceChildren(); return; }
    const e = b.entitlement;
    const buy = (planId) => el("button", { class: planId === "yearly" ? "btn primary block" : "btn block", type: "button", onclick: async (ev) => {
      ev.target.disabled = true;
      try { await upgrade(planId); paint(); } catch (err) { toast(err.message); }
      ev.target.disabled = false;
    } }, planId === "yearly" ? `Yearly · ${b.prices.yearly}` : `Monthly · ${b.prices.monthly}`);
    const rows = [el("p", { class: "section-label" }, "Plan")];
    if (e.tier === "pro") {
      const until = e.periodEndsAt ? new Date(e.periodEndsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
      rows.push(el("p", { class: "hint" }, e.status === "cancelled" && until ? `Magnus Pro until ${until}. It won't renew.` : until ? `Magnus Pro. Renews ${until}.` : "Magnus Pro."));
      if (e.provider === "razorpay" && e.status === "active") {
        rows.push(el("button", { class: "link danger", type: "button", onclick: async () => {
          if (!confirm("Cancel Magnus Pro? You keep it until the end of the period you paid for.")) return;
          try { await api("/billing/cancel", { method: "POST" }); toast("Cancelled. Pro stays on until the period ends."); paint(); } catch (err) { toast(err.message); }
        } }, "Cancel subscription"));
      }
    } else {
      rows.push(el("p", { class: "hint" }, e.tier === "trial"
        ? `Free trial: ${daysLeft(e.trialEndsAt)} days left of everything. After it, the free plan has ${b.freeLimits.chat} coach messages and ${b.freeLimits.photo} meal photo a day.`
        : `Free plan: ${b.freeLimits.chat} coach messages and ${b.freeLimits.photo} meal photo a day. Pro has no daily limit worth worrying about, plus the weekly review and adaptive targets.`));
      if (b.razorpay) rows.push(buy("yearly"), buy("monthly"));
    }
    box.replaceChildren(...rows);
  }
  paint();
}

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
  const plan = el("div", { class: "stack" });
  planSection(plan);
  const food = el("div", { class: "stack" });
  wrap.append(who, plan, el("p", { class: "section-label" }, "Food"), food, el("p", { class: "section-label" }, "Hevy"), hevy, el("p", { class: "section-label" }, "Health Connect"), hc,
    el("p", { class: "section-label" }, "Your data"), el("p", { class: "hint" }, "Your data is yours: download all of it, or delete it for good."), el("div", { class: "row-between" }, download, remove), out);

  function paintFood(prefs) {
    if (!prefs) { food.replaceChildren(); return; }
    const value = { diet: prefs.diet, dietNote: prefs.dietNote || "", foodAvoid: [...(prefs.foodAvoid || [])] };
    const save = el("button", { class: "btn block", type: "button", disabled: true, onclick: async () => {
      if (value.diet === "custom" && !value.dietNote.trim()) { toast("Describe how you eat."); return; }
      save.disabled = true;
      try {
        await api("/account/food", { method: "PUT", body: JSON.stringify({ diet: value.diet || "non_vegetarian", dietNote: value.diet === "custom" ? value.dietNote.trim() : null, foodAvoid: value.foodAvoid }) });
        toast("Saved. The coach will stick to it.");
      } catch (err) { toast(err.message); save.disabled = false; }
    } }, "Save food preferences");
    food.replaceChildren(foodPrefsEditor(el, value, () => { save.disabled = false; }), save);
  }

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
    const inAndroidApp = store.get(ANDROID_KEY, false);
    if (inAndroidApp) {
      hc.replaceChildren(
        el("p", { class: "hint" }, "Steps, walks, workouts' calories and scale readings sync from Health Connect every hour."),
        ...list,
        el("button", { class: "btn primary block", type: "button", onclick: async (e) => {
          e.target.disabled = true;
          try {
            const r = await api("/account/tokens", { method: "POST", body: JSON.stringify({ label: "Android app" }) });
            // Hands the token to the native side, which asks for Health Connect access and syncs.
            location.href = `intent://connect?token=${encodeURIComponent(r.token)}#Intent;scheme=magnus;package=app.magnus.health;end`;
          } catch (err) { toast(err.message); }
          e.target.disabled = false;
        } }, tokens.some((t) => t.label === "Android app") ? "Reconnect Health Connect" : "Connect Health Connect"),
      );
      return;
    }
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
      paintFood(a.food);
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
        cur.status === "found" && cur.reason ? `✓ ${cur.reason} counted as training` :
        cur.status === "found" ? "✓ Workout found in Hevy" :
        cur.status === "trained_unlogged" ? "✓ Trained, not logged in Hevy" :
        `Skipped${cur.reason ? ` · ${cur.reason}` : ""}`;
      card.replaceChildren(el("div", { class: cur.status === "skipped" ? "muted" : "done-line" }, `${line} · ${day}`));
      return;
    }
    const recheck = el("button", { class: "btn", type: "button" }, "Check Hevy again");
    const trained = el("button", { class: "btn", type: "button" }, "Trained, didn't log");
    const skipped = el("button", { class: "btn primary", type: "button" }, "Skipped");
    const other = el("button", { class: "btn", type: "button", onclick: () => { state.activityDate = cur.date; openSheet("activity"); } }, "Did something else");
    const buttons = [recheck, trained, skipped, other];
    recheck.addEventListener("click", () => answer({ answer: "recheck" }, buttons));
    trained.addEventListener("click", () => answer({ answer: "trained_unlogged" }, buttons));
    const reasons = el("div", { class: "reasons", hidden: true });
    skipped.addEventListener("click", () => { reasons.hidden = !reasons.hidden; });
    const otherReason = el("input", { class: "field", placeholder: "Other reason", maxlength: "300" });
    reasons.append(
      el("p", { class: "draft-note" }, "What got in the way? This feeds the weekly review."),
      el("div", { class: "chips wrap" },
        ...SKIP_REASONS.map((r) => el("button", { class: "chip", type: "button", onclick: (e) => answer({ answer: "skipped", reason: r }, [...buttons, ...reasons.querySelectorAll("button")]) }, r))),
      el("form", { class: "reason-other", onsubmit: (e) => { e.preventDefault(); answer({ answer: "skipped", reason: otherReason.value.trim() || undefined }, [...buttons, ...reasons.querySelectorAll("button")]); } },
        otherReason, el("button", { class: "btn", type: "submit" }, "Save")),
    );
    card.className = "draft check";
    card.replaceChildren(
      el("p", { class: "eyebrow" }, `Workout check · ${day}`),
      el("p", { class: "check-line" }, `Nothing in Hevy after your ${clock(cur.gymTime)} slot.`),
      el("div", { class: "draft-actions" }, recheck, trained),
      el("div", { class: "draft-actions" }, other, skipped),
      reasons,
    );
  }

  render(c);
  return card;
}

// ---------- routine follow-up card ----------

/** The routine item's state on a day, from the tracker's history, if it's loaded. */
function routineStateOn(date, itemId) {
  const day = state.history?.days?.find((x) => x.date === date);
  return day?.routine?.find((r) => r.itemId === itemId) ?? null;
}

async function answerRoutine(body) {
  const r = await api("/routine/check", { method: "POST", body: JSON.stringify(body) });
  refresh();
  return r;
}

/** Asked after a routine slot (walk, swim, sport) passes with nothing logged for it. */
function routineCheckCard(c) {
  const card = el("div", { class: "draft check" });
  const day = `${WD_LONG[dateOf(c.date).getUTCDay()]} ${dateOf(c.date).getUTCDate()}`;
  const known = routineStateOn(c.date, c.itemId);
  let cur = { ...c, status: known?.state === "done" ? "done" : known?.state === "skipped" ? "skipped" : c.status, reason: c.reason ?? null };

  async function answer(body, buttons) {
    for (const b of buttons) b.disabled = true;
    try {
      const r = await answerRoutine({ itemId: c.itemId, date: c.date, ...body });
      if (r.status === "missing") {
        toast("Nothing logged for it yet.");
        for (const b of buttons) b.disabled = false;
        return;
      }
      cur = { ...cur, status: r.status, reason: body.reason ?? null, durationMin: body.durationMin ?? cur.durationMin };
      render();
    } catch (err) {
      for (const b of buttons) b.disabled = false;
      toast(err.message);
    }
  }

  function render() {
    if (cur.status !== "missing") {
      card.className = "draft done";
      card.replaceChildren(el("div", { class: cur.status === "skipped" ? "muted" : "done-line" },
        cur.status === "done" ? `✓ ${cur.label} · ${cur.durationMin} min · ${day}` : `Skipped ${cur.label.toLowerCase()}${cur.reason ? ` · ${cur.reason}` : ""} · ${day}`));
      return;
    }
    const done = el("button", { class: "btn primary", type: "button" }, `Done · ${cur.durationMin} min`);
    const mins = el("input", { class: "field", type: "number", inputmode: "numeric", min: "1", max: "600", placeholder: "Minutes", "aria-label": "Minutes done" });
    const shorter = el("form", { class: "reason-other", hidden: true, onsubmit: (e) => { e.preventDefault(); const m = Number(mins.value); if (m > 0) answer({ answer: "done", durationMin: m }, all()); } },
      mins, el("button", { class: "btn", type: "submit" }, "Save"));
    const other = el("button", { class: "btn", type: "button", onclick: () => { shorter.hidden = !shorter.hidden; if (!shorter.hidden) mins.focus(); } }, "Different length");
    const skipped = el("button", { class: "btn", type: "button" }, "Skipped");
    const instead = el("button", { class: "link", type: "button", onclick: () => { state.activityDate = cur.date; openSheet("activity"); } }, "Did something else instead");
    const reasons = el("div", { class: "reasons", hidden: true });
    const otherReason = el("input", { class: "field", placeholder: "Other reason", maxlength: "300" });
    const all = () => [done, other, skipped, ...card.querySelectorAll("form button, .reasons button")];
    done.addEventListener("click", () => answer({ answer: "done" }, all()));
    skipped.addEventListener("click", () => { reasons.hidden = !reasons.hidden; });
    reasons.append(
      el("p", { class: "draft-note" }, "What got in the way? This feeds the weekly review."),
      el("div", { class: "chips wrap" },
        ...SKIP_REASONS.map((r) => el("button", { class: "chip", type: "button", onclick: () => answer({ answer: "skipped", reason: r }, all()) }, r))),
      el("form", { class: "reason-other", onsubmit: (e) => { e.preventDefault(); answer({ answer: "skipped", reason: otherReason.value.trim() || undefined }, all()); } },
        otherReason, el("button", { class: "btn", type: "submit" }, "Save")),
    );
    card.className = "draft check";
    card.replaceChildren(
      el("p", { class: "eyebrow" }, `Routine · ${day}`),
      el("p", { class: "check-line" }, `${cur.label}${cur.startTime ? ` at ${clock(cur.startTime)}` : ""}: nothing logged yet.`),
      el("div", { class: "draft-actions" }, done),
      el("div", { class: "draft-actions" }, other, skipped),
      shorter,
      reasons,
      el("div", { class: "row-actions" }, instead),
    );
  }

  render();
  return card;
}

// ---------- activity draft card ----------

/** An activity's estimate: change minutes or effort and it re-estimates; Save logs it once. */
function activityDraftCard(draft, { onDone } = {}) {
  const status = confirmedDrafts()[draft.draftId];
  const card = el("div", { class: "draft" });
  const label = draft.label;
  const finish = (st) => {
    card.className = "draft done";
    card.replaceChildren(st.state === "logged"
      ? el("div", { class: "done-line" }, `✓ Saved · ${label} · ${st.durationMin ?? draft.durationMin} min · ${fmt(st.kcal)} kcal`)
      : el("div", { class: "muted" }, `Discarded · ${label}`));
    return card;
  };
  if (status) return finish(status);

  let cur = { ...draft };
  const kcal = el("div", { class: "draft-kcal" });
  const meta = el("div", { class: "macros" });
  const note = el("p", { class: "training-note" });
  const mins = el("input", { class: "field", type: "number", inputmode: "numeric", min: "1", max: "1440", value: String(draft.durationMin), "aria-label": "Minutes" });
  const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "How hard" });
  const save = el("button", { class: "btn primary", type: "button" }, draft.duplicateOf ? "Save as separate session" : "Save");

  function paint() {
    kcal.replaceChildren(fmt(cur.kcal), el("small", {}, "kcal"));
    meta.replaceChildren(...[
      el("span", {}, el("b", {}, label)),
      el("span", {}, `${cur.durationMin} min`),
      cur.distanceM ? el("span", {}, `${fmt(cur.distanceM / 1000, 1)} km`) : null,
      el("span", {}, cur.kcalSource === "user" ? "your number" : "estimated"),
    ].filter(Boolean));
    const t = cur.training || {};
    note.hidden = !t.note && !cur.duplicateOf;
    note.className = `training-note${t.short ? " warn" : t.countsAsTraining ? " ok" : ""}`;
    note.textContent = cur.duplicateOf
      ? `Health Connect already has ${cur.duplicateOf.label.toLowerCase()} that day (${cur.duplicateOf.durationMin} min, ${fmt(cur.duplicateOf.kcal)} kcal). Only save this if it was a different session.`
      : t.note || "";
    seg.replaceChildren(...[["easy", "Easy"], ["moderate", "Moderate"], ["hard", "Hard"]].map(([k, l]) =>
      el("button", { type: "button", class: k === cur.intensity ? "on" : "", role: "radio", "aria-checked": String(k === cur.intensity), onclick: () => { cur.intensity = k; reestimate(); } }, l)));
  }

  let timer = null;
  function reestimate() {
    paint();
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const r = await api("/activities/draft", { method: "POST", body: JSON.stringify({
          activity: cur.key === "other" ? label : cur.key, durationMin: cur.durationMin, intensity: cur.intensity,
          distanceKm: cur.distanceM ? cur.distanceM / 1000 : undefined, kcal: cur.kcalSource === "user" ? cur.kcal : undefined,
          date: cur.date, source: cur.source,
        }) });
        cur = { ...cur, kcal: r.kcal, met: r.met, training: r.training, duplicateOf: r.duplicateOf };
        paint();
      } catch { /* keep the last estimate */ }
    }, 300);
  }
  mins.addEventListener("input", () => {
    const v = parseInt(mins.value, 10);
    if (v >= 1 && v <= 1440) { cur.durationMin = v; reestimate(); }
  });

  save.addEventListener("click", async () => {
    save.disabled = true;
    save.textContent = "Saving…";
    try {
      const r = await api("/activities", { method: "POST", body: JSON.stringify({
        draftId: draft.draftId, date: cur.date, startTime: cur.startTime, durationMin: cur.durationMin, key: cur.key, label,
        intensity: cur.intensity, distanceM: cur.distanceM, kcal: cur.kcalSource === "user" ? cur.kcal : undefined,
        kcalSource: cur.kcalSource === "user" ? "user" : "estimate", source: cur.source, separateSession: Boolean(cur.duplicateOf),
      }) });
      const done = { state: "logged", kcal: r.activity?.kcal ?? cur.kcal, durationMin: cur.durationMin };
      markDraft(draft.draftId, done);
      finish(done);
      toast(r.alreadySaved ? "Already saved." : `Saved ${fmt(done.kcal)} kcal burned.`);
      refresh();
      if (r.training?.note && cur.source !== "chat") setTimeout(loadHistory, 600);
      onDone?.();
    } catch (err) {
      save.disabled = false;
      save.textContent = "Save";
      toast(err.message);
    }
  });
  const discard = el("button", { class: "btn", type: "button", onclick: () => { markDraft(draft.draftId, { state: "discarded" }); finish({ state: "discarded" }); onDone?.(); } }, "Discard");

  card.append(
    el("p", { class: "eyebrow" }, `Activity · ${draft.date === todayKey() ? "today" : shortDate(draft.date)} · check and save`),
    kcal, meta,
    el("div", { class: "stepper" },
      el("button", { type: "button", "aria-label": "5 minutes less", onclick: () => { cur.durationMin = Math.max(5, cur.durationMin - 5); mins.value = String(cur.durationMin); reestimate(); } }, "−"),
      mins,
      el("button", { type: "button", "aria-label": "5 minutes more", onclick: () => { cur.durationMin = Math.min(1440, cur.durationMin + 5); mins.value = String(cur.durationMin); reestimate(); } }, "+"),
      el("small", { class: "muted" }, "min")),
    seg,
    note,
    el("div", { class: "draft-actions" }, discard, save),
  );
  paint();
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
  let editing = !draft.estimated || !draft.items.length;

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

  const add = el("button", { class: "add-line", type: "button", onclick: () => { items.push({ name: "", calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }); renderItems(); totals(); list.querySelector("li:last-child input")?.focus(); } }, "+ Add item");
  const edit = el("button", { class: "link", type: "button", onclick: () => { editing = !editing; renderItems(); } }, "Edit");

  function renderItems() {
    // Read-only by default: the estimate in a few quiet lines. Edit opens the table.
    list.className = editing ? "items" : "items-ro";
    add.hidden = !editing;
    edit.textContent = editing ? "Done" : "Edit";
    if (!editing) {
      list.replaceChildren(...items.map((i) => el("li", {}, el("span", {}, i.name || "Unnamed"), el("span", {}, `${fmt(+i.calories || 0)} kcal · ${fmt(+i.protein_g || 0, 1)} g P`))));
      return;
    }
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
    el("div", { class: "draft-top" }, el("p", { class: "eyebrow" }, "Meal estimate"), edit),
    kcal, macros,
    !draft.estimated ? el("p", { class: "draft-note" }, "No estimate found. Enter calories and protein yourself.") : null,
    draft.servingAssumption ? assumptionNote(draft.servingAssumption) : null,
    seg, list, add,
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
  state.sheetCleanup?.();
  state.sheetCleanup = null;
  $("sheet").hidden = true;
  $("scrim").hidden = true;
}

function openSheet(kind) {
  const body = $("sheet-body");
  state.sheetCleanup?.();
  state.sheetCleanup = null;
  const titles = { activity: "Swim, run or sport", meal: "Log a meal", steps: "Steps & walks", checkin: "Weigh-in", settings: "Goal & targets", routine: "Your routine", quick: "Log", scan: "Scan a packet", review: "Your week", notifications: "Notifications", account: "Food, connections & account" };
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
  activity() {
    const date = state.activityDate || null;
    state.activityDate = null;
    const holder = el("div");
    const pick = el("select", { class: "field activity-pick", name: "activity", required: true },
      el("option", { value: "" }, "Loading…"));
    const mins = el("input", { class: "field", name: "mins", type: "number", inputmode: "numeric", min: "1", max: "1440", value: "45", required: true });
    let intensity = "moderate";
    const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": "How hard" });
    const paintSeg = () => seg.replaceChildren(...[["easy", "Easy"], ["moderate", "Moderate"], ["hard", "Hard"]].map(([k, l]) =>
      el("button", { type: "button", class: k === intensity ? "on" : "", role: "radio", "aria-checked": String(k === intensity), onclick: () => { intensity = k; paintSeg(); } }, l)));
    paintSeg();
    const step = (d) => { mins.value = String(Math.max(5, (parseInt(mins.value, 10) || 0) + d)); };
    const recent = el("div", { class: "chips wrap" });
    const form = el("form", { class: "stack", onsubmit: submitter(async (fd) => {
      const body = {
        activity: fd.get("activity"),
        durationMin: num(fd.get("mins")),
        intensity,
        distanceKm: num(fd.get("km")),
        kcal: num(fd.get("kcal")),
        date: date || undefined,
        source: "quick_add",
      };
      const draft = await api("/activities/draft", { method: "POST", body: JSON.stringify(body) });
      form.hidden = true;
      holder.replaceChildren(activityDraftCard(draft, { onDone: () => setTimeout(closeSheet, 700) }));
    }) },
      date ? el("p", { class: "hint" }, `For ${shortDate(date)}`) : null,
      recent,
      el("label", {}, "Activity", pick),
      el("label", {}, "Minutes",
        el("div", { class: "stepper" },
          el("button", { type: "button", "aria-label": "5 minutes less", onclick: () => step(-5) }, "−"),
          mins,
          el("button", { type: "button", "aria-label": "5 minutes more", onclick: () => step(5) }, "+"))),
      el("label", {}, "How hard", seg),
      el("div", { class: "grid2" },
        el("label", {}, "Distance km (optional)", el("input", { class: "field", name: "km", type: "number", step: "0.1", min: "0", inputmode: "decimal" })),
        el("label", {}, "Watch kcal (optional)", el("input", { class: "field", name: "kcal", type: "number", min: "0", inputmode: "numeric" }))),
      el("button", { class: "btn primary block", type: "submit" }, "Estimate"),
      el("p", { class: "hint" }, "Burn shows on Today. Your calorie target stays the same: it already allows for your usual activity."),
    );
    api("/activities/catalog").then((c) => {
      pick.replaceChildren(el("option", { value: "" }, "Choose…"), ...c.activities.map((a) => el("option", { value: a.key }, a.label)));
      recent.replaceChildren(...c.recent.map((r) => el("button", { class: "chip usual", type: "button", onclick: () => {
        pick.value = r.key === "other" ? "" : r.key;
        if (r.key === "other") { pick.append(el("option", { value: r.label, selected: true }, r.label)); }
        mins.value = String(r.durationMin);
        intensity = r.intensity;
        paintSeg();
      } }, `${r.label} · ${r.durationMin} min`)));
    }).catch((err) => toast(err.message));
    return el("div", {}, form, holder);
  },

  quick() {
    const icon = (d) => { const g = svg("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }); g.innerHTML = d; return g; };
    const tile = (label, d, onclick) => el("button", { class: "log-tile", type: "button", onclick }, icon(d), el("span", {}, label));
    return el("div", { class: "stack" },
      el("div", { class: "log-grid" },
        tile("Meal", '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M16 3c-1.7 1-2.5 3-2.5 6s1 4 2.5 4v8"/>', () => openSheet("meal")),
        tile("Photo", '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', () => { closeSheet(); $("photo-input").click(); }),
        tile("Barcode", '<path d="M4 6v12M7 6v12M11 6v12M14 6v12M17 6v12M20 6v12"/>', () => openSheet("scan")),
        tile("Steps", '<path d="M8 4c1.5 0 2.5 2 2.5 4.5S9.5 13 8 13s-2.5-2-2.5-4.5S6.5 4 8 4zM6 16h4v2a2 2 0 0 1-4 0zM16 8c1.5 0 2.5 2 2.5 4.5S17.5 17 16 17s-2.5-2-2.5-4.5S14.5 8 16 8z"/>', () => openSheet("steps")),
        tile("Activity", '<path d="M3 12h4l3-7 4 14 3-7h4"/>', () => openSheet("activity")),
        tile("Weigh-in", '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.2-1.6"/>', () => openSheet("checkin"))),
      (state.usual || []).length
        ? el("div", { class: "usual-list" },
            el("p", { class: "section-label" }, "Again"),
            ...state.usual.slice(0, 3).map((m) => el("button", { class: "usual-row", type: "button", onclick: () => { closeSheet(); if ($("view-coach").hidden) setView("coach"); repeatMeal(m); } },
              el("span", {}, m.text), el("small", {}, `${fmt(m.totals.calories)} kcal`))))
        : null,
      el("p", { class: "section-label" }, "Ask the coach"),
      el("div", { class: "ask-list" }, ...suggestions(state.snapshot).filter(([, t]) => t.endsWith("?")).map(([label, text]) =>
        el("button", { type: "button", onclick: () => useSuggestion(text) }, label))),
    );
  },

  review() {
    const box = el("div", { class: "stack review" }, el("p", { class: "hint" }, "Putting your week together…"));
    api("/review/week").then((r) => box.replaceChildren(...weeklyReviewView(r))).catch((err) => box.replaceChildren(el("p", { class: "hint" }, err.message)));
    return box;
  },

  scan() {
    const view = scanView({ el, onCode: ({ code, grams }) => { closeSheet(); sendBarcode(code, grams); } });
    state.sheetCleanup = view.stop;
    return view.node;
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
      el("button", { class: "link", type: "button", onclick: () => openSheet("scan") }, "Or scan a packet's barcode"),
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

  routine() {
    return routineSection({ heading: false });
  },

  settings() {
    const s = state.snapshot;
    const g = s?.goal?.goal;
    const t = s?.targets || {};
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
        await api("/targets", { method: "POST", body: JSON.stringify({ calorieTarget: num(fd.get("kcal")), proteinTarget: num(fd.get("prot")), stepTarget: num(fd.get("steps")) }) });
        toast("Targets saved.");
        refresh();
      }) },
        el("p", { class: "section-label" }, "Daily targets"),
        el("div", { class: "grid3" },
          el("label", {}, "Calories", el("input", { class: "field", name: "kcal", type: "number", inputmode: "numeric", value: t.calorieTarget ?? null })),
          el("label", {}, "Protein g", el("input", { class: "field", name: "prot", type: "number", inputmode: "numeric", value: t.proteinTarget ?? null })),
          el("label", {}, "Steps", el("input", { class: "field", name: "steps", type: "number", inputmode: "numeric", value: t.stepTarget ?? null })),
        ),
        el("button", { class: "btn block", type: "submit" }, "Save targets"),
      ),
    );
  },

  notifications() {
    return notificationsSection();
  },

  account() {
    return accountSection();
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
// The tab bar floats over the bottom of each view, so the views reserve its real height. A fixed
// 68px guess was too small once Android's font size setting made the tabs taller.
{
  const bar = document.querySelector(".tabbar");
  const fit = () => { if (bar.offsetHeight) document.documentElement.style.setProperty("--tabbar-h", `${bar.offsetHeight + 10}px`); };
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(bar);
  fit();
}
$("coach-stat").addEventListener("click", () => setView("progress"));
$("review-btn").addEventListener("click", () => openSheet("review"));
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
// While typing, the tab bar steps aside so the composer sits right on the keyboard.
$("input").addEventListener("focus", () => document.body.classList.add("typing"));
$("input").addEventListener("blur", () => setTimeout(() => {
  if (document.activeElement !== $("input")) document.body.classList.remove("typing");
}, 120));
// Tapping a composer button mustn't blur the textarea first, or the layout shifts under the finger.
for (const id of ["send", "photo", "quick"]) $(id).addEventListener("pointerdown", (e) => { if (document.activeElement === $("input")) e.preventDefault(); });
window.addEventListener("hashchange", () => setView(viewFromHash(location.hash)));
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
  setView(viewFromHash(location.hash));
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

if (new URLSearchParams(location.search).get("src") === "android" || document.referrer.startsWith("android-app://app.magnus.health")) {
  store.set(ANDROID_KEY, true);
}

const redirectError = captureRedirect();
if (redirectError) showConnect(redirectError);
else if (signedIn()) start();
else showConnect();
