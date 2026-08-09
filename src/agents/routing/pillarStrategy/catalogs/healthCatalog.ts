import type { CapabilityCatalog } from "../types.js";

export const HEALTH_CAPABILITY_CATALOG: CapabilityCatalog = {
  pillar: "HEALTH",
  capabilities: [
    {
      id: "meal_log",
      summary: "Log food via explicit meal command (meal:, log meal:, ate:, etc.)",
      disambiguation:
        "Deterministic gate before parser when format matches. NOT free-form food chat — use nutrition_advice.",
    },
    {
      id: "meal_log_photo",
      summary: "Log food from a Telegram meal photo attachment",
      disambiguation: "Deterministic gate when mealPhoto.fileId is present.",
    },
    {
      id: "meal_log_correct",
      summary: "Correct or revise the most recent meal log (follow-up after logging)",
      disambiguation:
        "User clarifies what they ate after a recent log/photo. NOT a new explicit log command. Requires previous_turn_was_meal_log or active meal discussion.",
    },
    {
      id: "meal_history",
      summary: "Show what was eaten today/yesterday/range; macros summary",
      disambiguation: 'NOT "make/plan/create" meals. Show past logs only.',
    },
    {
      id: "meal_history_undo",
      summary: "Undo/delete the last meal log entry",
      disambiguation: 'Phrases like undo/delete/remove last meal.',
    },
    {
      id: "meal_breakdown",
      summary: "Per-component macro breakdown of the last logged meal",
      disambiguation: 'User asks for breakdown/detail of last meal.',
    },
    {
      id: "meal_targets_show",
      summary: "Show daily macro/calorie targets on file",
      disambiguation: "Display targets, not set them.",
    },
    {
      id: "meal_targets_set",
      summary: "Set or update daily macro/calorie targets",
      disambiguation: 'User wants to change targets (e.g. "set protein to 140g").',
    },
    {
      id: "meal_plan_create",
      summary: "Start or continue multi-turn meal planning (gather, draft, review, cancel, save)",
      disambiguation:
        'BUILD/MAKE/CREATE a new plan, continue active_meal_plan_session for gather/draft/review (Q&A about the **draft menu**, revisions, cancel, save). NOT holistic day/schedule asks (calendar + whole day) — those are GENERAL day_overview.',
    },
    {
      id: "meal_plan_read",
      summary: "Show existing locked/saved plan for today/tomorrow/week",
      disambiguation:
        'READ only: "what\'s planned", "what am I eating tomorrow", "show my meal plan". Prefer this over meal_plan_create when previous_turn_meal_plan_locked=true or user asks to view, not build.',
    },
    {
      id: "meal_plan_skip",
      summary: "Skip a planned meal slot",
      disambiguation: "skip breakfast/lunch/dinner/snack on a day.",
    },
    {
      id: "meal_plan_swap",
      summary: "Swap a planned slot to a different meal",
      disambiguation: "swap dinner for X.",
    },
    {
      id: "meal_plan_copy_week",
      summary: "Copy last week's meal plan to this week",
      disambiguation: "repeat/copy last week's plan.",
    },
    {
      id: "meal_plan_template_save",
      summary: "Save current plan week as a named template",
      disambiguation: "save as template <name>.",
    },
    {
      id: "meal_plan_template_apply",
      summary: "Apply a saved meal plan template",
      disambiguation: "use/apply template <name>.",
    },
    {
      id: "meal_plan_templates_list",
      summary: "List saved meal plan templates",
      disambiguation: "list meal plan templates.",
    },
    {
      id: "meal_plan_shopping_list",
      summary: "Grocery/shopping list from locked plan",
      disambiguation: "shopping list, grocery list, what to buy.",
    },
    {
      id: "journal",
      summary: "End-of-day health journal entry",
      disambiguation: "journal, EOD, wrap up my day, daily review.",
    },
    {
      id: "hevy_write",
      summary: "Create Hevy routine or log workout via API",
      disambiguation: 'Explicit "hevy routine:" or "hevy workout:" prefix only.',
    },
    {
      id: "fitness",
      summary: "Training/workout/gym coaching with Hevy context",
      disambiguation: "Exercise, gym, program, sets/reps — NOT meal planning.",
    },
    {
      id: "alternates",
      summary: "Food substitution suggestions (instead of / swap ingredient)",
      disambiguation: "instead of butter, vegan alternative to X.",
    },
    {
      id: "nutrition_advice",
      summary: "General nutrition Q&A without logging",
      disambiguation: "Macro questions, diet advice — NOT explicit meal log.",
    },
    {
      id: "energy",
      summary: "Sleep, fatigue, recovery, HRV, focus (non-clinical)",
      disambiguation: "Sleep/tired/burnout — NOT workout programming.",
    },
    {
      id: "long_term_planning",
      summary: "Multi-month training periodization, race prep arcs",
      disambiguation: "16-week block, season planning — NOT this week's meals.",
    },
    {
      id: "generic_ack",
      summary: "Health-related but no specific capability matched",
      disambiguation: "Fallback only when nothing else fits.",
    },
  ],
};

export const HEALTH_CAPABILITY_IDS = HEALTH_CAPABILITY_CATALOG.capabilities.map((c) => c.id);
