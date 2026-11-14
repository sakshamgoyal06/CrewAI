/**
 * Pause and resume (server: breaks.ts, resume.ts). Each step is its own screen, so the phone's
 * Back steps back through the flow (Saksham's UI rule: no big bottom sheets).
 *
 * Pause: what → why → an alternative first (when there is one) → how long (capped) → minimums → confirm.
 * Resume after a whole-plan pause: where you stand → move the goal date (recommended) or keep it →
 * keep it: weigh in → the plan it takes, or "not safe, moving the date" → accept.
 */
let d;
const draft = { scope: null, itemId: null, itemLabel: null, reason: null, note: "", preview: null, days: 7 };
const resume = { id: null, state: null, plan: null };
let info = { breaks: [], resume: null };

const CACHE_KEY = "magnus-pauses";

/** Paints the banners from the last known pauses at once, so a reload never shows them missing. */
export function initPause(deps) {
  d = deps;
  try { info = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") || info; } catch { /* private mode */ }
  if (!Array.isArray(info.breaks)) info = { breaks: [], resume: null };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => paintBanner());
  else paintBanner();
}

const REASONS = [["sick", "Sick"], ["injured", "Injured"], ["travel", "Travelling or on holiday"], ["busy", "Too busy"], ["rest", "Need a rest"], ["other", "Something else"]];
const reasonLabel = (r) => (REASONS.find(([k]) => k === r)?.[1] ?? r).toLowerCase();
const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const pauseTitles = { pauseExtend: "Extend the pause", pauseWhat: "Pause", pauseWhy: "Why the pause?", pauseAlt: "Before you pause", pauseLength: "How long?", pauseDone: "Paused", resumeStart: "Welcome back", resumeWeigh: "Today's weight", resumeKeep: "Keeping your date" };

/**
 * Loads pauses and any restart choice still to make, and paints the banner on every screen. A failed
 * load keeps what was shown (the banner used to vanish when a refresh's request failed).
 */
export async function loadPauses() {
  try {
    const r = await d.api("/breaks");
    info = { breaks: r.breaks ?? [], resume: r.resume ?? null };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(info)); } catch { /* private mode */ }
  } catch {
    /* keep the last known pauses */
  }
  paintBanner();
  return info;
}

/** Pauses running today (the whole plan first). */
function livePauses() {
  const today = d.todayKey();
  return info.breaks.filter((b) => b.startDate <= today && b.endDate >= today).sort((a, b) => (a.scope === b.scope ? 0 : a.scope === "plan" ? -1 : 1));
}

function paintBanner() {
  if (!d) return;
  const { el } = d;
  const live = livePauses();
  const b = live[0] ?? null;
  for (const box of document.querySelectorAll("[data-pause-banner]")) {
    if (info.resume) {
      box.hidden = false;
      box.replaceChildren(el("span", {}, "Your pause is over. Choose how to restart."), el("button", { class: "link", type: "button", onclick: () => openResume(info.resume) }, "Restart"));
      continue;
    }
    if (!b) { box.hidden = true; box.replaceChildren(); continue; }
    const what = b.scope === "plan" ? "Your plan is" : `${itemName(b.itemId)} is`;
    const more = live.length > 1 ? ` (+${live.length - 1} more)` : "";
    box.hidden = false;
    box.replaceChildren(
      el("span", {}, `${what} paused till ${shortDate(b.endDate)}.${more}`),
      el("button", { class: "link", type: "button", onclick: () => d.openSheet("pauseWhat") }, "Extend or end"));
  }
  // The Pause row on You says what's running.
  const row = document.querySelector('[data-sheet="pauseWhat"] small');
  if (row) row.textContent = b ? `${b.scope === "plan" ? "Whole plan" : itemName(b.itemId)} paused till ${shortDate(b.endDate)}: extend or end it` : "Take a break from one item or the whole plan";
}

function itemName(id) {
  return d.snapshot()?.routine?.find((i) => i.id === id)?.label ?? "This item";
}

