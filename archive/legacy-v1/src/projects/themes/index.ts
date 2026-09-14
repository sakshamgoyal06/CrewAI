/**
 * Declarative project themes — overlays on core project model.
 */

export type ProjectTheme = {
  id: string;
  label: string;
  defaultOutcomePrompt: string;
  defaultChecklist: string[];
  defaultMilestones: string[];
  primaryPillar: string;
  secondaryPillars?: string[];
};

export const CUSTOM_THEME: ProjectTheme = {
  id: "custom",
  label: "Custom project",
  defaultOutcomePrompt: "What does done look like?",
  defaultChecklist: [],
  defaultMilestones: [],
  primaryPillar: "GENERAL",
};

export const JOB_SEARCH_THEME: ProjectTheme = {
  id: "job_search",
  label: "Job search",
  defaultOutcomePrompt: "Offer signed for a role you want",
  defaultChecklist: [
    "Define target roles and companies",
    "Update resume and LinkedIn",
    "Build application tracker",
    "Set weekly application target",
    "Prepare interview stories",
  ],
  defaultMilestones: ["Resume ready", "First applications sent", "First interview", "Offer"],
  primaryPillar: "WISDOM",
  secondaryPillars: ["GENERAL"],
};

export const TRIP_PLAN_THEME: ProjectTheme = {
  id: "trip_plan",
  label: "Trip planning",
  defaultOutcomePrompt: "Flights booked and itinerary locked",
  defaultChecklist: [
    "Confirm dates and budget",
    "Book flights",
    "Book accommodation",
    "Places to visit shortlist",
    "Draft day-by-day itinerary",
    "Packing list",
  ],
  defaultMilestones: ["Dates set", "Transport booked", "Itinerary draft", "Ready to go"],
  primaryPillar: "HAPPINESS",
  secondaryPillars: ["GENERAL"],
};

export const TRANSFORMATION_THEME: ProjectTheme = {
  id: "transformation",
  label: "Body transformation",
  defaultOutcomePrompt: "Target weight/body outcome reached",
  defaultChecklist: [
    "Record starting metrics",
    "Lock training program",
    "Set nutrition approach",
    "Weekly check-in ritual",
  ],
  defaultMilestones: ["Baseline logged", "Program locked", "Midpoint review", "Target reached"],
  primaryPillar: "HEALTH",
  secondaryPillars: ["GENERAL"],
};

export const SKILL_SPRINT_THEME: ProjectTheme = {
  id: "skill_sprint",
  label: "Skill sprint",
  defaultOutcomePrompt: "Skill milestone achieved",
  defaultChecklist: [
    "Define skill target and scope",
    "Choose learning resources",
    "Block practice schedule",
    "First project exercise",
  ],
  defaultMilestones: ["Curriculum set", "Halfway checkpoint", "Demo / test complete"],
  primaryPillar: "WISDOM",
};

export const EVENT_PLAN_THEME: ProjectTheme = {
  id: "event_plan",
  label: "Event planning",
  defaultOutcomePrompt: "Event executed successfully",
  defaultChecklist: [
    "Confirm date, venue, guest list",
    "Budget",
    "Invitations",
    "Food / catering plan",
    "Day-of checklist",
  ],
  defaultMilestones: ["Venue booked", "Invites sent", "Final details locked"],
  primaryPillar: "HAPPINESS",
  secondaryPillars: ["GENERAL"],
};

export const PROJECT_THEMES: Record<string, ProjectTheme> = {
  custom: CUSTOM_THEME,
  job_search: JOB_SEARCH_THEME,
  trip_plan: TRIP_PLAN_THEME,
  transformation: TRANSFORMATION_THEME,
  skill_sprint: SKILL_SPRINT_THEME,
  event_plan: EVENT_PLAN_THEME,
};

export function getProjectTheme(id: string): ProjectTheme {
  return PROJECT_THEMES[id] ?? CUSTOM_THEME;
}

export function inferThemeFromMessage(text: string): string {
  const t = text.toLowerCase();
  if (/\b(job search|job hunting|apply(?:ing)? for|interview prep|resume)\b/.test(t)) {
    return "job_search";
  }
  if (/\b(trip|vacation|travel|holiday|itinerary|flight|hotel)\b/.test(t)) {
    return "trip_plan";
  }
  if (/\b(lose \d+|cut(?:ting)?|bulk(?:ing)?|transformation|10 kg|weight loss)\b/.test(t)) {
    return "transformation";
  }
  if (/\b(learn \w+|skill sprint|study \w+ in \d+ weeks)\b/.test(t)) {
    return "skill_sprint";
  }
  if (/\b(birthday party|wedding|event plan|party planning)\b/.test(t)) {
    return "event_plan";
  }
  return "custom";
}
