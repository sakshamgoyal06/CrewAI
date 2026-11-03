// The weekly routine editor (morning walk, evening gym, a swim on Tuesdays...): one editor for the
// onboarding screen and Settings. Each item has its days, time, length and reminder.

export const ROUTINE_ACTIVITIES = [
  ["gym", "Gym (Hevy)"],
  ["walking", "Walk"],
  ["running", "Run"],
  ["swimming", "Swim"],
  ["cycling", "Cycling"],
  ["football", "Football"],
  ["cricket", "Cricket"],
  ["badminton", "Badminton"],
  ["tennis", "Tennis"],
  ["basketball", "Basketball"],
  ["yoga", "Yoga"],
  ["hiit", "HIIT / circuits"],
  ["dance", "Dance / Zumba"],
  ["martial_arts", "Martial arts / boxing"],
  ["other", "Something else"],
];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const ROUTINE_PRESETS = [
  { name: "Morning walk", item: { activity: "walking", days: EVERY_DAY, startTime: "07:00", durationMin: 30, remindBeforeMin: 0 } },
  { name: "Evening gym", item: { activity: "gym", days: [1, 3, 5], startTime: "18:30", durationMin: 60, remindBeforeMin: 30 } },
  { name: "Swim", item: { activity: "swimming", days: [2, 4], startTime: "07:00", durationMin: 45, remindBeforeMin: 15 } },
  { name: "Sport", item: { activity: "football", days: [6], startTime: "17:00", durationMin: 60, remindBeforeMin: 30 } },
  { name: "Evening walk", item: { activity: "walking", days: EVERY_DAY, startTime: "20:30", durationMin: 20, remindBeforeMin: 0 } },
];

const REMIND = [["", "Off"], ["0", "At start"], ["15", "15 min"], ["30", "30 min"], ["60", "1 hour"]];
const WD = ["S", "M", "T", "W", "T", "F", "S"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MIN_LIFTING_DAYS = 3;

const known = new Set(ROUTINE_ACTIVITIES.map(([k]) => k));

/** Server items → editor items. */
export function fromServer(items = []) {
  return items.map((i) => ({
    id: i.id,
    activity: known.has(i.activityKey) ? i.activityKey : "other",
    label: i.label || "",
    days: [...i.days],
    startTime: i.startTime || "",
    durationMin: i.durationMin,
    remindBeforeMin: i.remindBeforeMin,
  }));
}

/** Editor items → the PUT /routine body. */
export function toPayload(items) {
  return {
    items: items
      .filter((i) => i.days.length)
      .map((i) => ({
        id: i.id,
        activity: i.activity === "other" ? (i.label.trim() || "other") : i.activity,
        label: i.label.trim() || undefined,
        days: i.days,
        startTime: i.startTime || null,
        durationMin: Number(i.durationMin) || 30,
        remindBeforeMin: i.startTime ? i.remindBeforeMin : null,
      })),
  };
}

/** Training days are everything but walks; the plan wants at least 3 of them in the gym. */
export function routineSummary(items) {
  const training = new Set(items.filter((i) => i.activity !== "walking").flatMap((i) => i.days));
  const gym = new Set(items.filter((i) => i.activity === "gym").flatMap((i) => i.days));
  const need = Math.min(MIN_LIFTING_DAYS, training.size);
  return { trainingDays: [...training].sort(), gymDays: gym.size, need, short: gym.size < need };
}

/**
 * `items` is updated in place; `onChange` fires on every edit. Returns the editor node.
 */
export function routineEditor(el, items, onChange = () => {}) {
  const node = el("div", { class: "stack routine" });
  const changed = () => { onChange(); paint(); };

  function itemCard(item, idx) {
    const activity = el("select", { class: "field", "aria-label": "Activity", onchange: (e) => { item.activity = e.target.value; if (item.activity === "gym" && item.remindBeforeMin == null) item.remindBeforeMin = 30; changed(); } },
      ...ROUTINE_ACTIVITIES.map(([k, label]) => el("option", { value: k, selected: item.activity === k ? "" : null }, label)));
    const label = el("input", { class: "field", type: "text", maxlength: "40", value: item.label || null,
      placeholder: item.activity === "other" ? "What is it?" : "Name (optional)", "aria-label": "Name",
      oninput: (e) => { item.label = e.target.value; onChange(); } });
    const days = el("div", { class: "days" }, ...WD.map((d, i) => {
      const on = item.days.includes(i);
      return el("button", { type: "button", class: on ? "on" : "", "aria-pressed": String(on), "aria-label": WD_LONG[i], onclick: () => {
        item.days = on ? item.days.filter((x) => x !== i) : [...item.days, i].sort();
        changed();
      } }, d);
    }));
    const time = el("input", { class: "field", type: "time", value: item.startTime || null, "aria-label": "Start time",
      onchange: (e) => { item.startTime = e.target.value; changed(); } });
    const mins = el("input", { class: "field", type: "number", inputmode: "numeric", min: "5", max: "600", value: String(item.durationMin), "aria-label": "Minutes",
      oninput: (e) => { item.durationMin = Number(e.target.value) || item.durationMin; onChange(); } });
    const remind = el("select", { class: "field", "aria-label": "Reminder", disabled: item.startTime ? null : "",
      onchange: (e) => { item.remindBeforeMin = e.target.value === "" ? null : Number(e.target.value); onChange(); } },
      ...REMIND.map(([v, l]) => el("option", { value: v, selected: String(item.remindBeforeMin ?? "") === v ? "" : null }, l)));
    return el("div", { class: "routine-item" },
      el("div", { class: "grid2" }, activity, label),
      days,
      el("div", { class: "grid3" },
        el("label", {}, "Time", time),
        el("label", {}, "Minutes", mins),
        el("label", {}, "Remind before", remind)),
      !item.days.length ? el("p", { class: "hint warn" }, "Pick at least one day, or remove it.") : null,
      !item.startTime ? el("p", { class: "hint" }, "No time set: no reminder, and I'll check in the evening.") : null,
      el("div", { class: "row-actions" },
        el("button", { class: "link danger", type: "button", onclick: () => { items.splice(idx, 1); changed(); } }, "Remove")));
  }

  function paint() {
    const s = routineSummary(items);
    const summary = !items.length
      ? el("p", { class: "hint" }, "Add what you do each week. I'll remind you before each one and check it off when it's logged.")
      : s.short
        ? el("p", { class: "training-note warn" }, `${s.gymDays} gym day${s.gymDays === 1 ? "" : "s"} a week. Your plan needs at least ${s.need} strength sessions to hold on to muscle, so keep ${s.need - s.gymDays} more for the gym.`)
        : el("p", { class: "hint" }, `${s.trainingDays.length} training day${s.trainingDays.length === 1 ? "" : "s"} a week, ${s.gymDays} in the gym. Walks count as movement, not training.`);
    node.replaceChildren(
      ...items.map(itemCard),
      summary,
      el("div", { class: "chips wrap" },
        ...ROUTINE_PRESETS.map((p) => el("button", { type: "button", class: "chip", onclick: () => { items.push({ ...structuredClone(p.item), label: "" }); changed(); } }, `+ ${p.name}`))),
    );
  }

  paint();
  return node;
}