async function endEarly(btn, b, fromSheet = false) {
  btn.disabled = true;
  try {
    await d.api(`/breaks/${b.id}/end`, { method: "POST" });
    await loadPauses();
    d.refresh();
    if (b.startDate > d.todayKey()) { if (fromSheet) d.closeSheet(); d.toast("Pause cancelled."); return; }
    if (b.scope === "plan") openResume(b.id);
    else if (fromSheet) { d.closeSheet(); d.toast(`${itemName(b.itemId)} is back from today.`); }
    else d.toast(`${itemName(b.itemId)} is back from today.`);
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

/** Starts the pause flow: from You (pick what), or from a routine item (that item). */
export function startPause(item = null) {
  Object.assign(draft, { scope: item ? "item" : null, itemId: item?.id ?? null, itemLabel: item?.label ?? null, reason: null, note: "", preview: null, days: 7 });
  d.openSheet(item ? "pauseWhy" : "pauseWhat");
}

const dayCount = (from, until) => Math.round((Date.parse(`${until}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
const extendTarget = { b: null };

/** One running or coming pause, with Extend and End (or Cancel before it starts). */
function pauseCard(b) {
  const { el } = d;
  const today = d.todayKey();
  const started = b.startDate <= today;
  const name = b.scope === "plan" ? "The whole plan" : itemName(b.itemId);
  const days = dayCount(b.startDate, b.endDate);
  const canExtend = b.max ? days < b.max : true;
  return el("div", { class: "pause-live" },
    el("p", { class: "pa-head" }, name),
    el("p", { class: "hint" }, `${started ? "Paused" : "Pausing"} for ${reasonLabel(b.reason)}, ${shortDate(b.startDate)} to ${shortDate(b.endDate)} (${days} day${days === 1 ? "" : "s"}${b.max ? ` of ${b.max} at most` : ""}).`),
    el("div", { class: "row-actions" },
      canExtend ? el("button", { class: "btn primary", type: "button", onclick: () => { extendTarget.b = b; d.openSheet("pauseExtend"); } }, "Extend pause") : null,
      el("button", { class: "btn", type: "button", onclick: (e) => endEarly(e.currentTarget, b, true) }, started ? "End pause" : "Cancel it")),
    canExtend ? null : el("p", { class: "hint" }, "It's already as long as a pause can be."));
}

export function pauseWhat() {
  const { el } = d;
  Object.assign(draft, { scope: null, itemId: null, itemLabel: null, reason: null, note: "", preview: null, days: 7 });
  const routine = d.snapshot()?.routine ?? [];
  const pick = (scope, item) => { Object.assign(draft, { scope, itemId: item?.id ?? null, itemLabel: item?.label ?? null }); d.openSheet("pauseWhy"); };
  const today = d.todayKey();
  const running = info.breaks.filter((b) => b.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const planPaused = running.some((b) => b.scope === "plan");
  const pausedItems = new Set(running.filter((b) => b.scope === "item").map((b) => b.itemId));
  // While the whole plan is paused there's nothing else to pause: only extend or end it.
  if (planPaused) {
    return el("div", { class: "stack pause-flow" }, ...running.map(pauseCard),
      el("p", { class: "hint" }, "Extending keeps it one pause: the days count from when it started, and the restart covers all of them."));
  }
  const free = routine.filter((i) => !pausedItems.has(i.id));
  return el("div", { class: "stack pause-flow" },
    ...(running.length ? [el("p", { class: "section-label" }, "Paused now"), ...running.map(pauseCard), el("p", { class: "section-label" }, "Pause something else")] : []),
    el("p", { class: "hint" }, "Pause one part of your routine, or the whole plan for a holiday or illness. A pause always needs a reason."),
    el("button", { class: "menu-row", type: "button", onclick: () => pick("plan", null) }, el("span", {}, el("b", {}, "The whole plan"), el("small", {}, "Up to 21 days, 30 if you're unwell")), el("i", { class: "chev-r" })),
    ...free.map((i) => el("button", { class: "menu-row", type: "button", onclick: () => pick("item", i) }, el("span", {}, el("b", {}, i.label), el("small", {}, "Up to 14 days, 30 if you're unwell")), el("i", { class: "chev-r" }))));
}

/** A longer pause: the new last day, counted from the original start and capped there. */
export function pauseExtend() {
  const { el } = d;
  const b = extendTarget.b;
  if (!b) return el("p", { class: "hint" }, "Nothing to extend.");
  const max = b.max ?? 21;
  const used = dayCount(b.startDate, b.endDate);
  const room = Math.max(1, max - used);
  const out = el("b", {});
  const range = el("input", { type: "range", min: "1", max: String(room), value: String(Math.min(7, room)), "aria-label": "Extra days" });
  let until = b.endDate;
  const show = () => {
    const extra = Number(range.value);
    until = addDays(b.endDate, extra);
    out.textContent = `Till ${shortDate(until)}: ${extra} more day${extra === 1 ? "" : "s"}, ${used + extra} in total`;
  };
  range.addEventListener("input", show);
  show();
  const go = async (btn) => {
    btn.disabled = true;
    try {
      await d.api(`/breaks/${b.id}/extend`, { method: "POST", body: JSON.stringify({ until }) });
      await loadPauses();
      d.refresh();
      d.closeSheet();
      d.toast(`Paused till ${shortDate(until)}.`);
    } catch (err) {
      btn.disabled = false;
      d.toast(err.code === "too_long" ? `A pause can be ${max} days at most, counted from ${shortDate(b.startDate)}.` : err.code === "already_paused" ? "Another pause starts in those days. End or change that one first." : err.message);
    }
  };
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "draft-note" }, `${b.scope === "plan" ? "Your plan" : itemName(b.itemId)} is paused from ${shortDate(b.startDate)} till ${shortDate(b.endDate)}. At most ${max} days in total for ${reasonLabel(b.reason)}.`),
    el("label", {}, out, range),
    el("p", { class: "hint" }, b.scope === "plan"
      ? "It stays one pause from the day it started. The day before it ends you'll get a reminder, then you choose how to restart for all the days paused."
      : "It stays one pause from the day it started. The day before it ends you'll get a reminder that it's back."),
    el("button", { class: "btn primary block", type: "button", onclick: (e) => go(e.currentTarget) }, "Extend the pause"));
}

export function pauseWhy() {
  const { el } = d;
  const note = el("input", { class: "field", placeholder: "A few words", maxlength: "200", "aria-label": "Your reason" });
  const box = el("div", { class: "stack pause-flow" });
  const go = async (reason) => {
    for (const b of box.querySelectorAll("button")) b.disabled = true;
    try {
      draft.reason = reason;
      draft.note = reason === "other" ? note.value.trim() : "";
      draft.preview = await d.api("/breaks/preview", { method: "POST", body: JSON.stringify({ scope: draft.scope, reason, itemId: draft.itemId || undefined }) });
      draft.days = Math.min(draft.days, draft.preview.max);
      d.openSheet(draft.preview.alternative ? "pauseAlt" : "pauseLength");
    } catch (err) {
      for (const b of box.querySelectorAll("button")) b.disabled = false;
      d.toast(err.message);
    }
  };
  box.append(
    el("p", { class: "draft-note" }, `Pausing ${draft.scope === "plan" ? "your whole plan" : draft.itemLabel}. What's the reason?`),
    el("div", { class: "chips wrap" }, ...REASONS.filter(([k]) => k !== "other").map(([k, l]) => el("button", { class: "chip", type: "button", onclick: () => go(k) }, l))),
    el("form", { class: "reason-other", onsubmit: (e) => { e.preventDefault(); if (note.value.trim()) go("other"); else note.focus(); } }, note, el("button", { class: "btn", type: "submit" }, "Next")));
  return box;
}

export function pauseAlt() {
  const { el } = d;
  const p = draft.preview;
  const instead = () => {
    d.closeSheet();
    d.send(`Instead of pausing ${draft.scope === "plan" ? "my plan" : draft.itemLabel} (${reasonLabel(draft.reason)}), let's do this: ${p.alternative}`);
  };
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "eyebrow" }, "An alternative first"),
    el("p", { class: "pa-head" }, p.alternative),
    el("p", { class: "hint" }, "Keeping a smaller version going usually makes the restart easier than stopping."),
    el("button", { class: "btn primary block", type: "button", onclick: instead }, "Do this instead"),
    el("button", { class: "btn block", type: "button", onclick: () => d.openSheet("pauseLength") }, "I still want to pause"));
}

