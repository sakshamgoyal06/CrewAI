/**
 * Seeded recall@5 fixture cases — 20 decision/memory queries (Step 4 gate).
 */
export type RecallFixtureCase = {
  id: string;
  query: string;
  /** Chunk that should rank in top 5 for the query (fixture embed bucket). */
  targetChunk: string;
  /** Noise chunks from other topics. */
  decoys: string[];
};

export const RECALL_FIXTURE_CASES: RecallFixtureCase[] = [
  {
    id: "recall-job-search",
    query: "what did we decide about the job search?",
    targetChunk: "Decision: focus the job search on ML roles and skip frontend-only postings.",
    decoys: [
      "Bali trip — book flights in October.",
      "Gym schedule: legs Monday, push Wednesday.",
      "Meal plan: 180g protein daily.",
    ],
  },
  {
    id: "recall-bali-trip",
    query: "what was our Bali trip plan?",
    targetChunk: "Trip plan: Bali in November, flight on the 12th, stay in Ubud first week.",
    decoys: ["Job search: ML roles only.", "Budget: save 20% each month.", "Spanish lesson twice weekly."],
  },
  {
    id: "recall-gym",
    query: "what did we agree for gym training?",
    targetChunk: "Training: gym workout Mon/Wed/Fri mornings, focus on compound lifts.",
    decoys: ["Wedding guest list capped at 120.", "Tax filing deadline April 15.", "Startup pitch deck v3."],
  },
  {
    id: "recall-meals",
    query: "what did we decide about meals and protein?",
    targetChunk: "Meal decision: hit 180g protein daily, dal and eggs as staples.",
    decoys: ["Apartment lease renews in March.", "Dog vet checkup monthly.", "Book club picks sci-fi."],
  },
  {
    id: "recall-budget",
    query: "what was our savings decision?",
    targetChunk: "Budget: auto-transfer 20% to savings after each paycheck.",
    decoys: ["Concert tickets for June.", "Visa appointment booked.", "Sleep: no screens after 10pm."],
  },
  {
    id: "recall-spanish",
    query: "what did we decide about learning Spanish?",
    targetChunk: "Learning plan: Spanish lessons twice weekly, 30 minutes daily practice.",
    decoys: ["Car insurance renews in August.", "Team hiring: one senior engineer.", "Garden watering schedule."],
  },
  {
    id: "recall-apartment",
    query: "what did we decide about the apartment lease?",
    targetChunk: "Apartment: renew lease in March unless rent increases more than 8%.",
    decoys: ["Music festival in July.", "Doctor annual checkup in May.", "Meditation 10 minutes daily."],
  },
  {
    id: "recall-wedding",
    query: "what did we decide for the wedding?",
    targetChunk: "Wedding: ceremony guest list capped at 120, outdoor venue preferred.",
    decoys: ["Startup founder meetup Friday.", "Pet food subscription.", "Reading list: 2 books per month."],
  },
  {
    id: "recall-startup",
    query: "what did we decide about the startup pitch?",
    targetChunk: "Startup: pitch deck v3 focuses on enterprise pilots, not consumer.",
    decoys: ["Immigration visa docs due next month.", "Sleep routine: lights out by 11.", "Tax extension filed."],
  },
  {
    id: "recall-meditation",
    query: "what mindfulness plan did we set?",
    targetChunk: "Mindfulness: meditation 10 minutes every morning for stress.",
    decoys: ["Hiring: promote internal candidate first.", "Vehicle service at 40k miles.", "Book: finish by Sunday."],
  },
  {
    id: "recall-dog",
    query: "what did we decide about the dog?",
    targetChunk: "Pet plan: dog vet checkup monthly, switch to grain-free food.",
    decoys: ["Language exchange on Thursdays.", "Budget freeze on dining out.", "Gym deload week next month."],
  },
  {
    id: "recall-car",
    query: "what was the car insurance decision?",
    targetChunk: "Vehicle: car insurance switch in August if quote beats current by 15%.",
    decoys: ["Wedding invites send in April.", "Protein shake after workout.", "Spanish podcast daily."],
  },
  {
    id: "recall-visa",
    query: "what did we decide about visa paperwork?",
    targetChunk: "Immigration: visa appointment booked, passport renewal before travel.",
    decoys: ["Concert playlist for road trip.", "Team offsite in Q3.", "Garden compost weekly."],
  },
  {
    id: "recall-doctor",
    query: "what health checkup did we plan?",
    targetChunk: "Health: doctor annual checkup in May, blood panel included.",
    decoys: ["Startup investor intro Tuesday.", "Apartment sublet rules.", "Novel for book club."],
  },
  {
    id: "recall-books",
    query: "what reading goal did we set?",
    targetChunk: "Reading: finish 2 books per month, one fiction one non-fiction.",
    decoys: ["Meal prep Sundays.", "Bali packing list.", "Job interview prep Fridays."],
  },
  {
    id: "recall-music",
    query: "what concert plan did we make?",
    targetChunk: "Music: concert in June, build playlist for the road trip.",
    decoys: ["Tax documents to accountant.", "Dog walker on weekdays.", "Sleep tracker trial."],
  },
  {
    id: "recall-garden",
    query: "what did we decide about the garden?",
    targetChunk: "Garden: watering plants every morning, compost bin weekly.",
    decoys: ["Savings goal 6-month emergency fund.", "Visa interview prep.", "Gym PR attempt next week."],
  },
  {
    id: "recall-tax",
    query: "what tax filing decision did we make?",
    targetChunk: "Tax: filing deadline April 15, extension only if accountant delays.",
    decoys: ["Wedding caterer tasting.", "Spanish tutor switch.", "Startup cap table update."],
  },
  {
    id: "recall-hiring",
    query: "what did we decide about team hiring?",
    targetChunk: "Team: hiring one senior engineer, promote internal candidate first if ready.",
    decoys: ["Car lease return inspection.", "Meditation retreat weekend.", "Meal delivery pause."],
  },
  {
    id: "recall-sleep",
    query: "what bedtime rule did we agree?",
    targetChunk: "Sleep: insomnia plan — no screens after 10pm, lights out by 11.",
    decoys: ["Bali visa on arrival.", "Book return library.", "Budget review quarterly."],
  },
];

export const RECALL_AT5_GATE = 0.9;
