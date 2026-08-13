/**
 * Generate 1000 natural-language chat message tests from:
 * - Real production chats (data/chat-samples/)
 * - userQueryCatalog.ts
 * - Synthetic templates + paraphrase variations
 *
 * Usage: npx tsx scripts/dev/generate-chat-message-test-suite.mts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ChatIssueTag,
  ChatMessageTestCase,
  ChatTestSource,
} from "../../src/capabilities/chatMessageTestSuite.types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGET = 1000;
const outPath = join(__dirname, "../../src/capabilities/chatMessageTestSuite.generated.ts");

// Dummy env so dynamic imports of routing helpers do not require .env
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "dummy";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "dummy";
process.env.ANTHROPIC_API_KEY ??= "dummy";
process.env.TELEGRAM_BOT_TOKEN ??= "dummy";

const { USER_QUERY_CATALOG } = await import("../../src/capabilities/userQueryCatalog.ts");
const { looksLikeMagnusToolAction } = await import(
  "../../src/agents/tools/magnusActionDetect.ts"
);
const { looksLikeYoutubeAction } = await import(
  "../../src/agents/tools/youtubeActionDetect.ts"
);
const { parseMealLogCommand } = await import("../../src/meals/parseMealLogCommand.ts");

type RealMsg = { content: string; intent: string | null; created_at: string };

function normKey(msg: string): string {
  return msg.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function inferCategory(msg: string): string {
  const q = msg.toLowerCase();
  if (parseMealLogCommand(msg).kind === "meal" || /\b(i (had|ate)|meal breakdown|log meal)\b/.test(q))
    return "health_meal";
  if (/\b(hevy|workout|gym|pull a|push a|cardio|swim)\b/.test(q)) return "health_fitness";
  if (/\b(meal plan|shopping list|swap rajma)\b/.test(q)) return "health_meal_plan";
  if (/\b(zerodha|kite|holdings|portfolio|savings)\b/.test(q)) return "wealth";
  if (/\b(watchlist|readlist|recommend a film|treadmill.*watch)\b/.test(q)) return "happiness_media";
  if (/\b(learning plan|ship|career|ai session|magnus ideas)\b/.test(q)) return "wisdom";
  if (looksLikeYoutubeAction(msg)) return "general_youtube";
  if (looksLikeMagnusToolAction(msg)) return "general_tools";
  if (/\b(yes|no|undo|that's right|all set|thanks)\b/i.test(msg) && msg.length < 40)
    return "follow_up";
  if (/\b(whole day|day look|morning brief|calendar)\b/.test(q)) return "general_day";
  return "general_conversation";
}

function inferIssueTags(msg: string, assistantIntent?: string | null): ChatIssueTag[] {
  const tags: ChatIssueTag[] = [];
  const q = msg.toLowerCase();
  if (/^(yes|no|undo|that's right|all set)$/i.test(msg.trim())) tags.push("needs_prior_turn");
  if (/\bundo\b/i.test(q)) tags.push("undo_disambiguation");
  if (/\bi am (having|eating)\b/i.test(q) && !/\bi (had|ate)\b/i.test(q))
    tags.push("meal_log_tense");
  if (/\bwhole day\b|\bday look\b/.test(q) && /\bmeal plan\b/.test(q))
    tags.push("ambiguous_routing");
  if (/\bmeal plan for tomorrow\b/.test(q)) tags.push("ambiguous_routing");
  if (/\bplaylist\b/.test(q) && /\bworkout\b/.test(q)) tags.push("playlist_name_confusion");
  if (/\bwhen did i add\b/.test(q)) tags.push("timestamp_unavailable");
  if (/\btwice\b|\bduplicate\b/.test(q)) tags.push("duplicate_action");
  if (/\bcalendar\b/.test(q) && /\bnot looking\b|\bcheck using\b/.test(q))
    tags.push("calendar_not_read");
  if (assistantIntent === "HAPPINESS" && /\bplaylist\b/.test(q)) tags.push("wrong_pillar");
  if (/\band\b/.test(q) && (/\blog\b/.test(q) || /\badd\b/.test(q)) && q.split(" and ").length > 2)
    tags.push("multi_intent");
  return tags;
}

function fromCatalog(): ChatMessageTestCase[] {
  return USER_QUERY_CATALOG.map((e, i) => ({
    id: `catalog-${String(i + 1).padStart(4, "0")}`,
    message: e.query,
    source: "catalog" as const,
    category: e.category,
    idealIntent: e.idealIntent,
    idealCapability: e.idealCapability,
    notes: e.notes,
    structural: {
      explicitMealLog: e.hints.explicit_meal_log,
      magnusTools: e.magnusTools,
      youtubeAction: e.youtubeAction,
      consultPillars: e.consultPillars,
    },
  }));
}

function fromRealChats(msgs: RealMsg[]): ChatMessageTestCase[] {
  return msgs.map((m, i) => {
    const cat = inferCategory(m.content);
    const tags = inferIssueTags(m.content, m.intent);
    return {
      id: `real-${String(i + 1).padStart(4, "0")}`,
      message: m.content,
      source: "real_chat" as const,
      category: cat,
      observedIntent: m.intent,
      requiresPriorTurn: tags.includes("needs_prior_turn"),
      issueTags: tags.length ? tags : undefined,
      structural: {
        explicitMealLog: parseMealLogCommand(m.content).kind === "meal",
        magnusTools: looksLikeMagnusToolAction(m.content),
        youtubeAction: looksLikeYoutubeAction(m.content),
      },
    };
  });
}

/** Synthetic templates to fill to TARGET */
const SYNTHETIC_TEMPLATES: Array<{ category: string; messages: string[] }> = [
  {
    category: "health_meal_log",
    messages: [
      "meal: dal rice and sabzi",
      "I had paneer tikka and 2 rotis for dinner",
      "log lunch: chole bhature",
      "just had: protein shake after gym",
      "ate: idli sambar and filter coffee",
      "For breakfast I ate poha and tea",
      "I am having dal makhani and naan",
      "I am eating a salad right now",
      "had biryani for lunch today",
      "log snack: almonds and banana",
    ],
  },
  {
    category: "health_meal_history",
    messages: [
      "what did I eat today?",
      "meal breakdown for entire day",
      "did I log breakfast today?",
      "undo last meal",
      "you logged that twice",
      "correct my lunch calories",
      "show today's macros",
    ],
  },
  {
    category: "health_fitness",
    messages: [
      "should I train legs today?",
      "review my last Hevy workout",
      "I missed gym because I'm tired",
      "what's the gym plan for today?",
      "log that I skipped cardio",
      "how was my push session?",
      "pull data from hevy",
    ],
  },
  {
    category: "health_meal_plan",
    messages: [
      "plan my meals for the week",
      "what's my meal plan for tomorrow?",
      "shopping list for this week",
      "swap lunch and dinner for tomorrow",
      "lock this meal plan in",
      "cancel meal planning",
      "how much poha should I eat tomorrow?",
    ],
  },
  {
    category: "wealth",
    messages: [
      "connect zerodha",
      "show my kite holdings",
      "am I saving enough?",
      "when does my ELSS lock-in end?",
      "what's my portfolio allocation?",
    ],
  },
  {
    category: "happiness",
    messages: [
      "recommend a film like Arrival",
      "what should I watch on the treadmill?",
      "restorative weekend ideas",
      "add Inception to watchlist",
      "what's on my watchlist?",
    ],
  },
  {
    category: "wisdom",
    messages: [
      "learning plan for Spanish",
      "help me ship my side project",
      "prep for promotion conversation",
      "what's on the AI session agenda?",
      "daily piano practice routine",
    ],
  },
  {
    category: "general_calendar",
    messages: [
      "what's on my calendar tomorrow?",
      "schedule dentist Tuesday 3pm",
      "move AI session to 9pm tomorrow",
      "remove duplicate calendar events",
      "add gym 7:30am tomorrow to calendar",
    ],
  },
  {
    category: "general_day_overview",
    messages: [
      "what does my whole day look like tomorrow?",
      "what's the plan for tomorrow?",
      "what do I need to do today?",
      "gym plan and meal plan for today",
    ],
  },
  {
    category: "general_youtube",
    messages: [
      "search YouTube for jazz",
      "add to wisdom playlist",
      "cue die with zero for treadmill",
      "find animated explainer on credit cycles",
      "add 5 rock songs to workout playlist",
    ],
  },
  {
    category: "general_lists",
    messages: [
      "add Dune to readlist",
      "what's on my to-do list?",
      "recommend from my watchlist",
      "mark die with zero as done",
      "clean up duplicate watchlist entries",
    ],
  },
  {
    category: "general_proactive",
    messages: [
      "remind me tomorrow 8pm to call mom",
      "remind me Friday morning to buy ghewar",
      "enable evening journal",
      "morning brief",
    ],
  },
  {
    category: "follow_up",
    messages: [
      "Yes",
      "No",
      "Yes add them",
      "That's right",
      "Undo this",
      "All set",
      "Go with 1",
      "Lock it in",
    ],
  },
  {
    category: "adversarial_ambiguity",
    messages: [
      "What's for today",
      "Plan for tomorrow",
      "Log it",
      "Add that",
      "Check it",
      "Do the thing",
      "Fix it",
      "Same as yesterday",
    ],
  },
  {
    category: "general_connect",
    messages: [
      "connect google",
      "connect notion",
      "connect zerodha",
      "connect kite",
      "sync notion",
      "setup notion",
    ],
  },
  {
    category: "health_journal",
    messages: [
      "wrap up my day",
      "journal entry for today",
      "log how I'm feeling",
      "end of day health journal",
    ],
  },
  {
    category: "general_event_log",
    messages: [
      "log gym 6am tomorrow",
      "reschedule gym to Friday",
      "list my commitments this week",
      "mark cupboard cleanup as done",
    ],
  },
  {
    category: "general_lifeos",
    messages: [
      "log joy tank 70",
      "health pillar at_risk",
      "log daily check-in",
      "what are my goals?",
    ],
  },
  {
    category: "edge_typos",
    messages: [
      "whats on my watchlst",
      "meal brekdown",
      "conect zerodha",
      "mornign brief",
      "add dil chahta h to watchlist",
      "log meal: chole bhature",
      "pull A tommorow",
      "swiming session was great",
      "hevy workot review",
      "readlst items",
    ],
  },
];

