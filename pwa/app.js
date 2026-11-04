// Magnus health app. Four tabs: Coach chat (home), Today, Progress and You (settings). All write through
// the same /api/health endpoints, so anything logged in one shows up in the other.

import { SESSION_ID, trackApi } from "./telemetry.js";
import { runOnboarding } from "./onboarding.js";
import { scanView } from "./scan.js";
import { foodPrefsEditor } from "./foodprefs.js";
import { fromServer, routineEditor, toPayload } from "./routine.js";
import { foodPicker, initMeals, loadPlan, logOwn, mealScreen, mealsTitles, openPlannedMeal, planLineFor, renderMeals, setupScreen } from "./meals.js";
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

// The Progress tab's last chart choice (metric and ranges), so a refresh or reopen lands where you left it.
const TREND_KEY = "magnus-trend-view";
const TREND_METRICS = ["calories", "macros", "steps", "burn", "training", "weight", "bodyfat"];
function loadTrend() {
  const saved = store.get(TREND_KEY, null) || {};
  return {
    metric: TREND_METRICS.includes(saved.metric) ? saved.metric : "calories",
    range: [7, 30, 84].includes(saved.range) ? saved.range : 30,
    bodyRange: [30, 90, 180].includes(saved.bodyRange) ? saved.bodyRange : 90,
  };
}
const saveTrend = () => store.set(TREND_KEY, state.trend);

const state = {
  snapshot: null, sending: false, sheetStack: [], overlayDepth: 0, ignorePop: false, historySig: null, trainingLoaded: false,
  history: null, selectedDate: null, open: new Set(), trend: loadTrend(),
};
// Last good responses, so a cold open paints instantly and the network only fills in changes.
const CHAT_CACHE_KEY = "magnus-chat-cache";
const SNAPSHOT_CACHE_KEY = "magnus-snapshot-cache";
const HISTORY_CACHE_KEY = "magnus-history-cache";
const USUAL_CACHE_KEY = "magnus-usual-meals";
// Set when the PWA is opened from the Android app (its launch URL carries ?src=android). Per tab
// (sessionStorage): the app shares Chrome's storage, so a localStorage flag would leak into Chrome.
const ANDROID_KEY = "magnus-android";
const inAndroidApp = () => { try { return sessionStorage.getItem(ANDROID_KEY) === "1"; } catch { return false; } };
// Health Connect linked from this phone (the Android app synced at least once), or the prompt dismissed.
const HC_LINKED_KEY = "magnus-hc-linked";
const HC_DISMISSED_KEY = "magnus-hc-prompt-dismissed";
// Built by CI from main (.github/workflows/android.yml) and kept on the android-latest release.
/** Where Hevy shows the API key (Settings → Developer). */
const HEVY_KEY_URL = "https://hevy.com/settings?developer";
const ANDROID_APK_URL = "https://github.com/sakshamgoyal06/crewai/releases/download/android-latest/magnus.apk";
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
    if (body.error === "account_disabled") {
      showPaused(body);
      throw Object.assign(new Error("Account paused."), { code: "account_disabled" });
    }
    if (body.error === "token_scope") {
      // A device token (Android app, HC Webhook) only sends data in; it can't open the app.
      endSession("That token is for syncing Health Connect only. Sign in with Google instead.");
      throw new Error("Sync-only token.");
    }
  }
  const body = await res.json().catch(() => ({}));
  trackApi(path, options.method, res.status, performance.now() - started, res.ok ? null : body.error || `http_${res.status}`);
  if (!res.ok) throw Object.assign(new Error(friendlyError(body.error)), { inProgress: body.error === "in_progress", code: body.error });
  return body;
}

function friendlyError(code) {
  return {
    future_date: "That date is in the future.",
    not_a_fact: "Coach memory is for facts about you, like a schedule or an injury, not instructions for the coach.",
    invalid_body: "Some values look off. Check and try again.",
    deadline_must_be_after_start: "The deadline needs to be after today.",
    unsafe_pace: "That date needs a pace faster than is safe. Pick a later date.",
    no_items: "Add at least one item.",
    hevy_not_connected: "Hevy isn't connected for this account.",
    trial_running: "Something here is already on trial. Let's see how that goes first.",
    already_answered: "That card was already answered.",
    item_gone: "That routine item isn't in your routine any more.",
    hevy_unavailable: "Couldn't reach Hevy. Try again in a minute.",
    in_progress: "Still working on that one. The answer will show here in a moment.",
    coach_offline: "The coach is offline right now because of an account issue on our side, not your message. You can still log from the Today tab.",
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
    free_limit: "That's today's free allowance. Pro has no daily cap, or you can keep logging from Today.",
    already_subscribed: "You're already on Pro.",
    pro_feature: "That's part of Magnus Pro. See plans in You → Magnus Pro.",
    billing_unavailable: "Payments aren't available right now. Try again later.",
    invalid_signature: "The payment couldn't be verified. If you were charged, it will show up within a few minutes.",
    daily_limit: "You've hit today's limit for the coach. Log from Today, or try again tomorrow.",
    spend_limit: "You've hit today's limit for the coach. Log from Today, or try again tomorrow.",
    busy: "One message at a time: I'm still answering your last one.",
    draft_limit: "That's a lot of meal estimates for one day. Pick a usual meal or scan a barcode, or try again tomorrow.",
    rca_limit: "I've already looked into this a few times today. Ask again tomorrow.",
    no_targets: "Set your daily calorie and protein targets first.",
    no_setup: "Set up your meals first.",
    option_not_found: "That option isn't in your plan any more.",
    meal_not_planned: "That meal isn't planned any more.",
    already_logged: "Already logged.",
    nothing_to_log: "Add at least one item.",
    nothing_to_undo: "Nothing to undo.",
    not_allowed: "That food is outside your diet or foods to avoid.",
    unknown_food: "That food isn't in the food list any more.",
    unknown_item: "The meal changed on another screen. Open it again.",
    eat_out: "That meal is a meal out. Log what you had instead.",
    hevy_key_invalid: "Hevy didn't accept that key. Copy it again from the link above (hevy.com/settings?developer).",
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

// ---------- folding sections (Today) ----------

const FOLD_KEY = "magnus-folds";

/** A fold's header line: the key number big, its unit or target small, one muted line under it. */
function foldKey(id, value, unit, sub) {
  $(id).replaceChildren(el("span", { class: "kv" }, el("b", {}, value), el("small", {}, unit)), sub ? el("span", { class: "ks" }, sub) : null);
}

/** Food and Movement start folded; each remembers being opened on this phone. */
function initFolds() {
  const open = store.get(FOLD_KEY, {});
  for (const sec of document.querySelectorAll(".fold")) {
    const head = sec.querySelector(".fold-head");
    const set = (on) => {
      sec.classList.toggle("open", on);
      head.setAttribute("aria-expanded", String(on));
    };
    set(!!open[sec.dataset.fold]);
    head.addEventListener("click", () => {
      const on = !sec.classList.contains("open");
      set(on);
      store.set(FOLD_KEY, { ...store.get(FOLD_KEY, {}), [sec.dataset.fold]: on });
    });
  }
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

/** A paused account: why, and a ready-made email asking for a review. Stays signed in. */
function showPaused(body) {
  showConnect(body.message || "This account is paused.");
  const box = $("connect-error");
  if (body.review?.mailto) {
    box.append(" ", el("a", { class: "link", href: body.review.mailto }, "Ask for a review"));
  }
}

function showShell() {
  $("connect").hidden = true;
  $("shell").hidden = false;
}

const VIEWS = ["coach", "today", "meals", "progress", "you"];
/** Old links (and the Android app) still say #tracker; that page is now Today. */
const currentView = () => VIEWS.find((v) => !$(`view-${v}`).hidden) || "coach";
const viewFromHash = (h) => { const v = h.replace("#", ""); return v === "tracker" ? "today" : VIEWS.includes(v) ? v : "coach"; };

/**
 * Coach is home. Leaving it for another tab adds one history entry, so the phone's back button
 * returns to Coach (and only exits from Coach); hopping between the other tabs reuses that entry.
 * fromHistory: the browser already moved (back/forward), so only draw.
 */
function setView(view, { fromHistory = false } = {}) {
  if (!VIEWS.includes(view)) view = "coach";
  if (state.poppingOverlay) { afterClose(() => setView(view, { fromHistory })); return; }
  if (!fromHistory && location.hash !== `#${view}`) {
    const onTab = !!history.state?.tab;
    if (view === "coach" && onTab) {
      // Step back onto the Coach entry instead of stacking a new one; draw now, ignore the echo.
      state.ignorePop = true;
      history.back();
    } else if (view === "coach") history.replaceState(null, "", "#coach");
    else if (onTab) history.replaceState({ tab: true }, "", `#${view}`);
    else history.pushState({ tab: true }, "", `#${view}`);
  }
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== view;
  for (const t of document.querySelectorAll(".tab")) {
    t.classList.toggle("active", t.dataset.view === view);
    t.setAttribute("aria-current", t.dataset.view === view ? "page" : "false");
  }
  if (view !== "coach") document.body.classList.remove("composing");
  if (view !== "coach") window.scrollTo(0, 0);
  if (view === "today" || view === "progress") {
    // Hevy history is several slow calls; only fetch it once a tracker page is actually opened.
    if (!state.trainingLoaded) { state.trainingLoaded = true; loadTraining(); loadDays(); loadReview(); }
    else if (view === "progress" && state.history) requestAnimationFrame(renderTrend);
    // The strip may have been drawn while this page was hidden, when it had no width to scroll.
    if (view === "today" && state.history) requestAnimationFrame(() => renderStrip(state.selectedDate === todayKey()));
  }
  if (view === "you") renderYou();
  if (view === "meals") renderMeals();
  // The food card shows the day against the meal plan; fetch the plan once Today is opened.
  if (view === "today") loadPlan().then(() => { if (state.history) renderDay(); }).catch(() => {});
}

// ---------- appearance ----------

const THEME_KEY = "magnus-theme";
const THEME_COLOR = { light: "#faf6ee", dark: "#160f1d" };

/** "system" follows the phone; "light" / "dark" pin it. Saved on this device. */
function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === "light" || choice === "dark") root.dataset.theme = choice;
  else delete root.dataset.theme;
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = m.media.includes("light") ? "light" : "dark";
    m.content = THEME_COLOR[choice === "light" || choice === "dark" ? choice : own];
  }
  for (const b of document.querySelectorAll("#theme-seg button")) {
    const on = b.dataset.theme === (choice || "system");
    b.classList.toggle("on", on);
    b.setAttribute("aria-checked", String(on));
  }
}

function setTheme(choice) {
  store.set(THEME_KEY, choice === "system" ? null : choice);
  applyTheme(choice);
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
  // Warm the screens this menu opens, so Notifications and the account screen draw at once.
  withCache("/account", (a) => { $("you-who").textContent = a.email || a.name || "Signed in"; });
  fetchCached("/push").catch(() => {});
  withCache("/billing", () => paintPlanSection(), () => {});
}

// ---------- cached reads for the settings screens ----------

/** Last answer per path, in memory only (it can hold token labels, so never localStorage). */
const getCache = new Map();
const inflight = new Map();

/** GET path once at a time; the answer lands in getCache. */
function fetchCached(path) {
  if (!inflight.has(path)) {
    const p = api(path).then((r) => { getCache.set(path, r); return r; }).finally(() => inflight.delete(path));
    inflight.set(path, p);
  }
  return inflight.get(path);
}

/**
 * Paint from the last answer straight away, then again when a fresh one arrives, but only if it
 * changed, so a screen being edited isn't redrawn under the finger. onError runs only with no cache.
 */
function withCache(path, paint, onError) {
  const had = getCache.get(path);
  if (had) paint(had);
  fetchCached(path).then((r) => { if (!had || JSON.stringify(r) !== JSON.stringify(had)) paint(r); })
    .catch((err) => { if (!had) onError?.(err); });
}

// ---------- snapshot ----------

async function refresh() {
  try {
    if (state.trainingLoaded) loadDays();
    state.snapshot = await api("/today");
    renderSnapshot(state.snapshot);
    store.set(SNAPSHOT_CACHE_KEY, state.snapshot);
    // Targets may have just been set from the Meals tab's first step.
    if (currentView() === "meals") renderMeals();
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

/** One glass from the quick-log sheet, with the day's new total. */
async function quickWater() {
  try {
    const r = await api("/water", { method: "POST", body: JSON.stringify({ ml: GLASS_ML }) });
    toast(`Water: ${litres(r.totalMl)} today.`);
    loadDays();
  } catch (err) {
    toast(err.message);
  }
}

/** "Eating out" from the quick-log sheet: lunch before 3 pm, dinner after. A template, no model call. */
function eatingOut() {
  const meal = new Date().getHours() < 15 ? "lunch" : "dinner";
  return coachTurn(
    () => addMessage("user", `Eating out at ${meal}`),
    () => api("/plan/eating-out", { method: "POST", body: JSON.stringify({ meal }) }),
  );
}

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
        series.length ? goalChart(series, m, g.goal) : null,
      );
    }),
  );
}

/**
 * One body metric from the goal's start to its deadline: weigh-ins as a line, the current trend
 * carried forward as a dashed projection, the target as a labelled line, the deadline marked.
 */
