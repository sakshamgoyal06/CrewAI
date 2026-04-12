import { describe, expect, it } from "vitest";

import {
  effectiveSlashUserMessage,
  getTelegramBotCommandsForRegistration,
  isSlashCommandKey,
  parseSlashCommand,
  TELEGRAM_BOT_COMMANDS,
} from "./slashCommands.js";

describe("parseSlashCommand", () => {
  it("maps /meal@Bot to HEALTH + nutrition with payload", () => {
    const r = parseSlashCommand("/meal@MagnusBot 2 eggs and toast");
    expect(r).toMatchObject({
      commandKey: "meal",
      intent: "HEALTH",
      department: "nutrition",
      payload: "2 eggs and toast",
      forceResearch: false,
    });
  });

  it("maps /invest to WEALTH investment", () => {
    const r = parseSlashCommand("/invest allocation drift");
    expect(r).toMatchObject({
      commandKey: "invest",
      intent: "WEALTH",
      department: "investment",
      payload: "allocation drift",
    });
  });

  it("maps /research to GENERAL + forceResearch", () => {
    const r = parseSlashCommand("/research");
    expect(r).toMatchObject({
      commandKey: "research",
      intent: "GENERAL",
      forceResearch: true,
    });
  });

  it("returns null for unknown /command", () => {
    expect(parseSlashCommand("/foobar hello")).toBeNull();
  });

  it("effectiveSlashUserMessage uses default when payload empty", () => {
    const r = parseSlashCommand("/plan");
    expect(r).not.toBeNull();
    expect(effectiveSlashUserMessage(r!).length).toBeGreaterThan(10);
  });
});

describe("TELEGRAM_BOT_COMMANDS", () => {
  it("lists unique command names", () => {
    const names = TELEGRAM_BOT_COMMANDS.map((c) => c.command);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("getTelegramBotCommandsForRegistration", () => {
  it("defaults to minimal menu (menu + meal)", () => {
    const old = process.env.MAGNUS_TELEGRAM_COMMANDS_MODE;
    delete process.env.MAGNUS_TELEGRAM_COMMANDS_MODE;
    const cmds = getTelegramBotCommandsForRegistration();
    expect(cmds.map((c) => c.command)).toEqual(["menu", "meal"]);
    process.env.MAGNUS_TELEGRAM_COMMANDS_MODE = old;
  });

  it("uses full list when MAGNUS_TELEGRAM_COMMANDS_MODE=full", () => {
    const old = process.env.MAGNUS_TELEGRAM_COMMANDS_MODE;
    process.env.MAGNUS_TELEGRAM_COMMANDS_MODE = "full";
    const cmds = getTelegramBotCommandsForRegistration();
    expect(cmds.length).toBe(TELEGRAM_BOT_COMMANDS.length);
    process.env.MAGNUS_TELEGRAM_COMMANDS_MODE = old;
  });
});

describe("isSlashCommandKey", () => {
  it("is true for mapped commands", () => {
    expect(isSlashCommandKey("culture")).toBe(true);
  });

  it("is false for morningbrief (handled separately in Telegram)", () => {
    expect(isSlashCommandKey("morningbrief")).toBe(false);
  });
});
