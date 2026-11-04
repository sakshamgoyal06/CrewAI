// First run: four short screens (you, your goal, your week, how you eat), then the plan reveal.
// Nothing is saved until "Start"; the reveal is a live preview from /onboarding/preview.

import { foodPrefsEditor } from "./foodprefs.js";
import { ROUTINE_PRESETS, routineEditor, routineSummary, toPayload } from "./routine.js";


function plusMonths(months) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Shows the interview in `root` and resolves once the plan is saved.
 * `deps` carries the app's helpers: { api, el, toast }.
 */
export function runOnboarding(root, { api, el, toast }) {
  const a = {
    sex: null, birthYear: "", heightCm: "", weightKg: "", bodyFatPct: "",
    goalType: "lose", targetWeightKg: "", targetBodyFatPct: "", deadline: plusMonths(4),
    activity: "desk", diet: null, dietNote: "", foodAvoid: [],
    // Starts as an evening gym on Mon/Wed/Fri; they add walks, swims or sports, or change it.
    routine: [{ ...structuredClone(ROUTINE_PRESETS[1].item), label: "" }],
  };
  let step = 0;

  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const payload = () => ({
    sex: a.sex, birthYear: num(a.birthYear), heightCm: num(a.heightCm), weightKg: num(a.weightKg),
    bodyFatPct: num(a.bodyFatPct), goalType: a.goalType,
    targetWeightKg: a.goalType === "recomp" ? undefined : num(a.targetWeightKg),
    targetBodyFatPct: num(a.targetBodyFatPct), deadline: a.deadline, activity: a.activity,
    trainingDays: routineSummary(a.routine).trainingDays, routine: toPayload(a.routine).items, diet: a.diet,
    dietNote: a.diet === "custom" ? a.dietNote.trim() : undefined, foodAvoid: a.foodAvoid,
  });

  const choice = (options, key, onPick) =>
    el("div", { class: "choices", role: "radiogroup" },
      ...options.map(([value, label, hint]) => {
        const b = el("button", { type: "button", class: `choice${a[key] === value ? " on" : ""}`, role: "radio", "aria-checked": String(a[key] === value) },
          el("span", {}, label), hint ? el("small", {}, hint) : null);
        b.addEventListener("click", () => { a[key] = value; onPick?.(); render(); });
        return b;
      }));

  const field = (label, key, attrs = {}) =>
    el("label", {}, label, el("input", { class: "field", inputmode: "decimal", type: "number", value: a[key] || null, ...attrs, oninput: (e) => { a[key] = e.target.value; } }));

  const steps = [
    {
      title: "First, you",
      lead: "Four quick screens and I'll build your plan.",
      body: () => [
        choice([["male", "Male"], ["female", "Female"]], "sex"),
        el("div", { class: "grid2" },
          field("Born in", "birthYear", { inputmode: "numeric", placeholder: "1995", min: 1930, max: 2012 }),
          field("Height cm", "heightCm", { placeholder: "175" })),
        el("div", { class: "grid2" },
          field("Weight kg", "weightKg", { step: "0.1", placeholder: "80" }),
          field("Body fat %", "bodyFatPct", { step: "0.1", placeholder: "optional" })),
        el("p", { class: "hint" }, "Body fat is optional. A smart scale reading or a rough guess is fine."),
      ],
      valid: () => a.sex && a.birthYear && a.heightCm && a.weightKg ? null : "Fill in sex, birth year, height and weight.",
    },
    {
      title: "Your goal",
      lead: "What should be true by your date?",
      body: () => [
        choice([["lose", "Lose fat", "Get leaner, lighter"], ["recomp", "Recomp", "Same weight, less fat"], ["gain", "Build muscle", "Gain slowly"]], "goalType"),
        a.goalType === "recomp" ? null : el("div", { class: "grid2" },
          field("Target weight kg", "targetWeightKg", { step: "0.1", placeholder: a.goalType === "gain" ? "75" : "72" }),
          field("Target body fat %", "targetBodyFatPct", { step: "0.1", placeholder: "optional" })),
        a.goalType === "recomp" ? field("Target body fat %", "targetBodyFatPct", { step: "0.1", placeholder: "optional" }) : null,
        el("label", {}, "By", el("input", { class: "field", type: "date", value: a.deadline, min: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), oninput: (e) => { a.deadline = e.target.value; } })),
        el("div", { class: "chips-row" }, ...[[3, "3 months"], [6, "6 months"], [12, "1 year"]].map(([m, label]) =>
          el("button", { type: "button", class: "chip", onclick: () => { a.deadline = plusMonths(m); render(); } }, label))),
      ],
      valid: () => {
        if (!a.deadline) return "Pick a date.";
        if (a.goalType !== "recomp" && !a.targetWeightKg && !(a.targetBodyFatPct && a.bodyFatPct)) {
          return a.targetBodyFatPct ? "Add your current body fat on the first screen, or a target weight." : "Add a target weight.";
        }
        return null;
      },
    },
    {
      title: "Your week",
      lead: "Your routine sets your starting calories, and I'll remind you before each part of it.",
      body: () => [
        el("p", { class: "section-label" }, "Most days you're"),
        choice([["desk", "At a desk"], ["light", "On your feet"], ["active", "Physically active"]], "activity"),
        el("p", { class: "section-label" }, "Your routine"),
        routineEditor(el, a.routine),
        el("p", { class: "hint" }, "Gym sessions come from Hevy (connect it in Settings after this). Walks, swims and sports are picked up from Health Connect or logged in a tap."),
      ],
      valid: () => (a.routine.some((i) => !i.days.length) ? "Each activity needs at least one day." : a.routine.some((i) => i.activity === "other" && !i.label.trim()) ? "Name the activity marked 'Something else'." : null),
    },
    {
      title: "How you eat",
      lead: "I'll only suggest food that fits.",
      body: () => [foodPrefsEditor(el, a)],
      valid: () => (!a.diet ? "Pick one." : a.diet === "custom" && !a.dietNote.trim() ? "Describe how you eat." : null),
    },
  ];

  let resolve;
  const done = new Promise((r) => { resolve = r; });

    async function reveal() {
      root.replaceChildren(el("div", { class: "onb-inner" }, el("p", { class: "eyebrow" }, "Your plan"), el("h1", { class: "display" }, "Working it out…")));
      let plan;
      try {
        plan = (await api("/onboarding/preview", { method: "POST", body: JSON.stringify(payload()) })).plan;
      } catch (err) {
        toast(err.message);
        step = steps.length - 1;
        render();
        return;
      }
      const unsafe = plan.cappedForSafety;
      const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      // An unsafe date can't be started: the only way on is a later date (the safe one, in one tap, or their own).
      const start = el("button", { class: "btn primary block", type: "button" }, "Start");
      start.disabled = unsafe;
      start.addEventListener("click", async () => {
        start.disabled = true;
        try {
          await api("/onboarding", { method: "POST", body: JSON.stringify(payload()) });
          resolve();
        } catch (err) {
          toast(err.message);
          start.disabled = false;
        }
      });
      const fmt = (n) => Math.round(n).toLocaleString("en-US");
      root.replaceChildren(el("div", { class: "onb-inner" },
        el("p", { class: "eyebrow" }, "Your plan"),
        el("h1", { class: "display" }, a.goalType === "recomp" ? "Leaner, same scale" : `${plan.targetWeightKg ?? a.weightKg} kg by ${new Date(`${a.deadline}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`),
        el("div", { class: "plan-nums" },
          el("div", {}, el("strong", {}, fmt(plan.calorieTarget)), el("small", {}, "kcal a day")),
          el("div", {}, el("strong", {}, `${plan.proteinTarget} g`), el("small", {}, "protein")),
          el("div", {}, el("strong", {}, fmt(plan.stepTarget)), el("small", {}, "steps"))),
        unsafe ? el("p", { class: "plan-warn unsafe", role: "alert" }, plan.safeDate
          ? `${longDate(a.deadline)} is too soon. It needs a pace that isn't safe. Pick a later date; ${longDate(plan.safeDate)} works.`
          : `${longDate(a.deadline)} is too soon. It needs a pace that isn't safe. Pick a later date.`) : null,
        el("div", { class: "plan-lines" }, ...plan.lines.filter((l) => !(plan.cappedForSafety && l.includes("faster than is safe"))).map((l) => el("p", {}, l))),
        unsafe && plan.safeDate ? el("button", { class: "btn primary block", type: "button", onclick: () => { a.deadline = plan.safeDate; reveal(); } }, `Use ${longDate(plan.safeDate)}`) : null,
        unsafe ? el("button", { class: "btn block", type: "button", onclick: () => { step = 1; render(); } }, "Pick another date") : start,
        unsafe ? null : el("button", { class: "link", type: "button", onclick: () => { step = 0; render(); } }, "Change answers"),
      ));
    }

    function render() {
      const s = steps[step];
      const err = el("p", { class: "connect-error", role: "alert", hidden: true });
      const next = el("button", { class: "btn primary block", type: "button" }, step === steps.length - 1 ? "Build my plan" : "Next");
      next.addEventListener("click", () => {
        const problem = s.valid();
        if (problem) { err.textContent = problem; err.hidden = false; return; }
        if (step === steps.length - 1) reveal();
        else { step += 1; render(); }
      });
      root.replaceChildren(el("div", { class: "onb-inner" },
        el("div", { class: "onb-progress", "aria-label": `Step ${step + 1} of ${steps.length}` },
          ...steps.map((_, i) => el("span", { class: i <= step ? "on" : "" }))),
        el("h1", { class: "display" }, s.title),
        el("p", { class: "muted" }, s.lead),
        el("div", { class: "stack" }, ...s.body()),
        err,
        next,
        step > 0 ? el("button", { class: "link", type: "button", onclick: () => { step -= 1; render(); } }, "Back") : null,
      ));
      root.scrollTop = 0;
    }

  render();
  return done;
}