function goalChart(series, m, goal) {
  const W = 320, H = 132, padL = 30, padR = 8, padT = 12, padB = 20;
  const iw = W - padL - padR, ih = H - padT - padB;
  const day = (d) => dateOf(d).getTime() / 86_400_000;
  const t0 = Math.min(day(goal.startDate), day(series[0].d)), t1 = Math.max(day(goal.deadline), day(series.at(-1).d) + 1);
  const last = series.at(-1);
  // Projection: the fitted weekly change carried from the latest weigh-in to the deadline (or to the target, if sooner).
  let proj = null;
  if (m.actualPerWeek != null && m.actualPerWeek !== 0 && day(last.d) < t1) {
    let endDay = t1, endV = last.v + (m.actualPerWeek / 7) * (t1 - day(last.d));
    const towards = (m.target - last.v) / m.actualPerWeek > 0;
    if (towards && (m.target - endV) * (m.target - last.v) < 0) { endV = m.target; endDay = day(last.d) + ((m.target - last.v) / m.actualPerWeek) * 7; }
    proj = { d: endDay, v: endV };
  }
  const vals = series.map((p) => p.v).concat(m.target, proj ? [proj.v] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.12, m.unit === "%" ? 0.4 : 0.8);
  lo -= pad; hi += pad;
  const x = (t) => padL + ((t - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * ih;
  const s = svg("svg", { class: "goal-chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${m.label}: ${fmt(last.v, 1)} ${m.unit} now, target ${fmt(m.target, 1)} by ${shortDate(goal.deadline)}` });
  const text = (cls, tx, ty, anchor, str) => { const n = svg("text", { class: cls, x: String(tx), y: String(ty), "text-anchor": anchor }); n.textContent = str; s.append(n); };
  // Target line, labelled at its right end.
  s.append(svg("line", { class: "target", x1: String(padL), x2: String(W - padR), y1: String(y(m.target)), y2: String(y(m.target)) }));
  // Labelled at the left, on the side away from the weigh-ins, so it clears the deadline label.
  text("axis tlabel", padL + 2, y(m.target) + (m.target < last.v ? -5 : 12), "start", `Target ${fmt(m.target, 1)}`);
  // Deadline.
  s.append(svg("line", { class: "deadline", x1: String(x(day(goal.deadline))), x2: String(x(day(goal.deadline))), y1: String(padT - 4), y2: String(H - padB) }));
  // Axis: the first weigh-in's value and the date span.
  text("axis", padL - 6, y(series[0].v) + 3.5, "end", fmt(series[0].v, m.unit === "%" ? 1 : 0));
  const md = (t) => new Date(t * 86_400_000).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  text("axis", padL, H - 5, "start", md(t0));
  text("axis", x(day(goal.deadline)), H - 5, "end", md(day(goal.deadline)));
  if (proj) s.append(svg("path", { class: `proj ${m.pace}`, d: `M ${x(day(last.d)).toFixed(1)} ${y(last.v).toFixed(1)} L ${x(proj.d).toFixed(1)} ${y(proj.v).toFixed(1)}` }));
  if (series.length > 1) s.append(svg("path", { class: "trendline", d: series.map((p, i) => `${i ? "L" : "M"} ${x(day(p.d)).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ") }));
  series.forEach((p, i) => s.append(svg("circle", { class: `dot${i === series.length - 1 ? " now" : ""}`, cx: String(x(day(p.d))), cy: String(y(p.v)), r: i === series.length - 1 ? "4" : "2.5" })));
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
    // Something may have been logged: the 12-week view refetches in the background next time.
    if (state.longHistory) state.longHistory.at = 0;
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
        el("span", { class: "marks" },
          el("i", { class: `mark ${d.onTrack ? "on" : logged ? "some" : ""}` }),
          d.workouts.length || d.trainedUnlogged || d.sportCounted ? el("i", { class: "lift", title: "Trained" }) : null),
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
  // A check that just turned green pops once; one already met when the day was first drawn doesn't.
  const seen = (state.metSeen ||= new Map());
  const before = seen.get(d.date);
  seen.set(d.date, new Set(d.checks.filter((c) => c.met).map((c) => c.id)));
  $("checks").replaceChildren(
    ...d.checks.map((c) =>
      el("li", { class: [c.met && "met", c.met && before && !before.has(c.id) && "pop"].filter(Boolean).join(" ") },
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
  foldKey("fuel-meta", fmt(d.calories), target ? ` / ${fmt(target)} kcal` : " kcal",
    d.meals.length ? `${d.meals.length} meal${d.meals.length === 1 ? "" : "s"} · ${fmt(d.proteinG)} g protein` : "Nothing logged");
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
    // Macros as numbers only: a second bar under the calorie meter read as one broken bar.
    macros = el("div", { class: "macros-block" },
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
  $("fuel-body").replaceChildren(...[top, meter, macros, planLineFor(d.date, () => setView("meals"))].filter(Boolean));

  $("meals").replaceChildren(
    ...(d.meals.length
      ? d.meals.map((m) => mealRow(m, d))
      : [el("li", { class: "none" }, d.date === todayKey() ? "Nothing logged yet today." : "No meals logged this day.")]),
  );
  renderWater(d);
}

const GLASS_ML = 250;
const litres = (ml) => `${fmt(ml / 1000, 2)} L`;

/** Water for the shown day: a glass per tap, minus to take the last one back. Not scored. */
function renderWater(d) {
  const box = $("water");
  const today = todayKey();
  if (!box || (today && d.date > today)) { if (box) box.hidden = true; return; }
  const ml = d.waterMl || 0;
  const target = state.history?.waterTargetMl || 2500;
  const busy = (on) => box.querySelectorAll("button").forEach((b) => { b.disabled = on; });
  const send = async (body) => {
    busy(true);
    try {
      const r = await api("/water", { method: "POST", body: JSON.stringify({ date: d.date, ...body }) });
      // Show the new total at once; the full refresh catches up behind it.
      d.waterMl = r.totalMl;
      renderWater(d);
      loadDays();
    } catch (err) {
      busy(false);
      toast(err.message);
    }
  };
  box.hidden = false;
  box.replaceChildren(
    el("div", { class: "wl" }, el("b", {}, "Water"), el("span", {}, `${litres(ml)} of ${litres(target)}`)),
    el("div", { class: "wa" },
      ml > 0 ? el("button", { class: "icon-btn", type: "button", "aria-label": "Remove the last water log", onclick: () => send({ undo: true }) }, "−") : null,
      el("button", { class: "btn", type: "button", onclick: () => send({ ml: GLASS_ML }) }, "+ Glass")),
    el("div", { class: "meter", role: "img", "aria-label": `${litres(ml)} of ${litres(target)} water` },
      el("i", { style: `width:${Math.min(100, Math.round((ml / target) * 100))}%` })),
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
  const stepT = t.stepTarget || 8000;
  foldKey("move-meta", fmt(d.steps), " steps",
    d.routine?.length
      ? `${d.routine.filter((r) => r.state === "done").length} of ${d.routine.length} done`
      : isToday && d.isTrainingDay && s?.gym?.time ? `Gym ${clock(s.gym.time)}` : d.isTrainingDay ? "Training day" : "Rest day");
  const mins = d.workouts.reduce((a, w) => a + (w.durationMin || 0), 0);
  const tile = (label, value, unit, sub, pct) =>
    el("div", { class: "stat" },
      el("div", { class: "tl" }, label),
      el("div", { class: "tv" }, value, unit ? el("small", {}, ` ${unit}`) : null),
      pct != null ? el("div", { class: "meter thin" }, el("i", { style: `width:${Math.min(100, Math.round(pct * 100))}%` })) : null,
      el("div", { class: "ts" }, sub),
    );
  $("move-tiles").replaceChildren(
    tile("Steps", fmt(d.steps), null, `of ${fmt(stepT)}`, d.steps / stepT),
    tile("Burned", d.burn ? fmt(d.burn.kcal) : "–", d.burn ? "kcal" : null, d.burn ? (d.burn.source === "estimate" ? "estimated" : "from phone") : "no data yet", null),
    tile("Workout", d.workouts.length ? fmt(mins) : d.trainedUnlogged || d.sportCounted ? "✓" : "–", d.workouts.length ? "min" : null,
      d.workouts.length ? `${fmt(d.workouts.reduce((a, w) => a + w.volumeKg, 0))} kg lifted` : d.trainedUnlogged ? (hevy === "not_connected" ? "marked done" : "not in Hevy") : d.sportCounted ? d.sportCounted.split(" · ")[0] : d.isTrainingDay ? "none logged" : "rest", null),
  );
  renderRecovery(d);
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
      : [d.routine?.some((r) => r.gym && r.state === "pending") && !d.trainedUnlogged ? null : el("li", { class: "none" },
          d.trainedUnlogged ? (hevy === "not_connected" ? "Marked as trained." : "You trained but didn't log it in Hevy.")
          : d.sportCounted ? `No gym today. ${d.sportCounted.split(" · ")[0]} counted as training.`
          : hevy === "not_connected" ? "No Hevy linked. Tap below on days you train."
          : hevy === "unavailable" ? "Couldn't reach Hevy just now."
          : d.partial ? "Loading workouts…"
          : "No workout logged."),
        trainedToggle(d)].filter(Boolean)),
  );
}

/**
 * "I trained" for a day with no workout in Hevy (or no Hevy at all), and Undo once it's marked.
 * Same answer as the gym check card, so the day counts toward the score either way.
 */
function trainedToggle(d) {
  const today = state.history?.today;
  if (d.partial || d.workouts.length || d.sportCounted || (today && d.date > today)) return null;
  // The routine row's "Done" already answers this for a planned gym session; one button, not two.
  if (!d.trainedUnlogged && d.routine?.some((r) => r.gym && r.state === "pending")) return null;
  if (!d.trainedUnlogged && !d.isTrainingDay && state.history?.hevy !== "not_connected") return null;
  const btn = el("button", { class: d.trainedUnlogged ? "link" : "btn", type: "button" }, d.trainedUnlogged ? "Undo" : "I trained");
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await api("/workout-check", { method: "POST", body: JSON.stringify({ date: d.date, answer: d.trainedUnlogged ? "undo" : "trained_unlogged" }) });
      toast(d.trainedUnlogged ? "Unmarked." : "Workout counted for the day.");
      refresh();
    } catch (err) {
      btn.disabled = false;
      toast(err.message);
    }
  });
  return el("li", { class: "row-actions" }, btn);
}

/** Sleep and resting heart rate from Health Connect, when the phone has them. */
function renderRecovery(d) {
  const line = $("recovery");
  if (!line) return;
  // One small stat each instead of a run-on sentence.
  const stat = (label, value, unit) => el("div", { class: "stat small" }, el("div", { class: "tl" }, label), el("div", { class: "tv" }, value, el("small", {}, ` ${unit}`)));
  const parts = [];
  if (d.sleepMinutes != null) parts.push(stat("Sleep", `${Math.floor(d.sleepMinutes / 60)}:${String(d.sleepMinutes % 60).padStart(2, "0")}`, "h"));
  if (d.restingHr != null) parts.push(stat("Resting HR", fmt(d.restingHr), "bpm"));
  if (d.hrvMs != null) parts.push(stat("HRV", fmt(d.hrvMs), "ms"));
  // Health Connect's total includes resting metabolism; "Burned" above is activity only.
  if (d.totalKcal != null) parts.push(stat("Total burn", fmt(d.totalKcal), "kcal"));
  line.hidden = !parts.length;
  line.replaceChildren(...parts);
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
    if (r.state === "pending" && r.gym) {
      action = el("button", { class: "btn", type: "button" }, "Done");
      action.addEventListener("click", async () => {
        action.disabled = true;
        try {
          await api("/workout-check", { method: "POST", body: JSON.stringify({ date: d.date, answer: "trained_unlogged" }) });
          toast(`${r.label} counted.`);
          refresh();
        } catch (err) { action.disabled = false; toast(err.message); }
      });
    } else if (r.state === "pending" && !r.gym) {
      action = el("button", { class: "btn", type: "button" }, "Done");
      action.addEventListener("click", async () => {
        action.disabled = true;
        try { await answerRoutine({ itemId: r.itemId, date: d.date, answer: "done" }); toast(`${r.label} logged.`); }
        catch (err) { action.disabled = false; toast(err.message); }
      });
    }
    const sub = r.state === "pending"
      ? (r.gym ? (state.history?.hevy === "not_connected" ? r.detail : `${r.detail} · log it in Hevy`) : `${r.detail} · ${r.durationMin} min`)
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
    hit: (d, t) => !t.calorieTarget || (d.calories >= t.calorieTarget * 0.6 && d.calories <= t.calorieTarget),
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
    hit: (d, t) => d.steps >= (t.stepTarget || 8000),
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
  // Only maxima whose half is also a round number, so the three axis labels read cleanly.
  return ([1, 2, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10) * p;
}
const compact = (v) => (v >= 10000 ? `${fmt(v / 1000)}K` : v >= 1000 ? `${fmt(v / 1000, 1)}K` : fmt(v));

function renderTrend() {
  const { metric, range } = state.trend;
  for (const b of document.querySelectorAll(".trend-tabs button[data-metric]")) b.classList.toggle("on", b.dataset.metric === metric);
  const inExtra = !!document.querySelector(`#trend-extra [data-metric="${metric}"]`);
  if (inExtra) setTrendMore(true);
  $("trend-more").classList.toggle("on", inExtra);
  const h = state.history;
  if (!h) return;
  if (BODY_TREND[metric]) return renderBodyTrend(metric);
  renderRange([[7, "7D"], [30, "30D"], [84, "12W"]], range, (v) => { state.trend.range = v; });
  if (range === 84) return renderWeeklyTrend(metric);
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
  barChart($("trend-chart"), days, cfg, target, showDay, t);
  if (cfg.hit) {
    $("trend-legend").prepend(
      el("span", { class: "lg" }, el("i", { class: "sw hit" }), "On target"),
      el("span", { class: "lg" }, el("i", { class: "sw miss" }), "Missed"));
  }
}

function setTrendMore(open) {
  $("trend-extra").hidden = !open;
  $("trend-more").setAttribute("aria-expanded", String(open));
  $("trend-more").textContent = open ? "Less" : "More";
}

function barChart(host, days, cfg, target, onPick, targets = {}) {
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
    // Today isn't over, so it isn't a miss yet.
    const miss = cfg.hit && !d.week && totals[i] > 0 && d.date !== todayKey() && !cfg.hit(d, targets);
    const g = svg("g", { class: `col${d.date === state.selectedDate ? " sel" : ""}${cfg.estimated?.(d) ? " est" : ""}${miss ? " miss" : ""}` });
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
    const showLabel = d.week ? (days.length - 1 - i) % 3 === 0 : days.length <= 7 || (days.length - 1 - i) % 7 === 0;
    if (showLabel) {
      const tx = svg("text", { class: `axis${d.date === state.selectedDate ? " strong" : ""}`, x: String(cx), y: String(H - 6), "text-anchor": "middle" });
      tx.textContent = d.week ? dateOf(d.startDate || d.date).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : days.length <= 7 ? WD[d.weekday] : String(dateOf(d.date).getUTCDate());
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

for (const b of document.querySelectorAll(".trend-tabs button[data-metric]")) b.addEventListener("click", () => { state.trend.metric = b.dataset.metric; saveTrend(); renderTrend(); });
$("trend-more").addEventListener("click", () => {
  const open = $("trend-extra").hidden;
  // Closing the row while one of its charts is showing goes back to Calories.
  if (!open && document.querySelector(`#trend-extra [data-metric="${state.trend.metric}"]`)) { state.trend.metric = "calories"; saveTrend(); }
  setTrendMore(open);
  renderTrend();
});

// ---------- 12-week view ----------
// Twelve bars, one per week (oldest left), from a longer /history read fetched only when asked for.

const LONG_DAYS = 84;
const LONG_TTL_MS = 10 * 60_000;

async function loadLongHistory() {
  const cur = state.longHistory;
  if (cur && Date.now() - cur.at < LONG_TTL_MS && cur.data.today === todayKey()) return cur.data;
  if (loadLongHistory.running) return loadLongHistory.running;
  loadLongHistory.running = api(`/history?days=${LONG_DAYS}`)
    .then((data) => { state.longHistory = { at: Date.now(), data }; return data; })
    .finally(() => { loadLongHistory.running = null; });
  return loadLongHistory.running;
}

/** Average over the days that have a reading; 0 when none do. */
const avgOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Seven-day blocks ending today, shaped like a day so the bar chart and TREND configs read them:
 * food and burn are daily averages over the days with data, steps over days with steps, and
 * training is the week's total minutes.
 */
function weeksOf(days) {
  const out = [];
  for (let end = days.length; end > 0; end -= 7) {
    const block = days.slice(Math.max(0, end - 7), end);
    const fed = block.filter((d) => d.calories > 0);
    const walked = block.filter((d) => d.steps > 0);
    const burned = block.filter((d) => d.burn);
    out.unshift({
      week: true,
      date: block[0].date,
      endDate: block[block.length - 1].date,
      dates: block.map((d) => d.date),
      fedDays: fed.length,
      calories: avgOf(fed.map((d) => d.calories)),
      proteinG: avgOf(fed.map((d) => d.proteinG || 0)),
      carbsG: avgOf(fed.map((d) => d.carbsG || 0)),
      fatG: avgOf(fed.map((d) => d.fatG || 0)),
      steps: avgOf(walked.map((d) => d.steps)),
      burn: burned.length ? { kcal: avgOf(burned.map((d) => d.burn.kcal)), source: burned.every((d) => d.burn.source === "estimate") ? "estimate" : "mixed" } : null,
      workouts: block.flatMap((d) => d.workouts),
      onTrack: block.filter((d) => d.onTrack).length,
    });
  }
  return out;
}

const WEEK_TIP = {
  calories: (w) => [`${fmt(w.calories)} kcal a day`, `${w.fedDays} day${w.fedDays === 1 ? "" : "s"} logged`],
  macros: (w) => [`${fmt(w.proteinG)} g protein a day`, `carbs ${fmt(w.carbsG)} g`, `fat ${fmt(w.fatG)} g`],
  steps: (w) => [`${fmt(w.steps)} steps a day`],
  burn: (w) => (w.burn ? [`${fmt(w.burn.kcal)} kcal a day`, "active calories"] : ["No data"]),
  training: (w) => [`${w.workouts.length} workout${w.workouts.length === 1 ? "" : "s"}`, `${fmt(w.workouts.reduce((a, x) => a + (x.durationMin || 0), 0))} min`, `${fmt(w.workouts.reduce((a, x) => a + x.volumeKg, 0))} kg lifted`],
};

async function renderWeeklyTrend(metric) {
  const summary = $("trend-summary");
  const cfg = TREND[metric];
  let h = state.longHistory?.data;
  if (!h || h.today !== todayKey()) {
    summary.classList.remove("picked");
    summary.replaceChildren(el("span", { class: "ts" }, "Loading 12 weeks…"));
    $("trend-legend").replaceChildren();
    $("trend-chart").replaceChildren();
    try { h = await loadLongHistory(); } catch (err) {
      summary.replaceChildren(el("span", { class: "ts" }, "Couldn't load 12 weeks just now."));
      return;
    }
    // The person may have switched away while it loaded.
    if (state.trend.range !== LONG_DAYS || state.trend.metric !== metric) return;
  } else if (Date.now() - state.longHistory.at > LONG_TTL_MS) {
    // Refetch quietly; redraw only if the numbers moved, so a tapped week isn't reset for nothing.
    const before = JSON.stringify(h.days);
    loadLongHistory()
      .then((fresh) => { if (JSON.stringify(fresh.days) !== before && state.trend.range === LONG_DAYS && state.trend.metric === metric) renderWeeklyTrend(metric); })
      .catch(() => {});
  }
  const t = h.targets || {};
  const weeks = weeksOf(h.days);
  const [headline, sub] = cfg.summary(h.days, t);
  const showSummary = () => {
    summary.classList.remove("picked");
    summary.replaceChildren(el("span", { class: "tv" }, headline), ...(sub ? [el("span", { class: "ts" }, `${sub} · last 12 weeks`)] : [el("span", { class: "ts" }, "last 12 weeks")]));
  };
  const showWeek = (w) => {
    if (!w) return showSummary();
    const [first, ...rest] = WEEK_TIP[metric](w);
    summary.classList.add("picked");
    summary.replaceChildren(
      el("span", { class: "tv" }, first),
      el("span", { class: "ts" }, [`${shortDate(w.date)} – ${dayName(w.endDate)}`, ...rest, `${w.onTrack}/7 on track`].join(" · ")),
    );
  };
  showSummary();
  $("trend-note").textContent = metric === "training" ? "Each bar is a week's total. Tap one to see it." : "Each bar is a week's daily average. Tap one to see it.";
  const target = metric === "training" ? null : cfg.target ? cfg.target(t) : null;
  $("trend-legend").replaceChildren(
    ...(metric === "macros" ? MACROS.map(([, label, , cls]) => el("span", { class: "lg" }, el("i", { class: `sw ${cls}` }), label)) : []),
    ...(target ? [el("span", { class: "lg" }, el("i", { class: "key-target" }), `Target ${fmt(target)}`)] : []),
  );
  const weekCfg = { ...cfg, unit: `${cfg.unit} per week`, estimated: metric === "burn" ? (w) => w.burn?.source === "estimate" : undefined };
  barChart($("trend-chart"), weeks.map((w) => ({ ...w, date: w.dates.includes(state.selectedDate) ? state.selectedDate : w.date, startDate: w.date })), weekCfg, target, (w) => showWeek(w && { ...w, date: w.startDate }));
}

/** The range buttons: days for daily metrics, months for weight and body fat. */
function renderRange(options, current, set) {
  $("trend-range").replaceChildren(...options.map(([v, label]) =>
    el("button", { type: "button", class: v === current ? "on" : "", onclick: () => { set(v); saveTrend(); renderTrend(); } }, label)));
}

// ---------- weight & body fat trend ----------

/** Weigh-ins (typed, or synced from a scale through Health Connect) as a line against the goal. */
const BODY_TREND = {
  weight: { key: "weight_kg", label: "Weight", unit: "kg", dp: 1, target: "weight_kg" },
  bodyfat: { key: "body_fat_pct", label: "Body fat", unit: "%", dp: 1, target: "body_fat_pct" },
};

function renderBodyTrend(metric) {
  const cfg = BODY_TREND[metric];
  const range = state.trend.bodyRange;
  renderRange([[30, "1M"], [90, "3M"], [180, "6M"]], range, (v) => { state.trend.bodyRange = v; });
  const s = state.snapshot;
  const to = state.history?.today || s?.today?.date;
  const from = new Date(dateOf(to).getTime() - (range - 1) * 86_400_000).toISOString().slice(0, 10);
  const points = (s?.checkins || []).filter((c) => c[cfg.key] != null && c.localDate >= from && c.localDate <= to).map((c) => ({ date: c.localDate, v: c[cfg.key] }));
  const target = s?.goal?.goal?.targets?.[cfg.target] ?? null;
  const summary = $("trend-summary");
  const unit = cfg.unit === "%" ? "%" : ` ${cfg.unit}`;
  const val = (v) => `${fmt(v, cfg.dp)}${unit}`;
  const months = { 30: "a month", 90: "3 months", 180: "6 months" }[range];

  const showSummary = () => {
    summary.classList.remove("picked");
    if (!points.length) {
      summary.replaceChildren(el("span", { class: "tv" }, "No weigh-ins yet"), el("span", { class: "ts" }, `Log a weigh-in, or connect a smart scale through Health Connect.`));
      return;
    }
    const last = points.at(-1), first = points[0];
    const change = last.v - first.v;
    const parts = [points.length > 1 ? `${change > 0 ? "+" : change < 0 ? "−" : "±"}${fmt(Math.abs(change), cfg.dp)}${unit} in ${months}` : "first weigh-in in this range",
      target != null ? `target ${val(target)}` : null];
    summary.replaceChildren(el("span", { class: "tv" }, val(last.v)), el("span", { class: "ts" }, `latest, ${shortDate(last.date)} · ${parts.filter(Boolean).join(" · ")}`));
  };
  const showPoint = (p) => {
    if (!p) return showSummary();
    summary.classList.add("picked");
    summary.replaceChildren(el("span", { class: "tv" }, val(p.v)), el("span", { class: "ts" }, shortDate(p.date)));
  };
  showSummary();
  $("trend-note").textContent = points.length > 1 ? "Tap a point to see that weigh-in." : "";
  $("trend-legend").replaceChildren(...(target != null ? [el("span", { class: "lg" }, el("i", { class: "key-target" }), `Target ${val(target)}`)] : []));
  if (!points.length) {
    $("trend-chart").replaceChildren(el("button", { class: "btn block", type: "button", onclick: () => openSheet("checkin") }, "Log a weigh-in"));
    return;
  }
  lineChart($("trend-chart"), points, from, to, target, cfg, showPoint);
}

function lineChart(host, points, from, to, target, cfg, onPick) {
  const W = Math.max(260, host.clientWidth || 320), H = 168;
  const padL = 34, padR = 8, padT = 12, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const vals = points.map((p) => p.v).concat(target != null ? [target] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.15, cfg.unit === "%" ? 0.5 : 1);
  lo -= pad; hi += pad;
  const t0 = dateOf(from).getTime(), t1 = dateOf(to).getTime();
  const x = (d) => padL + ((dateOf(d).getTime() - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * ih;

  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: String(W), height: String(H), role: "img", "aria-label": `${cfg.label} over time` });
  for (const v of [lo + pad, (lo + hi) / 2, hi - pad]) {
    s.append(svg("line", { class: "grid", x1: String(padL), x2: String(W - padR), y1: String(y(v)), y2: String(y(v)) }));
    const tx = svg("text", { class: "axis", x: String(padL - 6), y: String(y(v) + 3.5), "text-anchor": "end" });
    tx.textContent = fmt(v, cfg.unit === "%" || hi - lo < 6 ? 1 : 0);
    s.append(tx);
  }
  // Month or week ticks along the bottom.
  const span = (t1 - t0) / 86_400_000;
  const step = span > 60 ? 30 : 7;
  for (let k = 0; k * step <= span; k++) {
    const date = new Date(t1 - k * step * 86_400_000).toISOString().slice(0, 10);
    if (x(date) < padL + 12) continue;
    // The newest tick sits on the right edge, so it hangs left instead of being cut off.
    const tx = svg("text", { class: "axis", x: String(k ? x(date) : W - padR), y: String(H - 6), "text-anchor": k ? "middle" : "end" });
    tx.textContent = dateOf(date).toLocaleDateString(undefined, step === 30 ? { month: "short", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
    s.append(tx);
  }
  if (target != null) s.append(svg("line", { class: "target", x1: String(padL), x2: String(W - padR), y1: String(y(target)), y2: String(y(target)) }));
  const line = points.map((p, i) => `${i ? "L" : "M"} ${x(p.date).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  if (points.length > 1) s.append(svg("path", { class: "trendline", d: line }));
  const dots = points.map((p) => { const c = svg("circle", { class: "dot", cx: String(x(p.date)), cy: String(y(p.v)), r: "3.5" }); s.append(c); return c; });
  const hit = svg("rect", { class: "hit", x: String(padL - 8), y: "0", width: String(iw + 16), height: String(H) });
  s.append(hit);
  host.replaceChildren(s);

  let active = -1;
  const show = (i) => {
    if (i === active) return;
    active = i;
    dots.forEach((d, j) => d.classList.toggle("on", j === i));
    onPick(i >= 0 ? points[i] : null);
  };
  const nearest = (e) => {
    const r = s.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i; });
    return best;
  };
  host.hideTip = () => show(-1);
  hit.addEventListener("pointerdown", (e) => show(nearest(e)));
}
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
  afterClose(() => useSuggestionNow(text));
}

function useSuggestionNow(text) {
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

/**
 * Coach text with its web links made tappable (https only; opens outside the app, so on Android
 * the Hevy link goes to the browser or the Hevy app). Everything else stays plain text.
 */
function linkified(text) {
  const out = document.createDocumentFragment();
  let at = 0;
  for (const m of String(text ?? "").matchAll(/https:\/\/[^\s<>"')\]]+/g)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    out.append(text.slice(at, m.index), el("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, url));
    at = m.index + url.length;
  }
  out.append(String(text ?? "").slice(at));
  return out;
}

function setCoachText(node, text) {
  node.replaceChildren(linkified(text));
}

function addMessage(role, text, into = $("thread")) {
  const node = el("div", { class: `msg ${role}` }, role === "coach" ? linkified(text) : text);
  into.append(node);
  if (into.id === "thread") scrollThread();
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
  return `${messages.length}|${last?.createdAt ?? ""}|${JSON.stringify(messages.flatMap((m) => [m.status ?? "", ...(m.cards || []).map((c) => c.status ?? (c.saved ? "saved" : ""))]))}`;
}

// A turn still marked pending this long after it was sent died with the server; treat it as failed.
const STALE_TURN_MS = 150_000;

function unanswered(m) {
  if (m.status === "failed") return true;
  return m.status === "pending" && Date.now() - new Date(m.createdAt).getTime() > STALE_TURN_MS;
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
  renderMessages(messages, t, { retry: true });
  requestAnimationFrame(() => { t.scrollTop = t.scrollHeight; t.style.scrollBehavior = prevBehavior; });
}

/** Cards that say everything their message says: the text bubble is skipped (the model still reads it). */
const CARD_ONLY = new Set(["day_plan", "plan_meal", "plan_adjust"]);

/** Messages and their cards into a thread. */
function renderMessages(messages, into, { retry = false } = {}) {
  for (const m of messages) {
    const cards = m.cards || [];
    if (!cards.some((c) => CARD_ONLY.has(c.type))) addMessage(m.role === "user" ? "user" : "coach", m.content, into);
    for (const c of cards) appendCard(c, into);
    if (retry && m.role === "user" && unanswered(m)) {
      failedTurn("That one didn't get a reply.", m.turnId ? () => send(m.content, m.turnId, () => {}) : null);
    }
  }
}

/** The phone's own date, to tell whether the saved thread is still today's. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Each day is its own thread: GET /chat returns today's (opened by the day's plan); earlier days
// open from the Past days screen.
async function loadHistory() {
  try {
    const { messages, date } = await api("/chat");
    if (state.sending) return;
    renderHistory(messages);
    store.set(CHAT_CACHE_KEY, { date: date || localToday(), messages: messages.slice(-50) });
  } catch (err) {
    if (!state.historySig) renderEmpty();
  }
}

// A coach turn can take a while (meal web search); past this the UI frees up instead of looking dead.
const CHAT_TIMEOUT_MS = 90_000;

// A turn that failed or timed out is retried under the same id, so the server answers once at most.
function newTurnId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/** Returns false when the message wasn't sent, so the caller keeps the text. */
async function send(text, turnId = newTurnId(), showUser = addMessage.bind(null, "user", text)) {
  if (!text.trim()) return false;
  const request = (live) => streamChat({ text, turnId }, live);
  return coachTurn(showUser, request, () => send(text, turnId, () => {}));
}

// Nothing from the server for this long mid-turn means the connection died (it sends a keepalive every 5 s).
const STREAM_IDLE_MS = 30_000;

/**
 * POST /chat/stream: progress lines while tools run, text as the coach writes it, then the full
 * reply. Falls back to the plain endpoint when the browser can't read a streamed body.
 */
async function streamChat(body, live = {}) {
  let res = await request("/chat/stream", { method: "POST", body: JSON.stringify(body) });
  if (res.status === 401) res = await request("/chat/stream", { method: "POST", body: JSON.stringify(body) }, true);
  if (res.status === 401) {
    endSession("You were signed out. Sign in again to continue.");
    throw new Error("Signed out.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(friendlyError(err.error)), { inProgress: err.error === "in_progress", code: err.error });
  }
  if (!res.body?.getReader) return api("/chat", { method: "POST", body: JSON.stringify(body) });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let idle;
  const resetIdle = (reject) => {
    clearTimeout(idle);
    idle = setTimeout(() => { reader.cancel().catch(() => {}); reject(new Error("Lost the connection mid-answer. Tap Retry.")); }, STREAM_IDLE_MS);
  };
  return new Promise(async (resolve, reject) => {
    resetIdle(reject);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        resetIdle(reject);
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const chunk = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const data = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!data) continue;
          const event = JSON.parse(data.slice(5));
          if (event.type === "progress") live.onProgress?.(event.text);
          else if (event.type === "delta") live.onDelta?.(event.text);
          else if (event.type === "done") { clearTimeout(idle); resolve(event.reply); return; }
          else if (event.type === "error") { clearTimeout(idle); reject(Object.assign(new Error(event.message), { inProgress: event.error === "in_progress" })); return; }
        }
      }
      clearTimeout(idle);
      reject(new Error("The answer was cut off. Tap Retry."));
    } catch (err) {
      clearTimeout(idle);
      reject(err instanceof Error ? err : new Error("Lost the connection mid-answer. Tap Retry."));
    }
  });
}

/**
 * One exchange in the thread: the person's bubble, a typing indicator, then the reply and its
 * cards. Shared by typed messages, meal photos and repeat meals.
 */
async function coachTurn(showUser, request, retry) {
  if (state.sending) {
    toast("Still answering your last message. One moment.");
    return false;
  }
  state.sending = true;
  state.historySig = null;
  $("send").disabled = true;
  if ($("thread").querySelector(".empty")) $("thread").replaceChildren();
  showUser();
  const progress = el("span", { class: "progress" });
  const typing = el("div", { class: "msg coach typing" }, el("i"), el("i"), el("i"), progress);
  $("thread").append(typing);
  scrollThread();
  // While the coach writes, its words land in a live bubble that the final reply then replaces.
  let bubble = null;
  const live = {
    onProgress: (text) => { if (!bubble) progress.textContent = text; },
    onDelta: (text) => {
      if (!bubble) { bubble = addMessage("coach", ""); typing.remove(); }
      bubble.textContent += text;
      scrollThread();
    },
  };
  try {
    let timer;
    const reply = await Promise.race([
      request(live),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("That's taking too long. The answer will show when you reopen the app, or try again.")), CHAT_TIMEOUT_MS); }),
    ]).finally(() => clearTimeout(timer));
    typing.remove();
    if (bubble) setCoachText(bubble, reply.text);
    else addMessage("coach", reply.text);
    for (const c of reply.cards || []) appendCard(c);
    scrollThread();
    if (reply.changed) refresh();
  } catch (err) {
    typing.remove();
    bubble?.remove();
    const failed = failedTurn(err.message, err.code === "free_limit" ? null : retry);
    if (err.code === "free_limit") failed.append(" ", el("button", { class: "link", type: "button", onclick: () => openSheet("plans") }, "See plans"));
    // The server may still be answering: pick the reply up from history shortly.
    if (err.inProgress) setTimeout(() => { if (!state.sending) loadHistory(); }, 8000);
  } finally {
    state.sending = false;
    $("send").disabled = false;
  }
  return true;
}

/** The error line under a message that got no reply, with a Retry that reuses the same turn id. */
function failedTurn(message, retry) {
  const node = addMessage("coach err", message);
  if (retry) {
    node.append(" ", el("button", { class: "link", type: "button", onclick: () => { node.remove(); retry(); } }, "Retry"));
  }
  return node;
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
  if (r.mealPlanLine) out.push(el("p", { class: "section-label" }, "Meal plan"), el("p", { class: "hint" }, r.mealPlanLine));
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
    el("button", { class: "btn primary block", type: "button", onclick: () => { closeSheet(); afterClose(() => { setView("coach"); $("input").value = "Let's go over my week. What should I change?"; autosize(); $("input").focus(); }); } }, "Talk it through with the coach"),
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

function appendCard(c, into = $("thread")) {
  if (c.type === "meal_draft") into.append(mealDraftCard(c.draft, { saved: c.saved }));
  else if (c.type === "activity_draft") into.append(activityDraftCard(c.draft, { saved: c.saved }));
  else if (c.type === "workout_check") into.append(workoutCheckCard(c));
  else if (c.type === "routine_check") into.append(routineCheckCard(c));
  else if (c.type === "hevy_proposal") into.append(hevyProposalCard(c));
  else if (c.type === "rca") into.append(rcaCard(c));
  else if (c.type === "intervention") into.append(interventionCard(c));
  else if (c.type === "calorie_review") into.append(calorieReviewCard(c.review));
  else if (c.type === "day_plan") into.append(dayPlanCard(c));
  else if (c.type === "eating_out") into.append(eatingOutCard(c));
  else if (c.type === "plan_meal") into.append(planMealCard(c));
  else if (c.type === "plan_adjust") into.append(planAdjustCard(c));
}

// ---------- the day's plan ----------

const longDay = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

/**
 * What the coach opens each day with, kept short: the day's timeline, the three targets and the one
 * thing worth a look. Goal, yesterday, the week and meals open as their own screen ("Full plan").
 */
function dayPlanCard(c) {
  return el("div", { class: "draft dayplan compact" },
    el("p", { class: "eyebrow" }, `${longDay(c.date)}'s plan`),
    c.plan?.length
      ? el("ul", { class: "dp-plan" }, ...c.plan.map((p) => el("li", {}, el("span", { class: "dp-time" }, p.time || "Any time"), el("span", {}, p.label))))
      : c.dayKind ? el("p", { class: "dp-kind" }, c.dayKind) : null,
    el("div", { class: "dp-targets" }, ...(c.targets || []).map((t) => el("div", {}, el("b", {}, t.value), el("small", {}, t.label)))),
    c.focus ? el("p", { class: "dp-tip" }, el("b", {}, "Worth a look "), c.focus) : null,
    el("button", { class: "link dp-more", type: "button", onclick: () => { state.dayPlan = c; openSheet("dayPlan"); } }, "Full plan"),
  );
}

/** The whole day's plan, as its own screen. */
function dayPlanFull(c) {
  const sec = (label, ...kids) => el("div", { class: "dp-sec" }, el("p", { class: "eyebrow" }, label), ...kids);
  return el("div", { class: "dayplan full" },
    el("p", { class: "eyebrow" }, c.greeting),
    el("h3", { class: "dp-greet" }, `${longDay(c.date)}'s plan`),
    sec("Today",
      c.plan?.length
        ? el("ul", { class: "dp-plan" }, ...c.plan.map((p) => el("li", {}, el("span", { class: "dp-time" }, p.time || "Any time"), el("span", {}, p.label))))
        : el("p", {}, c.dayKind || "")),
    el("div", { class: "dp-targets" }, ...(c.targets || []).map((t) => el("div", {}, el("b", {}, t.value), el("small", {}, t.label)))),
    c.goal ? sec("Goal", el("p", {}, c.goal)) : null,
    c.yesterday ? sec("Yesterday", el("p", {}, c.yesterday)) : null,
    sec("This week", el("p", {}, c.week)),
    c.meals?.length ? sec("Meals",
      el("ul", { class: "dp-plan" }, ...c.meals.map((m) => el("li", {}, el("span", { class: "dp-time" }, m.time ? clock(m.time) : SLOT_LABEL[m.slot]),
        m.status === "planned" && m.slot
          ? el("button", { class: "link dp-meal", type: "button", onclick: () => openPlannedMeal(c.date, m.slot) }, `${m.title} · ${fmt(m.kcal)} kcal`)
          : el("span", {}, `${m.title} · ${fmt(m.kcal)} kcal`)))),
      el("button", { class: "link", type: "button", onclick: () => { closeSheet(); afterClose(() => setView("meals")); } }, "Open meals")) : null,
    c.focus ? el("div", { class: "dp-focus" }, el("p", { class: "eyebrow" }, "Worth a look"), el("p", {}, c.focus)) : null,
    el("p", { class: "dp-motto" }, c.motivation),
  );
}


/** A planned meal at its time: eat it in one tap, or open it to change portions or swap. */
function planMealCard(c) {
  const card = el("div", { class: "draft planmeal" });
  const eaten = (s) => s === "logged" || s === "partial";
  function render(cur) {
    const head = el("p", { class: "eyebrow" }, `${SLOT_LABEL[cur.slot]}${cur.time ? ` · ${clock(cur.time)}` : ""} · on your plan`);
    const body = [
      head,
      el("ul", { class: "pm-items" }, ...cur.items.map((t) => el("li", {}, t))),
      el("p", { class: "pm-sub" }, `${fmt(cur.kcal)} kcal · ${cur.proteinG} g protein`),
    ];
    if (eaten(cur.status)) {
      card.replaceChildren(...body, el("div", { class: "done-line" }, cur.status === "partial" ? "✓ Eaten, portions changed" : "✓ Eaten"));
      return;
    }
    const ate = el("button", { class: "btn primary small", type: "button" }, "Ate this");
    const change = el("button", { class: "btn small", type: "button", onclick: () => openPlannedMeal(cur.date, cur.slot) }, "✎ Edit or swap");
    ate.addEventListener("click", async () => {
      ate.disabled = change.disabled = true;
      try {
        await api(`/diet/days/${cur.date}/${cur.slot}/eat`, { method: "POST", body: "{}" });
        c.status = "logged";
        render(c);
        toast("Logged as planned.");
        loadPlan(true).catch(() => {});
        refresh();
      } catch (err) {
        if (err.code === "already_logged") { c.status = "logged"; render(c); return; }
        ate.disabled = change.disabled = false;
        toast(err.message);
      }
    });
    const own = el("button", { class: "btn small", type: "button", onclick: () => logOwn({ slot: cur.slot, date: cur.date }) }, "Log your own");
    card.replaceChildren(...body, el("div", { class: "draft-actions" }, ate, change, own));
  }
  render(c);
  return card;
}

/** The plan moved: the rest of today resized after an off-plan meal, or the night's day close. */
function planAdjustCard(c) {
  const close = c.kind === "day_close";
  const meals = c.next?.meals || [];
  return el("div", { class: "draft planadjust" },
    el("p", { class: "eyebrow" }, close ? "Day close" : "Rest of today"),
    el("p", { class: "pa-head" }, c.headline),
    c.lines?.length ? el("ul", { class: "pa-lines" }, ...c.lines.map((l) => el("li", {}, l))) : null,
    close && meals.length ? el("div", { class: "dp-sec" },
      el("p", { class: "eyebrow" }, "Tomorrow"),
      el("ul", { class: "dp-plan" }, ...meals.map((m) => el("li", {}, el("span", { class: "dp-time" }, m.time ? clock(m.time) : SLOT_LABEL[m.slot]), el("span", {}, `${m.title} · ${fmt(m.kcal)} kcal`))))) : null,
    el("button", { class: "link", type: "button", onclick: () => setView("meals") }, close ? "See tomorrow's meals" : "See today's meals"),
  );
}

/** The plan around a meal out: what to keep for it, what's left before, and how to order. */
function eatingOutCard(c) {
  const keep = c.reserveKcal != null && c.lines[0]?.startsWith("Keep");
  return el("div", { class: "draft eatout" },
    el("p", { class: "eyebrow" }, `Eating out · ${c.meal}`),
    keep ? el("div", { class: "eo-num" }, el("b", {}, fmt(c.reserveKcal)), el("small", {}, `kcal for ${c.meal}`)) : null,
    el("div", { class: "eo-lines" }, ...c.lines.slice(keep ? 1 : 0).map((l) => el("p", {}, l))),
    el("p", { class: "eyebrow eo-head" }, "Ordering"),
    el("ul", { class: "eo-tips" }, ...c.tips.map((t) => el("li", {}, t))),
  );
}

// ---------- past days ----------

function dayTitle(date) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  return date === yKey ? "Yesterday" : new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function pastDaysSection() {
  const list = el("div", { class: "menu past-days" });
  const paint = (days) => {
    if (!days) return list.replaceChildren(el("p", { class: "hint center" }, "Loading…"));
    if (!days.length) return list.replaceChildren(el("p", { class: "hint center" }, "Earlier days show here. Each day starts with a fresh chat."));
    list.replaceChildren(...days.map((d) =>
      el("button", { class: "menu-row", type: "button", onclick: () => { state.chatDay = d.date; openSheet("chatDay"); } },
        el("span", {}, el("b", {}, dayTitle(d.date)), el("small", {}, d.preview || `${d.count} messages`)),
        el("i", { class: "chev-r" }))));
  };
  paint(state.pastDays || null);
  api("/chat/days").then((r) => { state.pastDays = r.days; paint(r.days); }).catch((err) => toast(err.message));
  return list;
}

/** One earlier day's chat, read back as it was. Cards still show their live state. */
function chatDaySection() {
  const date = state.chatDay;
  $("sheet-title").textContent = dayTitle(date);
  const thread = el("div", { class: "thread past" }, el("p", { class: "hint center" }, "Loading…"));
  api(`/chat?date=${encodeURIComponent(date)}`)
    .then(({ messages }) => {
      thread.replaceChildren();
      if (!messages.length) thread.append(el("p", { class: "hint center" }, "Nothing was said this day."));
      else renderMessages(messages, thread);
    })
    .catch((err) => { thread.replaceChildren(el("p", { class: "hint center" }, err.message)); });
  return thread;
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

// ---------- plan-change card ----------

const INTERVENTION_EYEBROW = {
  routine_slipping: "Routine check",
  routine_mismatch: "Routine check",
  calories_over: "Food check",
  calories_under: "Food check",
  protein_short: "Food check",
  rebound: "Food check",
  stalled: "Progress check",
  logging_fading: "Logging check",
  over_ambitious: "Goal check",
  deadline_drift: "Goal date",
  safety: "Health check",
};
const INTERVENTION_DONE = {
  kept: "Kept as is",
  confirmed: "Now part of your plan",
  applied: "Saved to your plan",
  ended: "Back to your plan",
  cancelled: "Trial cancelled",
  expired: "Closed without changes",
  info: "",
};
const REASONS = [["time", "Time"], ["energy", "Energy"], ["enjoyment", "Don't enjoy it"], ["forgot", "Forgot"], ["away", "Away or unwell"]];
const fmtDay = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "");

/** A plan that stopped fitting: what we saw, a few changes with what each does to the goal, or keep it. */
function interventionCard(c) {
  const card = el("div", { class: "draft intervention" });
  let busy = false;
  async function act(action, extra = {}) {
    if (busy) return;
    busy = true;
    card.classList.add("busy");
    try {
      const r = await api(`/interventions/${c.interventionId}`, { method: "POST", body: JSON.stringify({ action, ...extra }) });
      if (r.talk) {
        busy = false;
        card.classList.remove("busy");
        send(r.talk);
        return;
      }
      if (r.card) Object.assign(c, r.card);
      if (r.message) toast(r.message);
    } catch (err) {
      toast(err.message);
    }
    busy = false;
    card.classList.remove("busy");
    render();
  }

  function option(o) {
    const b = el("button", { class: "intervention-option", type: "button" },
      el("span", { class: "label" }, o.label),
      o.impact ? el("span", { class: "impact" }, o.impact) : null);
    b.addEventListener("click", () => act("choose", { optionId: o.id }));
    return b;
  }

  function render() {
    const parts = [el("p", { class: "eyebrow" }, INTERVENTION_EYEBROW[c.pattern] || "Plan check"), el("p", { class: "rca-hypothesis" }, c.title)];
    if (c.evidence?.length) parts.push(el("ul", { class: "changes evidence" }, ...c.evidence.map((t) => el("li", { class: "info" }, el("span", { class: "sign" }, "·"), el("span", {}, t)))));
    if (c.status === "offered") {
      if (c.askReason) {
        parts.push(el("p", { class: "section-label" }, "What got in the way?"));
        const row = el("div", { class: "chips-row" });
        for (const [id, label] of REASONS) {
          const b = el("button", { class: "chip", type: "button" }, label);
          b.addEventListener("click", () => act("reason", { reason: id }));
          row.append(b);
        }
        parts.push(row);
      }
      if (c.recommendation) parts.push(el("p", { class: "intervention-rec" }, c.recommendation));
      const real = c.options.filter((o) => o.kind !== "talk");
      const talk = c.options.find((o) => o.kind === "talk");
      if (real.length) parts.push(el("div", { class: "intervention-options" }, ...real.map(option)));
      const keep = el("button", { class: "btn", type: "button" }, c.recommendation ? "Stick to the plan" : "Keep as is");
      keep.addEventListener("click", () => act("keep"));
      const talkBtn = el("button", { class: "btn", type: "button" }, "Talk it through");
      talkBtn.addEventListener("click", () => (talk ? act("choose", { optionId: talk.id }) : send(`About "${c.title}": can we talk it through?`)));
      parts.push(el("div", { class: "draft-actions" }, keep, talkBtn));
    } else if (c.status === "trial") {
      parts.push(el("div", { class: "experiment" },
        el("p", { class: "section-label" }, `Trying until ${fmtDay(c.reviewOn)}`),
        el("p", {}, c.chosen || ""),
        el("p", { class: "hint" }, "Your plan and goal date stay as they are until you decide to keep this.")));
      const cancel = el("button", { class: "btn", type: "button" }, "Cancel trial");
      cancel.addEventListener("click", () => act("cancel"));
      parts.push(el("div", { class: "draft-actions" }, cancel));
    } else if (c.status === "confirm") {
      parts.push(el("div", { class: "experiment" }, el("p", { class: "section-label" }, "Make this your plan?"), el("p", {}, c.verdict || c.chosen || "")));
      const no = el("button", { class: "btn", type: "button" }, "Go back");
      const yes = el("button", { class: "btn primary", type: "button" }, "Yes, make it my plan");
      no.addEventListener("click", () => act("decline"));
      yes.addEventListener("click", () => act("confirm"));
      parts.push(el("div", { class: "draft-actions" }, no, yes));
    } else {
      const done = [INTERVENTION_DONE[c.status] ?? c.status, c.chosen && c.status !== "kept" ? `: ${c.chosen}` : ""].join("");
      if (done) parts.push(el("p", { class: `rca-status ${c.status === "confirmed" || c.status === "applied" ? "helped" : ""}` }, done));
      if (c.verdict) parts.push(el("p", { class: "hint" }, c.verdict));
    }
    card.replaceChildren(...parts);
  }
  render();
  return card;
}

/** Plan history: every plan agreed to, newest first. Going back saves a new version, so nothing is lost. */
function planHistorySection() {
  const wrap = el("div", { class: "stack plan-history" },
    el("p", { class: "hint" }, "Each time your goal, targets or routine changes, a version is saved here. Going back to one cancels any trial that's running."));
  const list = el("ul", { class: "list plan-list" });
  wrap.append(list);
  const summary = (s) => {
    const bits = [];
    if (s.goal) {
      const t = s.goal.targets || {};
      const goal = [t.weight_kg != null ? `${t.weight_kg} kg` : null, t.body_fat_pct != null ? `${t.body_fat_pct}% fat` : null, t.muscle_mass_kg != null ? `${t.muscle_mass_kg} kg muscle` : null].filter(Boolean).join(", ");
      bits.push(`${goal || "Goal"} by ${fmtDay(s.goal.deadline)}`);
    }
    const tg = s.targets || {};
    bits.push([tg.calorieTarget ? `${tg.calorieTarget} kcal` : null, tg.proteinTarget ? `${tg.proteinTarget} g protein` : null, tg.stepTarget ? `${tg.stepTarget} steps` : null].filter(Boolean).join(" · "));
    if (s.routine?.length) bits.push(`${s.routine.length} routine ${s.routine.length === 1 ? "item" : "items"}`);
    return bits.filter(Boolean);
  };
  async function paint() {
    try {
      const r = await api("/plan/versions");
      if (!r.versions.length) return list.replaceChildren(el("li", { class: "none hint" }, "No saved versions yet. One is saved the next time your plan changes."));
      list.replaceChildren(...r.versions.map((v, idx) => {
        const li = el("li", { class: "plan-version" },
          el("div", { class: "plan-head" },
            el("b", {}, `Version ${v.version}`),
            el("span", { class: "hint" }, new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))),
          el("p", { class: "plan-reason" }, v.reason),
          ...summary(v.snapshot).map((t) => el("p", { class: "hint" }, t)));
        if (idx === 0) li.append(el("p", { class: "rca-status helped" }, "Current plan"));
        else {
          const b = el("button", { class: "btn", type: "button" }, "Go back to this");
          b.addEventListener("click", async () => {
            b.disabled = true;
            try {
              await api(`/plan/versions/${encodeURIComponent(v.id)}/revert`, { method: "POST" });
              toast(`Back to version ${v.version}.`);
              refresh?.();
              paint();
            } catch (err) {
              b.disabled = false;
              toast(err.message);
            }
          });
          li.append(b);
        }
        return li;
      }));
    } catch (err) {
      list.replaceChildren(el("li", { class: "none hint" }, err.message));
    }
  }
  paint();
  return wrap;
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
  ["intervention", "Plan check-ins"],
  ["plan_meal", "Planned meals"],
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

/** A small on/off switch for a settings row. */
function switchEl(on, label, onToggle) {
  const b = el("button", { class: "switch", type: "button", role: "switch", "aria-checked": String(on), "aria-label": label });
  b.addEventListener("click", () => onToggle(b.getAttribute("aria-checked") !== "true"));
  return b;
}

/** A settings row: title and an optional quiet line on the left, a control on the right. */
function settingRow(title, sub, control) {
  return el("div", { class: "set-row" },
    el("div", { class: "set-text" }, el("span", {}, title), sub ? el("small", {}, sub) : null),
    control);
}

/** Coach memory: the lines the coach keeps about you. Read, edit, remove, add. */
function memorySection() {
  const wrap = el("div", { class: "stack memory" },
    el("p", { class: "hint" }, "When you tell the coach something that should stick, like a travel week, an injury or a food you can't stand, it lands here and goes into every reply. Edit or remove anything; nothing is kept that you can't see."));
  const list = el("ul", { class: "list memory-list" });
  const input = el("input", { class: "field", name: "text", maxlength: "200", placeholder: "Something the coach should remember", autocomplete: "off", required: true });
  const count = el("p", { class: "hint count" });
  const form = el("form", { class: "memory-add", onsubmit: submitter(async (fd) => {
    const text = String(fd.get("text") || "").trim();
    if (!text) return;
    const r = await api("/memory", { method: "POST", body: JSON.stringify({ text }) });
    if (!r.ok) throw new Error(r.error === "memory_full" ? "The list is full. Remove a line first." : "Couldn't save that.");
    input.value = "";
    toast(r.duplicate ? "Already on the list." : "The coach will remember that.");
    await paint();
  }) }, input, el("button", { class: "btn primary", type: "submit" }, "Add"));
  wrap.append(list, form, count);

  function row(line) {
    const li = el("li", { class: "memory-line" });
    const text = el("span", { class: "main" }, line.text,
      line.expiresOn ? el("span", { class: "memory-until" }, `Until ${new Date(`${line.expiresOn}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`) : null);
    const edit = el("button", { class: "link small", type: "button", onclick: () => {
      const box = el("input", { class: "field", value: line.text, maxlength: "200" });
      const save = el("button", { class: "link small", type: "button", onclick: async () => {
        const next = box.value.trim();
        if (!next || next === line.text) { li.replaceWith(row(line)); return; }
        try {
          const r = await api(`/memory/${encodeURIComponent(line.id)}`, { method: "PUT", body: JSON.stringify({ text: next }) });
          li.replaceWith(row(r.line));
        } catch (err) { toast(err.message); }
      } }, "Save");
      li.replaceChildren(box, save);
      box.focus();
    } }, "Edit");
    const remove = el("button", { class: "link small quiet", type: "button", onclick: async () => {
      try {
        await api(`/memory/${encodeURIComponent(line.id)}`, { method: "DELETE" });
        li.remove();
        await paint();
      } catch (err) { toast(err.message); }
    } }, "Remove");
    li.append(text, el("span", { class: "memory-actions" }, edit, remove));
    return li;
  }

  async function paint() {
    try {
      const r = await api("/memory");
      state.memoryCount = r.lines.length;
      list.replaceChildren(...(r.lines.length ? r.lines.map(row) : [el("li", { class: "none hint" }, "Nothing yet. Tell the coach in chat, or add a line below.")]));
      count.textContent = r.lines.length ? `${r.lines.length} of ${r.max} lines.` : "";
      const sub = $("you-memory");
      if (sub) sub.textContent = r.lines.length ? `${r.lines.length} ${r.lines.length === 1 ? "line" : "lines"} the coach keeps in mind` : "What the coach remembers about you";
    } catch (err) {
      list.replaceChildren(el("li", { class: "none hint" }, err.message));
    }
  }
  paint();
  return wrap;
}

function notificationsSection() {
  const wrap = el("div", { class: "settings-list" });
  const phone = el("div", { class: "set-group" });
  const kinds = el("div", { class: "set-group" });
  const quiet = el("div", { class: "set-group" });
  const kindsLabel = el("p", { class: "section-label" }, "Nudges");
  const quietLabel = el("p", { class: "section-label" }, "Quiet hours");
  wrap.append(phone, kindsLabel, kinds, quietLabel, quiet);

  let prefs = { quietStart: "22:30", quietEnd: "07:00", off: [] };
  let busy = false;
  const savePrefs = async (patch) => {
    prefs = { ...prefs, ...patch };
    const cached = getCache.get("/push");
    if (cached) getCache.set("/push", { ...cached, prefs });
    try { await api("/push/prefs", { method: "POST", body: JSON.stringify(patch) }); } catch (err) { toast(err.message); }
  };

  async function paint() {
    const sub = await currentSubscription().catch(() => null);
    const on = !!sub && Notification.permission === "granted";
    const test = el("button", { class: "link small", type: "button", onclick: async () => {
      try { await api("/push/test", { method: "POST" }); toast("Sent. It should arrive in a few seconds."); } catch (err) { toast(err.message); }
    } }, "Send a test");
    phone.replaceChildren(
      settingRow("On this phone", on ? "Meals, steps, workouts and reviews" : "Off. Turn on to get nudges.",
        switchEl(on, "Notifications on this phone", async () => {
          if (busy) return;
          busy = true;
          try { (await currentSubscription()) ? await disablePush() : await enablePush(); } catch (err) { toast(err.message); }
          busy = false;
          paint();
        })),
      ...(on ? [el("div", { class: "set-foot" }, test)] : []),
    );
    kinds.replaceChildren(...NUDGES.map(([k, label]) =>
      settingRow(label, null, switchEl(!prefs.off.includes(k), label, (next) => {
        savePrefs({ off: next ? prefs.off.filter((x) => x !== k) : [...prefs.off, k] });
        paint();
      }))));
    for (const n of [kindsLabel, kinds, quietLabel, quiet]) n.hidden = !on;
  }

  const paintAll = () => {
    const time = (key) => el("input", { class: "time-field", type: "time", value: prefs[key], onchange: (e) => savePrefs({ [key]: e.target.value }) });
    quiet.replaceChildren(settingRow("From", null, time("quietStart")), settingRow("Until", null, time("quietEnd")));
    paint();
  };
  // The phone's own switch doesn't need the server: draw it now, then fill in the saved choices.
  if (!getCache.has("/push")) paintAll();
  withCache("/push", (r) => { prefs = r.prefs || prefs; paintAll(); });
  return wrap;
}

// ---------- account ----------

/** Who's signed in, Hevy, the Health Connect token, and sign-out. */
// ---------- plan & billing ----------
// Screens: Plans → Review → Payment result, and Your plan (manage). MAGNUS_BILLING=preview shows
// them with a simulated payment and a "Preview as" switch, so the flow can be checked before
// Razorpay is linked. Nothing here decides access: the server's entitlement does.

const pay = { planId: "yearly", previewAs: null, result: null };
const PREVIEW_STATES = [["", "Real"], ["trial", "Trial"], ["free", "Free"], ["pro", "Pro"], ["past_due", "Payment issue"], ["cancelled", "Cancelled"]];
const PRO_PERKS = [
  ["Coach without a daily cap", "Ask, log and plan in chat as much as you like."],
  ["Meal photos", "Snap a plate and get it estimated."],
  ["Nightly digest and weekly review", "How the day went, and one thing to do tomorrow."],
  ["Adaptive targets", "Calories and macros that follow your real progress."],
];
const longDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const daysLeftOf = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;
const PERIOD_DAYS = { monthly: 30, yearly: 365 };

function billingNow() { return getCache.get("/billing") || null; }

/** The entitlement to show: the server's, or in preview the state picked under "Preview as". */
function shownEntitlement(b) {
  if (!b || b.mode !== "preview" || !pay.previewAs) return b?.entitlement;
  const at = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
  const base = { trialEndsAt: null, periodEndsAt: null, status: null, plan: null, provider: null };
  return {
    trial: { ...base, tier: "trial", trialEndsAt: at(3) },
    free: { ...base, tier: "free", trialEndsAt: at(-2) },
    pro: { ...base, tier: "pro", status: "active", plan: pay.planId, provider: "razorpay", periodEndsAt: at(PERIOD_DAYS[pay.planId]) },
    past_due: { ...base, tier: "pro", status: "past_due", plan: "monthly", provider: "razorpay", periodEndsAt: at(-1) },
    cancelled: { ...base, tier: "pro", status: "cancelled", plan: "monthly", provider: "razorpay", periodEndsAt: at(18) },
  }[pay.previewAs];
}

/** Pays for real only when billing is on and Razorpay is linked; in preview it simulates. */
const canPayForReal = (b) => b?.mode === "on" && !!b.razorpay;

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

/** Razorpay Checkout. Resolves "paid", "confirming" (paid, our confirm didn't land) or "dismissed". */
async function razorpayCheckout(planId) {
  const [Razorpay, sub] = await Promise.all([
    loadRazorpay(),
    api("/billing/razorpay/subscribe", { method: "POST", body: JSON.stringify({ plan: planId }) }),
  ]);
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: sub.keyId,
      subscription_id: sub.subscriptionId,
      name: "Magnus Pro",
      description: planId === "yearly" ? "Yearly plan" : "Monthly plan",
      theme: { color: "#c9a24a" },
      handler: async (resp) => {
        try { await api("/billing/razorpay/confirm", { method: "POST", body: JSON.stringify(resp) }); resolve("paid"); }
        catch { resolve("confirming"); }
      },
      modal: { ondismiss: () => resolve("dismissed") },
    });
    rzp.on("payment.failed", (e) => reject(new Error(e?.error?.description || "The payment didn't go through.")));
    rzp.open();
  });
}

function showPayResult(result) {
  pay.result = result;
  fetchCached("/billing").catch(() => {});
  openSheet("payResult");
}

function plansScreen() {
  const box = el("div", { class: "stack pay" });
  const paint = (b) => {
    if (!b) { box.replaceChildren(el("p", { class: "hint" }, "Loading…")); return; }
    const e = shownEntitlement(b);
    const a = b.amounts || { monthly: 649, yearly: 6999 };
    const save = Math.max(0, Math.round((1 - a.yearly / (a.monthly * 12)) * 100));
    const card = (id, title, price, sub, tag) => el("button", {
      class: `plan-card${pay.planId === id ? " on" : ""}`, type: "button", role: "radio", "aria-checked": String(pay.planId === id),
      onclick: () => { pay.planId = id; paint(b); },
    }, el("span", { class: "plan-top" }, el("strong", {}, title), tag ? el("span", { class: "plan-tag" }, tag) : null),
      el("span", { class: "plan-price" }, price), el("span", { class: "hint" }, sub));
    const status = e?.tier === "trial"
      ? `Your free trial has ${daysLeftOf(e.trialEndsAt)} day${daysLeftOf(e.trialEndsAt) === 1 ? "" : "s"} left. Pick a plan now and nothing is charged until the trial ends on ${longDate(e.trialEndsAt)}.`
      : e?.tier === "free"
        ? `You're on the free plan: ${b.freeLimits.chat} coach messages and ${b.freeLimits.photo} meal photo a day.`
        : null;
    const proNow = e?.tier === "pro";
    box.replaceChildren(
      previewSwitch(b, () => paint(b)),
      el("p", { class: "pay-lede" }, "Everything Magnus does, every day."),
      el("ul", { class: "perk-list" }, ...PRO_PERKS.map(([t, d]) => el("li", {}, el("strong", {}, t), el("span", { class: "hint" }, d)))),
      proNow
        ? el("div", { class: "stack" }, el("p", { class: "hint" }, "You're on Magnus Pro."), el("button", { class: "btn block", type: "button", onclick: () => openSheet("managePlan") }, "Manage your plan"))
        : el("div", { class: "stack" },
          status ? el("p", { class: "hint" }, status) : null,
          el("div", { class: "plan-cards", role: "radiogroup", "aria-label": "Plan" },
            card("yearly", "Yearly", `${inr(a.yearly)} / year`, `${inr(Math.round(a.yearly / 12))} a month`, save ? `Save ${save}%` : null),
            card("monthly", "Monthly", `${inr(a.monthly)} / month`, "Cancel any time", null)),
          el("button", { class: "btn primary block", type: "button", onclick: () => openSheet("checkout") }, `Continue with ${pay.planId === "yearly" ? "Yearly" : "Monthly"}`),
          el("p", { class: "hint center-text" }, "Renews automatically. Cancel any time from You → Plan.")),
    );
  };
  withCache("/billing", paint, () => box.replaceChildren(el("p", { class: "hint" }, "Couldn't load plans. Check your connection.")));
  return box;
}

/** Preview mode only: look at every state without paying or changing anything. */
function previewSwitch(b, repaint) {
  if (b.mode !== "preview") return null;
  return el("div", { class: "stack preview-box" },
    el("p", { class: "hint" }, "Preview: payments are simulated and nothing is charged or saved."),
    el("div", { class: "seg", role: "radiogroup", "aria-label": "Preview as" }, ...PREVIEW_STATES.map(([k, l]) =>
      el("button", { type: "button", class: (pay.previewAs || "") === k ? "on" : "", role: "radio", "aria-checked": String((pay.previewAs || "") === k),
        onclick: () => { pay.previewAs = k || null; repaint(); paintPlanSection(); paintPlanBanner(); } }, l))));
}

function checkoutScreen() {
  const b = billingNow();
  if (!b) return el("p", { class: "hint" }, "Loading…");
  const a = b.amounts || { monthly: 649, yearly: 6999 };
  const amount = a[pay.planId];
  const e = shownEntitlement(b);
  // During the trial the first charge waits for its end (the server sets Razorpay's start_at).
  const firstCharge = e?.tier === "trial" && e.trialEndsAt && Date.parse(e.trialEndsAt) > Date.now() + 3600_000 ? e.trialEndsAt : null;
  const renews = longDate(new Date((firstCharge ? Date.parse(firstCharge) : Date.now()) + PERIOD_DAYS[pay.planId] * 86_400_000).toISOString());
  const row = (k, v) => el("div", { class: "row-between pay-row" }, el("span", { class: "hint" }, k), el("span", {}, v));
  const real = canPayForReal(b);
  const btn = el("button", { class: "btn primary block", type: "button", disabled: !real && b.mode !== "preview", onclick: async () => {
    btn.disabled = true;
    btn.textContent = "Opening payment…";
    try {
      if (!real) {
        await new Promise((r) => setTimeout(r, 900));
        pay.previewAs = "pro";
        showPayResult({ kind: "success", planId: pay.planId, simulated: true, firstCharge });
        return;
      }
      const out = await razorpayCheckout(pay.planId);
      if (out === "paid") showPayResult({ kind: "success", planId: pay.planId, firstCharge });
      else if (out === "confirming") showPayResult({ kind: "pending", planId: pay.planId });
    } catch (err) {
      if (err.code === "already_subscribed") { toast("You're already on Pro."); openSheet("managePlan"); return; }
      showPayResult({ kind: "failed", planId: pay.planId, message: err.message });
    } finally {
      btn.disabled = false;
      btn.textContent = payLabel;
    }
  } });
  const payLabel = !real && b.mode !== "preview" ? "Payments open soon" : firstCharge ? "Set up autopay" : `Pay ${inr(amount)}`;
  btn.textContent = payLabel;
  return el("div", { class: "stack pay" },
    el("div", { class: "card" },
      row("Plan", `Magnus Pro · ${pay.planId === "yearly" ? "Yearly" : "Monthly"}`),
      firstCharge ? row("Today", "₹0, the trial keeps running") : row("Today", inr(amount)),
      firstCharge ? row("First charge", `${inr(amount)} on ${longDate(firstCharge)}`) : null,
      row("Renews", `${renews}, then every ${pay.planId === "yearly" ? "year" : "month"}`),
      row("Cancel", "Any time, Pro stays until the period ends")),
    btn,
    el("p", { class: "hint" }, "Paid through Razorpay with UPI, card or netbanking. You approve an autopay mandate once; your card and UPI details never reach Magnus."),
    b.mode === "preview" ? el("p", { class: "hint" }, "Preview: tapping Pay simulates a successful payment.") : null,
  );
}

function payResultScreen() {
  const r = pay.result || { kind: "failed", message: "Nothing to show." };
  const done = el("button", { class: "btn primary block", type: "button", onclick: () => { closeSheet(); paintPlanSection(); paintPlanBanner(); } }, "Done");
  if (r.kind === "success") {
    return el("div", { class: "stack pay pay-result" },
      el("div", { class: "pay-badge good", "aria-hidden": "true" }, "✓"),
      el("h3", {}, "You're on Magnus Pro"),
      el("p", { class: "hint" }, `${r.planId === "yearly" ? "Yearly" : "Monthly"} plan. ${r.firstCharge ? `Nothing is charged until ${longDate(r.firstCharge)}, when your trial ends.` : "A receipt is on its way from Razorpay."}${r.simulated ? " (Preview: nothing was charged.)" : ""}`),
      el("ul", { class: "perk-list" }, ...PRO_PERKS.map(([t]) => el("li", {}, el("strong", {}, t)))),
      done);
  }
  if (r.kind === "pending") {
    const line = el("p", { class: "hint" }, "Your payment went through. We're waiting for Razorpay to confirm it, which usually takes a few seconds.");
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const b = await api("/billing");
        getCache.set("/billing", b);
        if (b.entitlement?.tier === "pro") { showPayResult({ kind: "success", planId: r.planId }); return; }
      } catch { /* keep waiting */ }
      if (tries < 10 && pay.result === r) setTimeout(poll, 3000);
      else if (pay.result === r) line.textContent = "Still confirming. You can close this: Pro turns on by itself once Razorpay confirms, and you won't be charged twice.";
    };
    setTimeout(poll, 2000);
    return el("div", { class: "stack pay pay-result" }, el("div", { class: "pay-badge", "aria-hidden": "true" }, "…"), el("h3", {}, "Confirming your payment"), line, done);
  }
  return el("div", { class: "stack pay pay-result" },
    el("div", { class: "pay-badge bad", "aria-hidden": "true" }, "!"),
    el("h3", {}, "The payment didn't go through"),
    el("p", { class: "hint" }, `${r.message || "Something went wrong."} Nothing was charged. If money left your account, it is refunded automatically.`),
    el("button", { class: "btn primary block", type: "button", onclick: () => openSheet("checkout") }, "Try again"),
    el("button", { class: "btn block", type: "button", onclick: () => { closeSheet(); } }, "Not now"));
}

function managePlanScreen() {
  const box = el("div", { class: "stack pay" });
  const paint = (b) => {
    if (!b) return;
    const e = shownEntitlement(b);
    const row = (k, v) => el("div", { class: "row-between pay-row" }, el("span", { class: "hint" }, k), el("span", {}, v));
    const parts = [previewSwitch(b, () => paint(b))];
    if (e?.tier !== "pro") {
      parts.push(el("p", { class: "hint" }, e?.tier === "trial" ? `Free trial, ${daysLeftOf(e.trialEndsAt)} days left.` : "Free plan."),
        el("button", { class: "btn primary block", type: "button", onclick: () => openSheet("plans") }, "See plans"));
    } else {
      const until = longDate(e.periodEndsAt);
      if (e.status === "past_due") {
        parts.push(el("div", { class: "card pay-warn" },
          el("strong", {}, "Your last renewal didn't go through"),
          el("p", { class: "hint" }, "Razorpay tries again over the next few days. Check that your UPI autopay or card is still active. Pro stays on meanwhile; if it can't be renewed, you move to the free plan and keep all your data.")));
      }
      parts.push(el("div", { class: "card" },
        row("Plan", e.provider === "manual" || !e.plan ? "Magnus Pro" : `Magnus Pro · ${e.plan === "yearly" ? "Yearly" : "Monthly"}`),
        until ? row(e.status === "cancelled" ? "Ends" : e.status === "past_due" ? "Was due" : "Renews", until) : null,
        row("Status", { active: "Active", cancelled: "Cancelled, won't renew", past_due: "Payment issue", pending: "Starting", expired: "Ended" }[e.status] || "Active")));
      if (e.status === "cancelled") parts.push(el("p", { class: "hint" }, `You keep Pro until ${until}. After that you're on the free plan, and you can pick a plan again any time.`));
      if (e.provider === "razorpay" && (e.status === "active" || e.status === "past_due")) {
        parts.push(el("button", { class: "link danger", type: "button", onclick: async () => {
          if (!confirm(`Cancel Magnus Pro? You keep it until ${until || "the end of the period"}, and you won't be charged again.`)) return;
          try {
            if (b.mode === "preview" && pay.previewAs) pay.previewAs = "cancelled";
            else await api("/billing/cancel", { method: "POST" });
            toast("Cancelled. Pro stays on until the period ends.");
            await fetchCached("/billing").catch(() => {});
            paint(billingNow());
            paintPlanSection();
          } catch (err) { toast(err.message); }
        } }, "Cancel subscription"));
      }
    }
    box.replaceChildren(...parts);
  };
  withCache("/billing", paint, () => box.replaceChildren(el("p", { class: "hint" }, "Couldn't load your plan.")));
  return box;
}

/**
 * The plan banner on Coach and Today, from the server's experience (trial ending, trial ended,
 * payment issue, Pro ending). In preview, the "Preview as" state's banner. Dismissed per day.
 */
async function paintPlanBanner() {
  const nodes = document.querySelectorAll("[data-plan-banner]");
  let b = billingNow();
  if (b?.mode === "preview" && pay.previewAs) {
    try { b = await api(`/billing?as=${encodeURIComponent(pay.previewAs)}`); } catch { return; }
  }
  const banner = b?.experience?.banner;
  const key = banner ? `plan-banner:${banner.kind}:${localToday()}` : null;
  const show = banner && (!banner.dismissible || !store.get(key, false));
  for (const n of nodes) {
    n.hidden = !show;
    if (!show) { n.replaceChildren(); continue; }
    n.classList.toggle("warn", banner.kind === "payment_issue");
    n.replaceChildren(
      el("span", {}, banner.text),
      el("div", { class: "plan-banner-actions" },
        el("button", { class: "link", type: "button", onclick: () => openSheet(banner.action) }, banner.action === "plans" ? "See plans" : "Fix"),
        banner.dismissible ? el("button", { class: "icon-btn ghost small", type: "button", "aria-label": "Hide for today", onclick: () => { store.set(key, true); paintPlanBanner(); } }, "×") : null));
  }
}

/** The Magnus Pro row on You: one status line, opening Plans or Your plan. */
function paintPlanSection() {
  const row = $("you-plan");
  const b = billingNow();
  if (!row || !b) return;
  row.hidden = b.mode === "off";
  if (row.hidden) return;
  const e = shownEntitlement(b);
  const pro = e.tier === "pro";
  row.dataset.sheet = pro ? "managePlan" : "plans";
  const line = pro
    ? e.status === "past_due" ? "Payment issue: tap to see what to do" : e.status === "cancelled" ? `Pro until ${longDate(e.periodEndsAt)}, won't renew` : `Pro${e.periodEndsAt ? `, renews ${longDate(e.periodEndsAt)}` : ""}`
    : e.tier === "trial" ? `Free trial, ${daysLeftOf(e.trialEndsAt)} days left` : "Free plan: see what Pro adds";
  const small = $("you-plan-line");
  small.textContent = line;
  small.classList.toggle("warn-text", e.status === "past_due");
}

/**
 * One tap, no token to copy: a fresh token for this phone (the old one is revoked) goes straight to
 * the Android app, which asks for Health Connect access, syncs and comes back here (?hc=connected).
 */
async function connectHealthConnect(button) {
  if (button) button.disabled = true;
  try {
    const r = await api("/account/tokens", { method: "POST", body: JSON.stringify({ label: "Android app", replace: true }) });
    location.href = `intent://connect?token=${encodeURIComponent(r.token)}#Intent;scheme=magnus;package=app.magnus.health;S.browser_fallback_url=${encodeURIComponent(ANDROID_APK_URL)};end`;
  } catch (err) { toast(err.message); }
  if (button) setTimeout(() => { button.disabled = false; }, 1500);
}

/** Already linked: the app asks Health Connect for the data types a newer version reads. */
function askNewHealthConnectData() {
  $("hc-prompt").hidden = true;
  location.href = `intent://connect#Intent;scheme=magnus;package=app.magnus.health;S.browser_fallback_url=${encodeURIComponent(ANDROID_APK_URL)};end`;
}

/** In the Android app and not linked yet: a one-tap prompt on Today. */
async function checkHealthConnectPrompt() {
  const box = $("hc-prompt");
  if (!box || box.dataset.mode === "upgrade" || !inAndroidApp() || store.get(HC_LINKED_KEY, false) || store.get(HC_DISMISSED_KEY, false)) return;
  try {
    const a = await api("/account");
    if ((a.tokens || []).some((t) => t.label === "Android app" && t.lastUsedAt)) { store.set(HC_LINKED_KEY, true); return; }
    box.hidden = false;
  } catch { /* offline: ask next time */ }
}

/** The Nutrition Summary CSV inside a MyFitnessPal export zip (or the CSV itself). */
async function mfpCsvFromFile(file) {
  if (!/\.zip$/i.test(file.name) && file.type !== "application/zip") return file.text();
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("That file isn't a zip.");
  let p = dv.getUint32(eocd + 16, true);
  const count = dv.getUint16(eocd + 10, true);
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    if (!/(^|\/)Nutrition-Summary[^/]*\.csv$/i.test(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    if (method === 0) return new TextDecoder().decode(data);
    if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("Can't open this zip here. Unzip it and pick the Nutrition-Summary CSV.");
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }
  throw new Error("No Nutrition Summary in that zip. Pick the file MyFitnessPal emailed you.");
}

async function importMfpFile(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const fail = { not_mfp_summary: "That isn't a MyFitnessPal Nutrition Summary.", no_meals: "No meals from the last year in that file.", too_many_rows: "That file is too big. Export a shorter range." };
  try {
    const csv = await mfpCsvFromFile(file);
    const send = (dryRun) => api("/import/myfitnesspal", { method: "POST", body: JSON.stringify({ csv, dryRun }) });
    const preview = await send(true);
    if (!preview.meals) { toast(preview.alreadyImported ? "Already imported." : "Nothing new to import: those days are already logged here."); return; }
    const skipped = preview.skippedLoggedDays ? ` ${preview.skippedLoggedDays} day(s) you already logged here stay as they are.` : "";
    if (!confirm(`Import ${preview.days} day(s) from ${fmtDay(preview.from)} to ${fmtDay(preview.to)}, about ${fmt(preview.avgCalories)} kcal a day?${skipped}`)) return;
    const done = await send(false);
    toast(`Imported ${done.days} day(s) from MyFitnessPal. They're in your Progress trends.`);
  } catch (err) {
    toast(fail[err.code] || err.message);
  }
}

/** Forgets everything this phone cached about the account; keeps the sign-in, theme and app link. */
function resetLocalState() {
  // The sign-in (magnus-auth*, Supabase's sb-* session) and the theme stay.
  const keep = (k) => k.startsWith("magnus-auth") || k.startsWith("sb-") || k === THEME_KEY;
  try {
    for (const k of Object.keys(localStorage)) if (!keep(k)) localStorage.removeItem(k);
  } catch { /* private mode */ }
  getCache.clear();
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
  const mfpFile = el("input", { type: "file", accept: ".zip,.csv,application/zip,text/csv", hidden: true, onchange: () => importMfpFile(mfpFile) });
  const mfp = el("button", { class: "link", type: "button", onclick: () => mfpFile.click() }, "Import from MyFitnessPal");
  const remove = el("button", { class: "link danger", type: "button", onclick: async () => {
    const typed = prompt("This deletes your account and every meal, weigh-in and message. It can't be undone. Type DELETE to confirm.");
    if (typed !== "DELETE") return;
    try {
      await api("/account", { method: "DELETE", body: JSON.stringify({ confirm: "DELETE" }) });
      closeSheet();
      endSession("Your account and data were deleted.");
    } catch (err) { toast(err.message); }
  } }, "Delete account");
  const food = el("div", { class: "stack" });
  // Owner only: try Magnus as a brand-new user, any time. Keeps the Google sign-in.
  const fresh = el("div", { class: "stack", hidden: true },
    el("p", { class: "section-label" }, "Owner"),
    el("p", { class: "hint" }, "Start fresh: wipes your meals, weigh-ins, chats, plan and connections, and opens onboarding as a new user. You stay signed in. It can't be undone."),
    el("button", { class: "link danger", type: "button", onclick: async () => {
      const typed = prompt("Start over as a new user? Everything is wiped. Type RESET to confirm.");
      if (typed !== "RESET") return;
      try {
        await api("/account/reset", { method: "POST", body: JSON.stringify({ confirm: "RESET" }) });
        resetLocalState();
        location.replace("/app/");
      } catch (err) { toast(err.message); }
    } }, "Start fresh as a new user"));
  wrap.append(who, fresh, el("p", { class: "section-label" }, "Food"), food, el("p", { class: "section-label" }, "Hevy"), hevy, el("p", { class: "section-label" }, "Health Connect"), hc,
    el("p", { class: "section-label" }, "Your data"), el("p", { class: "hint" }, "Your data is yours: download all of it, or delete it for good."), el("div", { class: "row-between" }, download, remove),
    el("p", { class: "hint" }, "Coming from MyFitnessPal? Export your data there (Settings, then Export data) and pick the zip here. Your past days show up in your trends."), mfp, mfpFile, out);

  function paintFood(prefs) {
    if (!prefs) { food.replaceChildren(); return; }
    const value = { diet: prefs.diet, dietNote: prefs.dietNote || "", foodAvoid: [...(prefs.foodAvoid || [])] };
    const save = el("button", { class: "btn block", type: "button", disabled: true, onclick: async () => {
      if (value.diet === "custom" && !value.dietNote.trim()) { toast("Describe how you eat."); return; }
      save.disabled = true;
      try {
        await api("/account/food", { method: "PUT", body: JSON.stringify({ diet: value.diet || "non_vegetarian", dietNote: value.diet === "custom" ? value.dietNote.trim() : null, foodAvoid: value.foodAvoid }) });
        toast("Saved. The coach will stick to it.");
        fetchCached("/account").catch(() => {});
      } catch (err) { toast(err.message); save.disabled = false; }
    } }, "Save food preferences");
    food.replaceChildren(foodPrefsEditor(el, value, () => { save.disabled = false; }), save);
  }

  function paintHevy(connected) {
    if (connected) {
      hevy.replaceChildren(
        el("p", { class: "hint" }, "Connected. Workouts and routines come from your Hevy account."),
        el("button", { class: "link", type: "button", onclick: async () => {
          try { await api("/integrations/hevy", { method: "DELETE" }); toast("Hevy disconnected."); paintHevy(false); fetchCached("/account").catch(() => {}); } catch (err) { toast(err.message); }
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
        fetchCached("/account").catch(() => {});
        refresh();
      }) },
        el("p", { class: "hint" }, "Paste your Hevy API key (needs Hevy Pro). I read workouts and only change routines when you tap Apply."),
        el("p", { class: "hint" }, "Get your key here: ", el("a", { class: "ext", href: HEVY_KEY_URL, target: "_blank", rel: "noopener noreferrer" }, HEVY_KEY_URL)),
        el("input", { class: "field", name: "key", type: "password", autocomplete: "off", placeholder: "Hevy API key", required: true }),
        el("button", { class: "btn block", type: "submit" }, "Connect Hevy"),
      ),
    );
  }

  function paintHc(tokens) {
    const list = tokens.map((t) => el("div", { class: "row-between" },
      el("span", { class: "hint" }, `${t.label} · ${t.lastUsedAt ? `last sync ${new Date(t.lastUsedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : "not used yet"}`),
      el("button", { class: "link danger", type: "button", onclick: async () => {
        try { await api(`/account/tokens/${t.id}`, { method: "DELETE" }); toast("Disconnected."); if (t.label === "Android app") store.set(HC_LINKED_KEY, null); load(); } catch (err) { toast(err.message); }
      } }, t.label === "Android app" ? "Disconnect" : "Revoke")));
    const phone = tokens.some((t) => t.label === "Android app");
    if (inAndroidApp()) {
      hc.replaceChildren(
        el("p", { class: "hint" }, "Steps, walks, sleep, resting heart rate, workouts' calories and scale readings sync from Health Connect every hour. One tap, then allow access on the next screen."),
        ...list,
        el("button", { class: "btn primary block", type: "button", onclick: (e) => connectHealthConnect(e.currentTarget) }, phone ? "Reconnect Health Connect" : "Connect Health Connect"),
      );
      return;
    }
    const webhook = el("details", { class: "stack" },
      el("summary", { class: "hint" }, "No Android app? Use HC Webhook with a token instead"),
      el("p", { class: "hint" }, "Create a token, then paste it into the HC Webhook app with this URL:"),
      el("code", { class: "copyable" }, `${location.origin}/api/health/ingest/health-connect`),
      el("button", { class: "btn block", type: "button", onclick: async (e) => {
        e.target.disabled = true;
        try {
          const r = await api("/account/tokens", { method: "POST", body: JSON.stringify({ label: "Health Connect" }) });
          await navigator.clipboard?.writeText(r.token).catch(() => {});
          webhook.append(el("p", { class: "hint" }, "Copied. It's shown only once:"), el("code", { class: "copyable" }, r.token));
          toast("Token created and copied.");
        } catch (err) { toast(err.message); }
        e.target.disabled = false;
      } }, "Create Health Connect token"),
    );
    hc.replaceChildren(
      el("p", { class: "hint" }, phone
        ? "This account syncs from the Magnus Android app. Open Magnus from the app icon to manage it."
        : "On Android, install the Magnus app: open it, tap Connect Health Connect and allow access. Steps, sleep, heart rate, workouts and weigh-ins then sync on their own, no token needed."),
      ...list,
      phone ? null : el("a", { class: "btn primary block", href: ANDROID_APK_URL, rel: "noopener" }, "Download the Android app"),
      webhook,
    );
  }

  function draw(a) {
    who.textContent = a.email ? `Signed in as ${a.email}` : a.name ? `Signed in as ${a.name}` : "Signed in with an app token.";
    fresh.hidden = !a.owner;
    paintHevy(a.hevyConnected);
    paintHc(a.tokens || []);
    paintFood(a.food);
  }
  // First open draws from the copy the You tab fetched; later changes re-read it.
  const load = () => fetchCached("/account").then(draw).catch((err) => { who.textContent = err.message; });
  withCache("/account", draw, (err) => { who.textContent = err.message; });
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

// ---------- weigh-in day ----------

const WD_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Which weekday the weekly weigh-in lands on; saved as soon as it's picked. */
function weighInDayForm(t) {
  const current = Number.isInteger(t.weighInDay) ? String(t.weighInDay) : "";
  const select = el("select", { class: "field", name: "weighInDay", "aria-label": "Weigh-in day" },
    el("option", { value: "", selected: current === "" }, "Any day, a week after the last"),
    ...WD_FULL.map((name, i) => el("option", { value: String(i), selected: current === String(i) }, name)));
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await api("/targets", { method: "POST", body: JSON.stringify({ weighInDay: select.value === "" ? null : Number(select.value) }) });
      toast(select.value === "" ? "Weigh-in a week after the last one." : `Weigh-ins on ${WD_FULL[Number(select.value)]}s.`);
      refresh();
    } catch (err) {
      toast(err.message);
    } finally {
      select.disabled = false;
    }
  });
  return el("div", { class: "stack" },
    el("p", { class: "section-label" }, "Weekly weigh-in"),
    el("label", {}, "Weigh-in day", select),
    el("p", { class: "hint" }, "Same day each week, before breakfast, gives the cleanest trend. Miss it and the reminder carries on the next day."),
  );
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
        cur.status === "trained_unlogged" ? (cur.hevy === false ? "✓ Trained" : "✓ Trained, not logged in Hevy") :
        `Skipped${cur.reason ? ` · ${cur.reason}` : ""}`;
      card.replaceChildren(el("div", { class: cur.status === "skipped" ? "muted" : "done-line" }, `${line} · ${day}`));
      return;
    }
    const noHevy = cur.hevy === false;
    const recheck = noHevy ? null : el("button", { class: "btn", type: "button" }, "Check Hevy again");
    const trained = el("button", { class: noHevy ? "btn primary" : "btn", type: "button" }, noHevy ? "Trained" : "Trained, didn't log");
    const skipped = el("button", { class: "btn primary", type: "button" }, "Skipped");
    const other = el("button", { class: "btn", type: "button", onclick: () => { state.activityDate = cur.date; openSheet("activity"); } }, "Did something else");
    if (noHevy) skipped.className = "btn";
    const buttons = [recheck, trained, skipped, other].filter(Boolean);
    recheck?.addEventListener("click", () => answer({ answer: "recheck" }, buttons));
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
      el("p", { class: "check-line" }, noHevy ? `Did you train after your ${clock(cur.gymTime)} slot?` : `Nothing in Hevy after your ${clock(cur.gymTime)} slot.`),
      el("div", { class: "draft-actions" }, ...[recheck, trained].filter(Boolean)),
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
function activityDraftCard(draft, { onDone, saved } = {}) {
  // The server knows what was saved (on any phone); this phone also remembers a discard.
  const status = saved ? { state: "logged", durationMin: saved.durationMin, kcal: saved.kcal } : confirmedDrafts()[draft.draftId];
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
function mealDraftCard(draft, { onDone, saved } = {}) {
  const status = saved ? { state: "logged", calories: saved.calories } : confirmedDrafts()[draft.draftId];
  const card = el("div", { class: "draft" });
  if (status) return finishedCard(card, draft, status);

  const original = JSON.stringify(draft.items);
  const items = draft.items.length ? draft.items.map((i) => ({ ...i })) : [{ name: draft.text, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }];
  let slot = SLOTS.some(([k]) => k === draft.slot) ? draft.slot : "snack";
  let editing = !draft.estimated || !draft.items.length;

  const kcal = el("div", { class: "draft-kcal" });
  const macros = el("div", { class: "macros" });
  const list = el("ul", { class: "items" });
  // The meal slot as one small picker next to the title, instead of a four-way switch.
  const seg = el("select", { class: "slot-pick", "aria-label": "Meal", onchange: (e) => { slot = e.target.value; } });
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
    seg.replaceChildren(...SLOTS.map(([k, label]) => el("option", { value: k, selected: k === slot }, label)));
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

  const discard = el("button", { class: "link quiet", type: "button", onclick: () => { markDraft(draft.draftId, { state: "discarded" }); finishedCard(card, draft, { state: "discarded" }); onDone?.(); } }, "Discard");

  card.append(...[
    el("div", { class: "draft-top" }, seg, edit),
    kcal, macros,
    !draft.estimated ? el("p", { class: "draft-note" }, "No estimate found. Enter calories and protein yourself.") : null,
    draft.servingAssumption ? assumptionNote(draft.servingAssumption) : null,
    list, add,
    el("div", { class: "draft-actions split" }, discard, confirm),
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

// Only the + quick-log picker is a bottom sheet. Everything bigger opens as its own full screen
// with a back arrow, and the phone's back button closes it (one history entry per open overlay).
const SHEET_ONLY = new Set(["quick"]);
const AUTOFOCUS = new Set(["steps", "checkin"]);

function hideOverlay() {
  state.sheetStack = [];
  state.overlayDepth = 0;
  state.sheetCleanup?.();
  state.sheetCleanup = null;
  $("sheet").hidden = true;
  $("scrim").hidden = true;
  document.body.classList.remove("screen-open");
}

/** Closes every open screen at once (the ×, a save, or a jump elsewhere). */
function closeSheet() {
  if ($("sheet").hidden) return;
  const depth = history.state?.overlay ? state.overlayDepth || 1 : 0;
  hideOverlay();
  if (depth) {
    // Pop the entries openSheet pushed; anything that navigates meanwhile waits for it (see setView).
    state.poppingOverlay = true;
    history.go(-depth);
  }
}

/** One step back: the screen underneath if a screen was opened from another, else close. */
function backSheet() {
  if ($("sheet").hidden) return;
  if (history.state?.overlay) history.back();
  else closeSheet();
}

window.addEventListener("popstate", () => {
  if (state.poppingOverlay) {
    state.poppingOverlay = false;
    const next = state.afterPop;
    state.afterPop = null;
    next?.();
    return;
  }
  if (state.ignorePop) { state.ignorePop = false; return; }
  // The phone's back button (or a swipe) while a screen is open: go to the one underneath, or close.
  if (!$("sheet").hidden) {
    state.sheetStack.pop();
    state.overlayDepth = Math.max(0, (state.overlayDepth || 1) - 1);
    const under = state.sheetStack.at(-1);
    if (under && state.overlayDepth > 0) openSheet(under, { fromHistory: true });
    else hideOverlay();
    return;
  }
  setView(viewFromHash(location.hash), { fromHistory: true });
});

/** Runs fn once a closing overlay's history entry has been popped (at once if none is pending). */
function afterClose(fn) {
  if (!state.poppingOverlay) return fn();
  const prev = state.afterPop;
  state.afterPop = () => { prev?.(); fn(); };
}

function openSheet(kind, { fromHistory = false } = {}) {
  const body = $("sheet-body");
  state.sheetCleanup?.();
  state.sheetCleanup = null;
  const titles = { activity: "Swim, run or sport", meal: "Log a meal", steps: "Steps & walks", checkin: "Weigh-in", settings: "Goal & targets", replan: "Your updated plan", routine: "Your routine", quick: "Log", scan: "Scan a packet", review: "Your week", notifications: "Notifications", memory: "Coach memory", plan: "Plan history", account: "Food, connections & account", plans: "Magnus Pro", checkout: "Review and pay", payResult: "Payment", managePlan: "Your plan", pastDays: "Past days", chatDay: "", dayPlan: "Day plan", ...mealsTitles };
  const screen = !SHEET_ONLY.has(kind);
  const sheet = $("sheet");
  sheet.classList.toggle("screen", screen);
  sheet.classList.toggle("bottom", !screen);
  $("sheet-title").textContent = titles[kind];
  body.replaceChildren(SHEETS[kind]());
  if (!fromHistory) {
    const stack = state.sheetStack;
    if (sheet.hidden) {
      state.sheetStack = [kind];
      state.overlayDepth = 1;
      history.pushState({ overlay: 1 }, "", location.hash || "#coach");
    } else if (stack.at(-1) === "quick") {
      // A pick from the + list takes the list's place, so back goes to the page, not the list.
      stack[stack.length - 1] = kind;
    } else if (stack.at(-1) !== kind) {
      // A screen opened from another screen: back returns to the first one.
      stack.push(kind);
      state.overlayDepth += 1;
      history.pushState({ overlay: state.overlayDepth }, "", location.hash || "#coach");
    }
  }
  sheet.hidden = false;
  sheet.scrollTop = 0;
  $("scrim").hidden = screen;
  document.body.classList.toggle("screen-open", screen);
  if (AUTOFOCUS.has(kind)) body.querySelector("input, textarea")?.focus();
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
  plans: plansScreen,
  checkout: checkoutScreen,
  payResult: payResultScreen,
  managePlan: managePlanScreen,
  dietSetup: setupScreen,
  dietMeal: mealScreen,
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
        tile("Weigh-in", '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1.2-1.6"/>', () => openSheet("checkin")),
        tile("Water", '<path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z"/>', () => { closeSheet(); quickWater(); }),
        tile("Eating out", '<path d="M5 3v7a2 2 0 0 0 4 0V3M7 10v11M15 21V3c2.5 1.5 4 4 4 8h-4"/>', () => { closeSheet(); afterClose(() => { if ($("view-coach").hidden) setView("coach"); eatingOut(); }); })),
      (state.usual || []).length
        ? el("div", { class: "usual-list" },
            el("p", { class: "section-label" }, "Again"),
            ...state.usual.slice(0, 2).map((m) => el("button", { class: "usual-row", type: "button", onclick: () => { closeSheet(); afterClose(() => { if ($("view-coach").hidden) setView("coach"); repeatMeal(m); }); } },
              el("span", {}, m.text), el("small", {}, `${fmt(m.totals.calories)} kcal`))))
        : null,
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
    // The food list comes first: free and instant. The AI and web lookup (it costs) only opens when a
    // search of the list finds nothing, or from a usual meal / photo the person chose.
    const ctx = state.mealCtx || {};
    state.mealCtx = null;
    const holder = el("div");
    const pickerBox = el("div", { class: "stack" });
    const lookupBox = el("div", { hidden: true });

    const showPicker = () => { lookupBox.hidden = true; pickerBox.hidden = false; };
    const openLookup = (text) => { pickerBox.hidden = true; lookupBox.hidden = false; lookupBox.replaceChildren(lookupForm(text)); lookupBox.querySelector("textarea")?.focus(); };

    function lookupForm(text) {
      const form = el("form", { class: "stack", onsubmit: submitter(async (fd) => {
        const btn = form.querySelector("button[type=submit]");
        btn.textContent = "Estimating… (checks the web, ~10 s)";
        let draft;
        try {
          draft = await api("/meals/draft", { method: "POST", body: JSON.stringify({ text: fd.get("text"), ...(ctx.slot ? { slot: ctx.slot } : {}) }) });
        } finally {
          btn.textContent = "Estimate";
        }
        form.hidden = true;
        holder.replaceChildren(mealDraftCard(draft, { onDone: () => setTimeout(closeSheet, 700) }));
      }) },
        el("p", { class: "hint" }, "Not in the food list, so this one is looked up with AI and web search."),
        el("textarea", { class: "field", name: "text", rows: "3", required: true, minlength: "2", placeholder: "e.g. 2 rotis, a bowl of dal, 100 g paneer bhurji" }, text || ""),
        el("button", { class: "btn primary block", type: "submit" }, "Estimate"),
        el("p", { class: "hint" }, "You'll see the estimate and can fix any line before it's logged."),
        el("button", { class: "link", type: "button", onclick: () => { closeSheet(); $("photo-input").click(); } }, "Or snap a photo of the plate"),
        el("button", { class: "link", type: "button", onclick: showPicker }, "Back to the food list"));
      return form;
    }

    pickerBox.append(...[
      (state.usual || []).length && !ctx.slot
        ? el("div", { class: "usual-list" },
            el("p", { class: "section-label" }, "Your usual"),
            ...state.usual.slice(0, 5).map((m) =>
              el("button", { class: "usual-row", type: "button", onclick: () => {
                pickerBox.hidden = true;
                holder.replaceChildren(mealDraftCard(usualDraft(m), { onDone: () => setTimeout(closeSheet, 700) }));
              } },
                el("span", {}, m.text),
                el("small", {}, `${fmt(m.totals.calories)} kcal · ${m.count}×`))))
        : null,
      el("p", { class: "section-label" }, "Pick from the food list"),
      foodPicker({ slot: ctx.slot, date: ctx.date, onLookup: openLookup, onDone: () => setTimeout(closeSheet, 400) }),
      el("button", { class: "link", type: "button", onclick: () => openSheet("scan") }, "Or scan a packet's barcode")].filter(Boolean));
    holder.append(pickerBox, lookupBox);
    return holder;
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
    // One Save for the screen: it sends the goal and/or the targets, whichever changed. The weigh-in
    // day below saves the moment it's picked, as before.
    const save = el("button", { class: "btn primary block", type: "submit", disabled: true }, "Save");
    const when = el("p", { class: "hint date-line" });
    const goalFields = ["tw", "tbf", "tmm", "deadline"], targetFields = ["kcal", "prot", "steps"];
    let start = null, replan = null;
    const form = el("form", { class: "stack settings-form", onsubmit: submitter(async (fd) => {
      const changed = (names) => names.some((n) => (fd.get(n) ?? "") !== start[n]);
      const saved = [];
      if (changed(goalFields)) {
        const res = await api("/goal", { method: "POST", body: JSON.stringify({ targetWeightKg: num(fd.get("tw")), targetBodyFatPct: num(fd.get("tbf")), targetMuscleMassKg: num(fd.get("tmm")), deadline: fd.get("deadline") }) });
        saved.push("Goal");
        replan = res?.replan?.changed ? res.replan : null;
      }
      if (changed(targetFields)) {
        replan = null; // typed targets win over the recomputed one
        await api("/targets", { method: "POST", body: JSON.stringify({ calorieTarget: num(fd.get("kcal")), proteinTarget: num(fd.get("prot")), stepTarget: num(fd.get("steps")) }) });
        saved.push(saved.length ? "targets" : "Targets");
      }
      start = snapshotForm();
      setTimeout(sync); // after the submit helper re-enables the button
      refresh();
      if (replan) { state.replan = replan; replan = null; openSheet("replan"); return; }
      toast(`${saved.join(" and ")} saved.`);
    }) },
      el("p", { class: "section-label" }, "Outcome goal"),
      el("div", { class: "grid3" },
        el("label", {}, "Weight kg", el("input", { class: "field", name: "tw", type: "number", step: "0.1", inputmode: "decimal", value: g?.targets.weight_kg ?? null })),
        el("label", {}, "Body fat %", el("input", { class: "field", name: "tbf", type: "number", step: "0.1", inputmode: "decimal", value: g?.targets.body_fat_pct ?? null })),
        el("label", {}, "Muscle kg", el("input", { class: "field", name: "tmm", type: "number", step: "0.1", inputmode: "decimal", value: g?.targets.muscle_mass_kg ?? null })),
      ),
      el("label", {}, "Deadline", el("input", { class: "field date", name: "deadline", type: "date", required: true, value: g?.deadline ?? null })),
      when,
      el("p", { class: "section-label" }, "Daily targets"),
      el("div", { class: "grid3" },
        el("label", {}, "Calories", el("input", { class: "field", name: "kcal", type: "number", inputmode: "numeric", value: t.calorieTarget ?? null })),
        el("label", {}, "Protein g", el("input", { class: "field", name: "prot", type: "number", inputmode: "numeric", value: t.proteinTarget ?? null })),
        el("label", {}, "Steps", el("input", { class: "field", name: "steps", type: "number", inputmode: "numeric", value: t.stepTarget ?? null })),
      ),
      save,
    );
    function snapshotForm() {
      const fd = new FormData(form);
      return Object.fromEntries([...goalFields, ...targetFields].map((n) => [n, fd.get(n) ?? ""]));
    }
    function sync() {
      const now = snapshotForm();
      save.disabled = Object.keys(now).every((k) => now[k] === start[k]);
      const d = now.deadline;
      if (d) {
        const weeks = Math.round((dateOf(d) - dateOf(todayKey() || localToday())) / (7 * 86_400_000));
        when.textContent = `${dateOf(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}${weeks > 0 ? ` · ${weeks} week${weeks === 1 ? "" : "s"} away` : ""}`;
      } else when.textContent = "";
    }
    start = snapshotForm();
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    sync();
    return el("div", {}, form, weighInDayForm(t));
  },

  replan() {
    const r = state.replan;
    if (!r) return el("p", { class: "none" }, "Nothing changed.");
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const pace = r.plannedKgPerWeek != null ? `${r.plannedKgPerWeek > 0 ? "+" : "−"}${Math.abs(r.plannedKgPerWeek).toFixed(2)} kg a week` : null;
    return el("div", { class: "stack replan" },
      r.cappedForSafety ? el("p", { class: "plan-warn unsafe", role: "alert" }, r.lines[0]) : null,
      el("div", { class: "replan-hero" },
        el("small", {}, "Daily calories"),
        el("strong", {}, fmt(r.calorieTarget.to)),
        r.calorieTarget.from != null && r.calorieTarget.from !== r.calorieTarget.to ? el("span", { class: "replan-from" }, `was ${fmt(r.calorieTarget.from)}`) : null,
        pace ? el("span", { class: "replan-pace" }, pace) : null),
      r.changes.length ? el("div", { class: "card replan-changes" },
        el("p", { class: "section-label" }, "What changed"),
        ...r.changes.map((c) => el("div", { class: "replan-row" },
          el("span", { class: "replan-label" }, c.label),
          el("span", { class: "replan-val" }, c.from ? el("s", {}, c.from) : null, c.from ? " → " : "", el("b", {}, c.to))))) : null,
      ...r.lines.slice(r.cappedForSafety ? 1 : 0).map((l) => el("p", { class: "replan-note" }, l)),
      el("p", { class: "hint" }, r.source === "formula" ? "Based on a formula estimate. It sharpens as you log meals and weigh in." : "Based on your logged meals and weigh-ins."),
      el("button", { class: "btn primary block", type: "button", onclick: closeSheet }, "Got it"),
    );
  },

  notifications() {
    return notificationsSection();
  },

  memory() {
    return memorySection();
  },

  pastDays() {
    return pastDaysSection();
  },

  chatDay() {
    return chatDaySection();
  },

  dayPlan() {
    return state.dayPlan ? dayPlanFull(state.dayPlan) : el("p", { class: "none" }, "No plan for today yet.");
  },

  plan() {
    return planHistorySection();
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
$("past-days").addEventListener("click", () => openSheet("pastDays"));
// The tab bar floats over the bottom of each view, so the views reserve its real height. A fixed
// 68px guess was too small once Android's font size setting made the tabs taller.
{
  const bar = document.querySelector(".tabbar");
  const fit = () => { if (bar.offsetHeight) document.documentElement.style.setProperty("--tabbar-h", `${bar.offsetHeight + 10}px`); };
  if ("ResizeObserver" in window) new ResizeObserver(fit).observe(bar);
  fit();
}
$("coach-stat").addEventListener("click", () => setView("progress"));
for (const b of document.querySelectorAll("#theme-seg button")) b.addEventListener("click", () => setTheme(b.dataset.theme));
applyTheme(store.get(THEME_KEY, null) || "system");
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
$("sheet-back").addEventListener("click", backSheet);
$("scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-sheet]");
  if (b) openSheet(b.dataset.sheet);
});

$("input").addEventListener("input", autosize);
// While typing, the tab bar steps aside so the composer sits right on the keyboard.
$("input").addEventListener("focus", () => document.body.classList.add("composing"));
$("input").addEventListener("blur", () => setTimeout(() => {
  if (document.activeElement !== $("input")) document.body.classList.remove("composing");
}, 120));
// Android's back button hides the keyboard but leaves the box focused, which left the tab bar
// hidden with no way back. When the keyboard goes away, let go of the box so the tabs return.
if (window.visualViewport) {
  const vv = window.visualViewport;
  let fullHeight = vv.height;
  let keyboardUp = false;
  vv.addEventListener("resize", () => {
    fullHeight = Math.max(fullHeight, vv.height);
    if (vv.height < fullHeight - 150) { keyboardUp = true; return; }
    if (keyboardUp) {
      keyboardUp = false;
      if (document.activeElement === $("input")) $("input").blur();
    }
  });
  // A rotated screen has a new full height; start counting again.
  screen.orientation?.addEventListener("change", () => { fullHeight = 0; keyboardUp = false; setTimeout(() => { fullHeight = vv.height; }, 300); });
}
// Tapping a composer button mustn't blur the textarea first, or the layout shifts under the finger.
// ---------- voice ----------
// The phone's own speech-to-text (Chrome's Web Speech API) fills the composer; nothing is sent
// until the person taps send, so a misheard "dal" can be fixed first. Hidden where unsupported.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voice = { rec: null, base: "" };

function stopListening() {
  voice.rec?.stop();
}

function startListening() {
  const rec = new Recognition();
  rec.lang = navigator.language || "en-IN";
  rec.interimResults = true;
  rec.continuous = false;
  const input = $("input");
  voice.base = input.value.trim() ? `${input.value.trim()} ` : "";
  rec.onresult = (e) => {
    let said = "";
    for (const r of e.results) said += r[0].transcript;
    input.value = voice.base + said.trimStart();
    autosize();
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Allow the microphone for Magnus to speak your logs.");
    else if (e.error === "no-speech") toast("Didn't catch that. Tap the mic and try again.");
    else if (e.error !== "aborted") toast("Voice isn't available right now. Type it instead.");
  };
  rec.onend = () => {
    voice.rec = null;
    $("composer").classList.remove("listening");
    $("mic").setAttribute("aria-pressed", "false");
    $("mic").setAttribute("aria-label", "Speak instead of typing");
    autosize();
  };
  voice.rec = rec;
  $("composer").classList.add("listening");
  $("mic").setAttribute("aria-pressed", "true");
  $("mic").setAttribute("aria-label", "Stop listening");
  try { rec.start(); } catch { rec.onend(); }
}

if (Recognition) {
  $("mic").hidden = false;
  $("mic").addEventListener("click", () => (voice.rec ? stopListening() : startListening()));
}

for (const id of ["send", "photo", "quick", "mic"]) $(id).addEventListener("pointerdown", (e) => { if (document.activeElement === $("input")) e.preventDefault(); });
window.addEventListener("hashchange", () => { if (viewFromHash(location.hash) !== currentView()) setView(viewFromHash(location.hash), { fromHistory: true }); });
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer: fine)").matches) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
$("composer").addEventListener("submit", (e) => {
  stopListening();
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

initMeals({ api, el, toast, openSheet, closeSheet, backSheet, setView, fmt, logMeal: (ctx) => { state.mealCtx = ctx; openSheet("meal"); }, todayKey: () => todayKey() || localToday(), refresh });

async function start() {
  if (!(await ensureOnboarded())) return;
  initFolds();
  showShell();
  $("greeting").textContent = greeting();
  // Opened straight onto another tab (a link, the Android app): put Coach underneath so back lands there.
  const first = viewFromHash(location.hash);
  if (first !== "coach" && !history.state?.tab) {
    history.replaceState(null, "", "#coach");
    history.pushState({ tab: true }, "", `#${first}`);
  }
  setView(first, { fromHistory: true });
  renderChips(null);
  // Only today's thread is shown; a saved one from an earlier day waits for the fresh load.
  const cachedChat = store.get(CHAT_CACHE_KEY, null);
  if (cachedChat?.date === localToday() && Array.isArray(cachedChat.messages)) renderHistory(cachedChat.messages);
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
  checkHealthConnectPrompt();
  withCache("/billing", () => { paintPlanSection(); paintPlanBanner(); }, () => {});
}

window.addEventListener("online", flushQueue);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});
}

if (new URLSearchParams(location.search).get("src") === "android" || document.referrer.startsWith("android-app://app.magnus.health")) {
  try { sessionStorage.setItem(ANDROID_KEY, "1"); } catch { /* private mode */ }
}
store.set(ANDROID_KEY, null); // the old, shared flag
$("hc-prompt-go")?.addEventListener("click", (e) => {
  // ?hc=upgrade: already linked, the app only needs to ask for the new data types.
  if ($("hc-prompt").dataset.mode === "upgrade") askNewHealthConnectData();
  else connectHealthConnect(e.currentTarget);
});
$("hc-prompt-later")?.addEventListener("click", () => {
  if ($("hc-prompt").dataset.mode !== "upgrade") store.set(HC_DISMISSED_KEY, true);
  $("hc-prompt").hidden = true;
});
const hcReturn = new URLSearchParams(location.search).get("hc");
if (hcReturn) {
  // Back from the Android app's Health Connect screen.
  const u = new URL(location.href);
  u.searchParams.delete("hc");
  history.replaceState(null, "", u.pathname + u.search + u.hash);
  if (hcReturn === "connected") {
    store.set(HC_LINKED_KEY, true);
    store.set(HC_DISMISSED_KEY, null);
    setTimeout(() => toast("Health Connect is connected. Steps, calories, sleep and heart rate sync every hour."), 800);
  } else if (hcReturn === "upgrade") {
    const box = $("hc-prompt");
    if (box) {
      box.dataset.mode = "upgrade";
      box.querySelector("span").textContent = "Magnus can now also read total calories burned and heart rate variability";
      $("hc-prompt-go").textContent = "Allow";
      box.hidden = false;
    }
  }
}

const redirectError = captureRedirect();
if (redirectError) showConnect(redirectError);
else if (signedIn()) start();
else showConnect();