const VARIATION_PREFIXES = ["", "hey ", "please ", "can you ", "quick: "];
const VARIATION_SUFFIXES = ["", " thanks", " pls", "?", ""];

function expandVariations(base: string, category: string, startId: number): ChatMessageTestCase[] {
  const out: ChatMessageTestCase[] = [];
  let n = startId;
  for (const pre of VARIATION_PREFIXES) {
    for (const suf of VARIATION_SUFFIXES) {
      const msg = `${pre}${base}${suf}`.trim();
      if (msg === base && (pre || suf)) continue;
      out.push({
        id: `var-${String(n++).padStart(4, "0")}`,
        message: msg,
        source: "variation",
        category,
      });
      if (out.length >= 8) return out;
    }
  }
  return out.slice(0, 5);
}

function buildSyntheticAndVariations(needed: number): ChatMessageTestCase[] {
  const out: ChatMessageTestCase[] = [];
  let id = 1;

  for (const block of SYNTHETIC_TEMPLATES) {
    for (const msg of block.messages) {
      out.push({
        id: `syn-${String(id++).padStart(4, "0")}`,
        message: msg,
        source: "synthetic",
        category: block.category,
        structural: {
          explicitMealLog: parseMealLogCommand(msg).kind === "meal",
          magnusTools: looksLikeMagnusToolAction(msg),
          youtubeAction: looksLikeYoutubeAction(msg),
        },
      });
    }
  }

  // Adversarial edge cases from real failures
  const adversarial: Array<{ msg: string; category: string; tags: ChatIssueTag[] }> = [
    { msg: "I am having 2 paratha for lunch", category: "health_meal_log", tags: ["meal_log_tense"] },
    { msg: "When did I add Dune to watchlist?", category: "general_lists", tags: ["timestamp_unavailable"] },
    { msg: "Add to high energy workout playlist", category: "general_youtube", tags: ["playlist_name_confusion"] },
    { msg: "You logged burrito bowl twice", category: "health_meal_history", tags: ["duplicate_action"] },
    { msg: "Why did you change breakfast and dinner?", category: "health_meal_history", tags: ["meal_slot_confusion"] },
    { msg: "Cant you check using calendar connections?", category: "general_calendar", tags: ["calendar_not_read"] },
    { msg: "No something from my wisdom youtube playlist", category: "general_youtube", tags: ["needs_prior_turn", "wrong_pillar"] },
    { msg: "Add rocky series and recommend one for tonight", category: "general_pillar_consultation", tags: ["multi_intent"] },
    { msg: "I am eating a dahi aloo tikki", category: "health_meal_log", tags: ["confirmation_loop", "meal_log_tense"] },
    { msg: "What should I watch for treadmill tomorrow", category: "happiness_media", tags: ["ambiguous_routing"] },
  ];
  for (const a of adversarial) {
    out.push({
      id: `adv-${String(id++).padStart(4, "0")}`,
      message: a.msg,
      source: "adversarial",
      category: a.category,
      issueTags: a.tags,
      structural: {
        magnusTools: looksLikeMagnusToolAction(a.msg),
        youtubeAction: looksLikeYoutubeAction(a.msg),
      },
    });
  }

  // Variations on catalog queries to fill remainder
  const seeds = USER_QUERY_CATALOG.map((e) => ({ msg: e.query, cat: e.category }));
  let varId = 1;
  let guard = 0;
  while (out.length < needed && guard < needed * 3) {
    guard++;
    const seed = seeds[guard % seeds.length];
    const vars = expandVariations(seed.msg, seed.cat, varId);
    varId += vars.length;
    for (const v of vars) {
      if (out.some((x) => normKey(x.message) === normKey(v.message))) continue;
      out.push(v);
      if (out.length >= needed) break;
    }
  }

  return out.slice(0, needed);
}

