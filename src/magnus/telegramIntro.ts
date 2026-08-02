/**
 * `/start` and `/help` — answered locally so a new chat never spends a model call.
 *
 * There are deliberately no other commands. Magnus is the whole interface: the user writes in
 * plain language and routing happens invisibly.
 */

export function buildStartMessage(): string {
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
    "• <b>Remembering</b> — tell me how the day went and I'll keep it",
    "",
    "/help if you want the longer version.",
  ].join("\n");
}

export function buildHelpMessage(): string {
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
