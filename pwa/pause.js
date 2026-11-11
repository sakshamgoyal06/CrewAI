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

export function initPause(deps) { d = deps; }

const REASONS = [["sick", "Sick"], ["injured", "Injured"], ["travel", "Travelling or on holiday"], ["busy", "Too busy"], ["rest", "Need a rest"], ["other", "Something else"]];
const reasonLabel = (r) => (REASONS.find(([k]) => k === r)?.[1] ?? r).toLowerCase();
const shortDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const pauseTitles = { pauseWhat: "Pause", pauseWhy: "Why the pause?", pauseAlt: "Before you pause", pauseLength: "How long?", pauseDone: "Paused", resumeStart: "Welcome back", resumeWeigh: "Today's weight", resumeKeep: "Keeping your date" };

/** Loads pauses and any restart choice still to make; paints the Today banner; opens Resume once a day. */
export async function loadPauses() {
  try {
    info = await d.api("/breaks");
  } catch {
    info = { breaks: [], resume: null };
  }
  paintBanner();
  return info;
}

function paintBanner() {
  const box = document.getElementById("pause-banner");
  if (!box) return;
  const { el } = d;
  const today = d.todayKey();
  const now = info.breaks.filter((b) => b.startDate <= today);
  if (info.resume) {
    box.hidden = false;
    box.replaceChildren(el("span", {}, "Your pause is over. Choose how to restart."), el("button", { class: "link", type: "button", onclick: () => openResume(info.resume) }, "Restart"));
    return;
  }
  if (!now.length) { box.hidden = true; box.replaceChildren(); return; }
  const b = now[0];
  const what = b.scope === "plan" ? "Your plan is" : `${itemName(b.itemId)} is`;
  box.hidden = false;
  box.replaceChildren(
    el("span", {}, `${what} paused till ${shortDate(b.endDate)}.`),
    el("button", { class: "link", type: "button", onclick: (e) => endEarly(e.currentTarget, b) }, "End early"));
}

function itemName(id) {
  return d.snapshot()?.routine?.find((i) => i.id === id)?.label ?? "This item";
}

async function endEarly(btn, b) {
  btn.disabled = true;
  try {
    await d.api(`/breaks/${b.id}/end`, { method: "POST" });
    await loadPauses();
    d.refresh();
    if (b.scope === "plan") openResume(b.id);
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

export function pauseWhat() {
  const { el } = d;
  Object.assign(draft, { scope: null, itemId: null, itemLabel: null, reason: null, note: "", preview: null, days: 7 });
  const routine = d.snapshot()?.routine ?? [];
  const pick = (scope, item) => { Object.assign(draft, { scope, itemId: item?.id ?? null, itemLabel: item?.label ?? null }); d.openSheet("pauseWhy"); };
  return el("div", { class: "stack pause-flow" },
    el("p", { class: "hint" }, "Pause one part of your routine, or the whole plan for a holiday or illness. A pause always needs a reason."),
    el("button", { class: "menu-row", type: "button", onclick: () => pick("plan", null) }, el("span", {}, el("b", {}, "The whole plan"), el("small", {}, "Up to 21 days, 30 if you're unwell")), el("i", { class: "chev-r" })),
    ...routine.map((i) => el("button", { class: "menu-row", type: "button", onclick: () => pick("item", i) }, el("span", {}, el("b", {}, i.label), el("small", {}, "Up to 14 days, 30 if you're unwell")), el("i", { class: "chev-r" }))));
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
    el("p", { class: "hint" }, "You can end it early from the banner on Today."),
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