export function pauseLength() {
  const { el } = d;
  const p = draft.preview;
  const today = d.todayKey();
  const out = el("b", {});
  const range = el("input", { type: "range", min: "1", max: String(p.max), value: String(draft.days), "aria-label": "Days" });
  const show = () => { draft.days = Number(range.value); out.textContent = `${draft.days} day${draft.days === 1 ? "" : "s"}, till ${shortDate(addDays(today, draft.days - 1))}`; };
  range.addEventListener("input", show);
  show();
  const start = async (btn) => {
    btn.disabled = true;
    try {
      await d.api("/breaks", { method: "POST", body: JSON.stringify({ scope: draft.scope, itemId: draft.itemId || undefined, reason: draft.reason, note: draft.note || undefined, until: addDays(today, draft.days - 1) }) });
      await loadPauses();
      d.refresh();
      d.openSheet("pauseDone");
    } catch (err) {
      btn.disabled = false;
      d.toast(err.message === "too_many_plan_breaks" ? "That's a third whole-plan pause in 90 days. Let's look at resetting the goal instead: ask the coach." : err.message);
    }
  };
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "draft-note" }, `At most ${p.max} days for ${reasonLabel(draft.reason)}.`),
    el("label", {}, out, range),
    el("p", { class: "section-label" }, "Keep these going (not checked, just worth it)"),
    el("ul", { class: "pause-min" }, ...p.minimums.map((m) => el("li", {}, m))),
    draft.scope === "plan" ? el("p", { class: "hint" }, "No reminders except the weekly weigh-in. These days don't count against your score. When it ends, you choose whether to move your goal date.") : el("p", { class: "hint" }, `No reminders or checks for ${draft.itemLabel} while it's paused, and those days don't count against you.`),
    el("button", { class: "btn primary block", type: "button", onclick: (e) => start(e.currentTarget) }, "Start the pause"));
}

