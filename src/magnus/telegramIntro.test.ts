import { describe, expect, it } from "vitest";

import { TELEGRAM_BOT_COMMANDS } from "../agents/routing/slashCommands.js";
import {
  buildHelpMessage,
  buildStartMessage,
  HELP_GROUPS,
  isHelpCommand,
  isMenuCommand,
  isStartCommand,
} from "./telegramIntro.js";

describe("command triggers", () => {
  it("matches bare commands, including @botname and trailing space", () => {
    expect(isStartCommand("/start")).toBe(true);
    expect(isStartCommand("  /Start  ")).toBe(true);
    expect(isHelpCommand("/help@magnus_bot")).toBe(true);
    expect(isMenuCommand("/menu ")).toBe(true);
  });

  it("ignores commands with a payload or unrelated text", () => {
    expect(isStartCommand("/start now")).toBe(false);
    expect(isHelpCommand("help me plan the week")).toBe(false);
    expect(isMenuCommand("/menus")).toBe(false);
  });
});

describe("/help", () => {
  it("covers every registered lane exactly once", () => {
    const grouped = HELP_GROUPS.flatMap((g) => g.commands);
    expect(new Set(grouped).size).toBe(grouped.length);

    const registered = TELEGRAM_BOT_COMMANDS.map((c) => c.command).sort();
    expect([...grouped].sort()).toEqual(registered);
  });

  it("renders each lane with its description", () => {
    const help = buildHelpMessage();
    for (const { command, description } of TELEGRAM_BOT_COMMANDS) {
      expect(help).toContain(`/${command} — ${description}`);
    }
    expect(help).toContain("/menu");
  });
});

describe("/start", () => {
  it("points at plain text, the menu, and help", () => {
    const start = buildStartMessage();
    expect(start).toContain("/menu");
    expect(start).toContain("/help");
  });
});
