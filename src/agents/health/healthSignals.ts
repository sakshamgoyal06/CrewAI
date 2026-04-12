/** Fast-path keyword routing for HEALTH specialists (Fitness → Nutrition → Energy). */

const FITNESS_PATTERN =
  /\b(workouts?|gym|exercise|exercises|training|cardio|rep|reps|set|sets|lift|lifting|squat|deadlift|marathons?|muscles?|stretch|strength|bench|jog|jogging|running|swim|swimming|bike|biking|cycling|hike|hiking|athlete|pb\b|personal\s+record|warm-?up|cool-?down|hiit|crossfit|pliometrics?|bodybuilding)\b/i;

const NUTRITION_PATTERN =
  /\b(meals?|macro|macros|calorie|calories|proteins?|carbs?|diet|diets|breakfast|lunch|dinner|snacks?|fasting|nutrition|foods?|gluten|keto|vegan|vegetarian|sugar|supplements?|vitamins?|hydration|hydrate|intermittent\s+fasting|meal\s+prep)\b/i;

const ENERGY_PATTERN =
  /\b(sleep|sleeping|slept|insomnia|tired|tiredness|fatigue|fatigued|exhausted|hrv|heart\s+rate\s+variability|caffeine|coffee|espresso|burnout|burned\s+out|nap|naps|circadian|drowsy|sleepiness|sleep\s+quality|wake\s+up|woke|wakefulness|melatonin|rest\s+day|brain\s+fog|focus\b|attention\b|stimulants?|overwork|depleted|recovery\b|screen\s+time\s+before\s+bed|blue\s+light)\b/i;

const ENERGY_PHRASE_PATTERN =
  /\b(low\s+energy|energy\s+crash|energy\s+levels|no\s+energy|can't\s+sleep|cannot\s+sleep|trouble\s+sleeping|poor\s+sleep|bad\s+sleep|sleep\s+debt|sleep\s+schedule)\b/i;

export function matchesFitnessMessage(rawMessage: string): boolean {
  return FITNESS_PATTERN.test(rawMessage);
}

export function matchesNutritionMessage(rawMessage: string): boolean {
  return NUTRITION_PATTERN.test(rawMessage);
}

export function matchesEnergyMessage(rawMessage: string): boolean {
  return ENERGY_PATTERN.test(rawMessage) || ENERGY_PHRASE_PATTERN.test(rawMessage);
}