export function pauseDone() {
  const { el } = d;
  const p = draft.preview;
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "pa-head" }, p?.reply ?? "Paused."),
    el("p", { class: "hint" }, "To extend it or end it early, tap the banner at the top of any screen, or You, then Pause."),
    el("button", { class: "btn primary block", type: "button", onclick: () => d.closeSheet() }, "Done"));
}

// ---------- resume ----------

export async function openResume(id) {
  resume.id = id;
  resume.plan = null;
  try {
    resume.state = await d.api(`/resume?id=${encodeURIComponent(id)}`);
  } catch (err) {
    return d.toast(err.message);
  }
  d.openSheet("resumeStart");
}

async function moveDate(btn) {
  btn.disabled = true;
  try {
    const r = await d.api(`/resume/${resume.state.breakId}/move-date`, { method: "POST" });
    await loadPauses();
    d.refresh();
    d.closeSheet();
    d.toast(`Goal date moved to ${shortDate(r.deadline)}. Welcome back.`);
  } catch (err) {
    btn.disabled = false;
    d.toast(err.message);
  }
}

export function resumeStart() {
  const { el } = d;
  const s = resume.state;
  if (!s) return el("div");
  const weight = s.latestWeightKg ? `${s.latestWeightKg} kg on ${shortDate(s.latestWeightDate)}` : "no weigh-in yet";
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "eyebrow" }, "Where you stand"),
    el("ul", { class: "pause-min" },
      el("li", {}, `Paused for ${s.pausedDays} day${s.pausedDays === 1 ? "" : "s"}.`),
      el("li", {}, `Last weight: ${weight}${s.targetWeightKg ? `, aiming for ${s.targetWeightKg} kg` : ""}.`),
      el("li", {}, `Goal date: ${shortDate(s.deadline)}, ${s.daysLeft} days away.`)),
    el("button", { class: "btn primary block", type: "button", onclick: (e) => moveDate(e.currentTarget) }, `Move my goal date to ${shortDate(s.movedDeadline)} (recommended)`),
    el("p", { class: "hint" }, "Same pace as before the pause, so nothing gets harder."),
    el("button", { class: "btn block", type: "button", onclick: () => (s.needsWeighIn ? d.openSheet("resumeWeigh") : keepPreview()) }, `Keep ${shortDate(s.deadline)} and change my plan`));
}

