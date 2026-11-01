/**
 * `/start` and `/help` — answered locally so a new chat never spends a model call.
 *
 * There are deliberately no other commands. Magnus is the whole interface: the user writes in
 * plain language and routing happens invisibly.
 */
import { isMinimalMode } from "../config/minimalMode.js";

export function buildStartMessage(): string {
  if (isMinimalMode()) {
    return [
      "<b>Magnus is online (minimal mode).</b>",
      "",
      "Focused build while we perfect the core: calendar, reminders, lists, YouTube, morning brief, and workouts / Hevy.",
      "",
      "Some of what works right now:",
      "• <b>Calendar</b> — “what's on today?”, “book gym 7am tomorrow”",
      "• <b>Reminders</b> — “remind me to call the dentist tomorrow at 4pm”",
      "• <b>Lists</b> — “add Dune to watchlist”, “what's on my readlist?”",
      "• <b>YouTube</b> — “connect Google”, “find a focus playlist”, “bookmark that song”",
      "• <b>Morning brief</b> — say “morning brief” or wait for the daily push",
      "• <b>Training / Hevy</b> — “should I train today?”, “review my last few workouts”",
      "",
      "Meals, Notion, money coaching, and other pillars are temporarily parked.",
      "",
      "/help for the longer version.",
    ].join("\n");
  }

  return [
    "<b>Magnus is online.</b>",
    "",
    "Just talk to me. No commands, no menus — write the way you'd text a friend who keeps track of your life.",
    "",
    "Some of what I do:",
    "• <b>Your day</b> — “what's on today?”, “am I free Thursday evening?”, “book gym 7am tomorrow”",
    "• <b>Health</b> — training, meals, sleep, recovery. “log lunch: rice and dal”, “should I train today?”",
    "• <b>YouTube</b> — search, playlists, bookmarks, cue. “find a focus playlist”, “bookmark that song”",
    "• <b>Money, learning, downtime</b> — budgeting, career and study plans, what to read or watch next",
    "• <b>Lists</b> — watchlist, readlist, travel, tasks, and more. “what's on my readlist?” · “connect Notion”",
    "• <b>Remembering</b> — tell me how the day went and I'll keep it",
    "",
    "/help if you want the longer version.",
  ].join("\n");
}

export function buildHelpMessage(): string {
  if (isMinimalMode()) {
    return [
      "<b>How to use me (minimal mode)</b>",
      "",
      "Write in plain English. Magnus is running a focused build: calendar, reminders, lists, YouTube, morning brief, workouts / Hevy, and conversation.",
      "",
      "<b>Calendar</b>",
      "“what does my day look like?” · “anything on Friday?” · “add dentist Tuesday 4pm” · “move gym to 8am”",
      "",
      "<b>Reminders</b>",
      "“remind me to … tomorrow at 8pm” · “what reminders do I have?” · “snooze that reminder”",
      "",
      "<b>Lists</b>",
      "“add Dune to my watchlist” · “what's on my readlist?” · “recommend something from my food list”",
      "",
      "<b>YouTube / music</b>",
      "“connect Google” · “search YouTube for lo-fi beats” · “add this to my Magnus playlist” · “bookmark that song”",
      "",
      "<b>Morning brief</b>",
      "“morning brief” for an on-demand push · or wait for the scheduled daily message",
      "",
      "<b>Training / Hevy</b>",
      "“should I train today?” · “review my last few workouts” · “hevy routine: …” when you want to log or create via Hevy",
      "",
      "<b>Parked for now</b>",
      "Meals, Notion, wealth/happiness/wisdom coaching, and project planning. Say what you need — I'll tell you if it's back yet.",
    ].join("\n");
  }

  return [
    "<b>How to use me</b>",
    "",
    "Write in plain English. I work out what you need — there is nothing to choose and no syntax to learn.",
    "",
    "<b>Calendar</b>",
    "“what does my day look like?” · “anything on Friday?” · “add dentist Tuesday 4pm” · “block two hours for deep work tomorrow morning”",
    "",
    "<b>Health</b>",
    "“log dinner: two rotis, paneer curry” · “should I train today? knees sore” · “review my last few workouts” · “rest day, slept badly” (I'll journal it)",
    "",
    "<b>Money</b>",
    "“I overspent on food this month, what now?” · “how should I think about my emergency fund?”",
    "",
    "<b>Learning and work</b>",
    "“plan how I learn Rust over two months” · “I want to move toward a staff role — where do I start?”",
    "",
    "<b>Downtime</b>",
    "“something short to read tonight” · “four days in Kerala, low effort — ideas?”",
    "",
    "<b>YouTube / music</b>",
    "“connect Google” · “search YouTube for lo-fi beats” · “add this to my Magnus playlist” · “bookmark that song” · “cue this for later”",
    "",
    "<b>Downtime and lists</b>",
    "“add Dune to my watchlist” · “what's on my readlist?” · “connect Notion” to mirror lists in your workspace",
    "",
    "<b>Anything worth remembering</b>",
    "Just tell me. “Decided to drop the side project” gets logged and comes back when it's relevant.",
  ].join("\n");
}

function isBareCommand(text: string, name: string): boolean {
  return new RegExp(`^/${name}(?:@\\S+)?\\s*$`, "i").test(text.trim());
}

export function isStartCommand(text: string): boolean {
  return isBareCommand(text, "start");
}

export function isHelpCommand(text: string): boolean {
  return isBareCommand(text, "help");
}