function dedupeAndMerge(cases: ChatMessageTestCase[]): ChatMessageTestCase[] {
  const seen = new Set<string>();
  const out: ChatMessageTestCase[] = [];
  // Priority: real > catalog > adversarial > synthetic > variation
  const order: ChatTestSource[] = ["real_chat", "catalog", "adversarial", "synthetic", "variation"];
  const sorted = [...cases].sort(
    (a, b) => order.indexOf(a.source) - order.indexOf(b.source),
  );
  for (const c of sorted) {
    const key = normKey(c.message);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function enrichStructural(tc: ChatMessageTestCase): ChatMessageTestCase {
  return {
    ...tc,
    structural: {
      ...tc.structural,
      explicitMealLog:
        tc.structural?.explicitMealLog ?? parseMealLogCommand(tc.message).kind === "meal",
      magnusTools: tc.structural?.magnusTools ?? looksLikeMagnusToolAction(tc.message),
      youtubeAction: tc.structural?.youtubeAction ?? looksLikeYoutubeAction(tc.message),
    },
    issueTags: tc.issueTags ?? inferIssueTags(tc.message, tc.observedIntent),
  };
}

function main() {
  const samplesDir = join(__dirname, "../../data/chat-samples");
  mkdirSync(samplesDir, { recursive: true });
  const realPath = join(samplesDir, "real-user-messages.json");
  let realMsgs: RealMsg[] = [];
  try {
    realMsgs = JSON.parse(readFileSync(realPath, "utf8")) as RealMsg[];
  } catch {
    console.warn("No real-user-messages.json — suite will use catalog + synthetic only");
  }

  const parts = [
    ...fromRealChats(realMsgs),
    ...fromCatalog(),
  ];
  let merged = dedupeAndMerge(parts);
  if (merged.length < TARGET) {
    merged = dedupeAndMerge([
      ...merged,
      ...buildSyntheticAndVariations(TARGET - merged.length + 100),
    ]);
  }
  // Pad with numbered unique probes if still short
  let pad = 1;
  while (merged.length < TARGET) {
    merged.push({
      id: `pad-${pad}`,
      message: `test probe ${pad}: what's on my calendar tomorrow?`,
      source: "synthetic",
      category: "general_calendar",
    });
    pad++;
  }
  const suite = merged.slice(0, TARGET).map((c, i) => ({
    ...enrichStructural(c),
    id: `cmt-${String(i + 1).padStart(4, "0")}`,
  }));

  if (suite.length !== TARGET) {
    console.warn(`Warning: generated ${suite.length} cases, target was ${TARGET}`);
  }

  const bySource = {} as Record<ChatTestSource, number>;
  const byCategory: Record<string, number> = {};
  for (const c of suite) {
    bySource[c.source] = (bySource[c.source] ?? 0) + 1;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  }

  const file = `/** AUTO-GENERATED — do not edit. Run: npx tsx scripts/dev/generate-chat-message-test-suite.mts */
import type { ChatMessageTestCase, ChatTestSuiteMeta } from "./chatMessageTestSuite.types.js";

export const CHAT_MESSAGE_TEST_SUITE_META: ChatTestSuiteMeta = ${JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      totalCases: suite.length,
      bySource,
      byCategory,
      realChatCount: bySource.real_chat ?? 0,
    },
    null,
    2,
  )};

export const CHAT_MESSAGE_TEST_SUITE: ChatMessageTestCase[] = ${JSON.stringify(suite, null, 2)};
`;

  writeFileSync(outPath, file);
  console.log(`Wrote ${suite.length} cases → ${outPath}`);
  console.log("By source:", bySource);
  console.log("Categories:", Object.keys(byCategory).length);
}

main();