export function resumeWeigh() {
  const { el } = d;
  const kg = el("input", { class: "field", type: "number", step: "0.1", min: "25", max: "350", inputmode: "decimal", required: true, "aria-label": "Weight in kg" });
  return el("form", { class: "stack pause-flow", onsubmit: (e) => { e.preventDefault(); keepPreview(Number(kg.value), e.submitter); } },
    el("p", { class: "draft-note" }, "To keep the date, Magnus needs today's weight to work out the pace now needed."),
    el("label", {}, "Weight (kg)", kg),
    el("button", { class: "btn primary block", type: "submit" }, "Work it out"));
}

async function keepPreview(weightKg, btn) {
  if (btn) btn.disabled = true;
  try {
    resume.plan = await d.api(`/resume/${resume.state.breakId}/keep-date/preview`, { method: "POST", body: JSON.stringify(weightKg ? { weightKg } : {}) });
    d.openSheet("resumeKeep");
  } catch (err) {
    if (btn) btn.disabled = false;
    d.toast(err.message === "not_enough_data" ? "Not enough recent logs to plan a faster pace safely. Moving the date is the safe choice." : err.message);
  }
}

export function resumeKeep() {
  const { el } = d;
  const p = resume.plan;
  const s = resume.state;
  if (!p || !s) return el("div");
  if (!p.safe) {
    return el("div", { class: "stack pause-flow" },
      el("p", { class: "pa-head" }, `Reaching your goal by ${shortDate(s.deadline)} now needs a faster pace than is safe, so Magnus won't plan that.`),
      el("p", { class: "hint" }, "Let's move the date instead. If your progress turns out faster, we can bring it back."),
      el("button", { class: "btn primary block", type: "button", onclick: (e) => moveDate(e.currentTarget) }, `Move my goal date to ${shortDate(s.movedDeadline)}`));
  }
  const accept = async (btn) => {
    btn.disabled = true;
    try {
      await d.api(`/resume/${s.breakId}/keep-date/accept`, { method: "POST" });
      await loadPauses();
      d.refresh();
      d.closeSheet();
      d.toast(`Locked in. Goal date stays ${shortDate(s.deadline)}.`);
    } catch (err) {
      btn.disabled = false;
      d.toast(err.message);
    }
  };
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "eyebrow" }, "What changes"),
    el("p", { class: "pa-head" }, `To keep ${shortDate(s.deadline)}, your plan needs this from tomorrow:`),
    el("ul", { class: "pause-min" }, ...p.changes.map((c) => el("li", {}, c))),
    el("p", { class: "hint" }, "That's more effort than your old plan. It only changes if you accept."),
    el("button", { class: "btn primary block", type: "button", onclick: (e) => accept(e.currentTarget) }, "I'll do this"),
    el("button", { class: "btn block", type: "button", onclick: () => d.backSheet() }, "Back"));
}
