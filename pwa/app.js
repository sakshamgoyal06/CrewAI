const TOKEN_KEY = "magnus-health-token";
const $ = (id) => document.getElementById(id);

function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
function setToken(v) {
  try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

async function api(path, options = {}) {
  const res = await fetch(`/api/health${path}`, {
    ...options,
    headers: { "content-type": "application/json", authorization: `Bearer ${getToken()}`, ...(options.headers || {}) },
  });
  if (res.status === 401) {
    setToken("");
    show("setup");
    throw new Error("Token rejected. Paste it again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function show(which) {
  $("setup").hidden = which !== "setup";
  $("home").hidden = which !== "home";
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") node.setAttribute("style", v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

function render(s) {
  const today = new Date(`${s.today.date}T12:00:00Z`);
  $("date-label").textContent = today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });

  const ns = s.northStar;
  $("ns-value").textContent = String(ns.onTrackDays);
  $("ns-goal").textContent = `of ${ns.windowDays} · goal ${ns.goal}`;
  $("ns-dots").replaceChildren(
    ...ns.days.map((d, i) =>
      el(
        "li",
        { class: [d.onTrack ? "on" : "", i === ns.days.length - 1 ? "today" : ""].join(" ").trim(), title: `${d.date}: ${d.score}%` },
        WEEKDAY[new Date(`${d.date}T12:00:00Z`).getUTCDay()],
      ),
    ),
  );
  $("ns-hint").textContent = ns.mostMissed
    ? `Most missed this week: ${ns.mostMissed.label.toLowerCase()} (${ns.mostMissed.missedDays} day${ns.mostMissed.missedDays === 1 ? "" : "s"}).`
    : ns.windowDays > 1 ? "Nothing missed in the last week." : "";

  $("today-score").textContent = s.today.onTrack ? "On track" : `${s.today.score}%`;
  $("checks").replaceChildren(
    ...s.today.checks.map((c) =>
      el(
        "li",
        { class: c.met ? "met" : "" },
        el("span", {}, `${c.met ? "✓ " : ""}${c.label}`),
        el("span", { class: "detail" }, c.detail),
        el("div", { class: "bar" }, el("span", { style: `width:${Math.round(c.progress * 100)}%` })),
      ),
    ),
  );

  const list = $("workouts");
  if (!s.hevyConnected) {
    list.replaceChildren(el("li", { class: "muted" }, "Hevy isn't connected for this account."));
  } else if (!s.workouts.length) {
    list.replaceChildren(el("li", { class: "muted" }, "No recent workouts in Hevy."));
  } else {
    list.replaceChildren(
      ...s.workouts.slice(0, 6).map((w) =>
        el(
          "li",
          {},
          el("span", {}, w.title),
          el(
            "span",
            { class: "meta" },
            [new Date(`${w.localDate}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" }),
              w.durationMin != null ? `${w.durationMin} min` : null,
              `${w.exerciseCount} ex`].filter(Boolean).join(" · "),
          ),
        ),
      ),
    );
  }

  $("steps").placeholder = s.today.steps ? s.today.steps.toLocaleString() : "Steps today";
}

async function refresh() {
  $("refresh").disabled = true;
  try {
    render(await api("/today"));
  } catch (err) {
    $("ns-hint").textContent = err.message;
  } finally {
    $("refresh").disabled = false;
  }
}

function status(id, text, isErr = false) {
  const n = $(id);
  n.textContent = text;
  n.classList.toggle("err", isErr);
}

$("setup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  setToken($("token").value.trim());
  $("token").value = "";
  show("home");
  refresh();
});

$("refresh").addEventListener("click", refresh);

$("signout").addEventListener("click", () => {
  setToken("");
  show("setup");
});

$("meal-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  status("meal-result", "Estimating…");
  try {
    const r = await api("/meals", { method: "POST", body: JSON.stringify({ text: $("meal-text").value, slot: $("meal-slot").value }) });
    if (r.duplicate) status("meal-result", "Looks like you already logged that one.");
    else if (r.calories == null) status("meal-result", "Saved, but no calorie estimate was found. Try more detail.");
    else status("meal-result", `Logged ~${Math.round(r.calories)} kcal${r.proteinG != null ? ` · ${Math.round(r.proteinG)} g protein` : ""}.`);
    $("meal-text").value = "";
    refresh();
  } catch (err) {
    status("meal-result", err.message, true);
  } finally {
    btn.disabled = false;
  }
});

$("steps-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  btn.disabled = true;
  try {
    const walk = $("walk").value;
    await api("/steps", {
      method: "POST",
      body: JSON.stringify({ steps: Number($("steps").value), ...(walk ? { walkMinutes: Number(walk) } : {}), source: "manual" }),
    });
    status("steps-result", "Saved.");
    $("steps").value = "";
    $("walk").value = "";
    refresh();
  } catch (err) {
    status("steps-result", err.message, true);
  } finally {
    btn.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(() => {});
}

if (getToken()) {
  show("home");
  refresh();
} else {
  show("setup");
}
