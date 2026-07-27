import { afterEach, describe, expect, it } from "vitest";

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

  it("maps /hevy to HEALTH workouts", () => {
    const r = parseSlashCommand("/hevy routine: Push day");
    expect(r).toMatchObject({
      commandKey: "hevy",
      intent: "HEALTH",
      department: "workouts",
      payload: "routine: Push day",
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
  const original = process.env.MAGNUS_TELEGRAM_COMMANDS_MODE;

  function setMode(mode: string | undefined): void {
    if (mode === undefined) {
      delete process.env.MAGNUS_TELEGRAM_COMMANDS_MODE;
    } else {
      process.env.MAGNUS_TELEGRAM_COMMANDS_MODE = mode;
    }
  }

  afterEach(() => setMode(original));

  it("defaults to the core lanes, led by /menu and /help", () => {
    setMode(undefined);
    const names = getTelegramBotCommandsForRegistration().map((c) => c.command);
    expect(names.slice(0, 2)).toEqual(["menu", "help"]);
    expect(names).toContain("journal");
    expect(names).toContain("morningbrief");
    expect(names).not.toContain("culture");
  });

  it("registers menu, help, and meal only in minimal mode", () => {
    setMode("minimal");
    const names = getTelegramBotCommandsForRegistration().map((c) => c.command);
    expect(names).toEqual(["menu", "help", "meal"]);
  });

  it("registers every lane in full mode", () => {
    setMode("full");
    const names = getTelegramBotCommandsForRegistration().map((c) => c.command);
    expect(names).toHaveLength(TELEGRAM_BOT_COMMANDS.length + 2);
    for (const { command } of TELEGRAM_BOT_COMMANDS) {
      expect(names).toContain(command);
    }
  });

  it("never registers a duplicate command name", () => {
    for (const mode of ["minimal", "core", "full"]) {
      setMode(mode);
      const names = getTelegramBotCommandsForRegistration().map((c) => c.command);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it("registers at most 100 commands (Telegram setMyCommands limit)", () => {
    setMode("full");
    expect(getTelegramBotCommandsForRegistration().length).toBeLessThanOrEqual(100);
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
